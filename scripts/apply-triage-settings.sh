#!/usr/bin/env bash
# Apply the triage settings of one GitHub repository through the GitHub API:
# the required status checks on its default branch and the level labels. Human-run,
# idempotent, dry-run by default: it prints every change it would make and makes
# none until --apply is given. A bot account runs the dry run; an organization
# admin runs --apply.
#
#   scripts/apply-triage-settings.sh OWNER/REPO [--required-check NAME]...
#       [--required-check-any NAME]... [--merge-queue] [--apply]
#
#   --required-check      One exact status-check context, repeatable, that GitHub
#                         Actions (app 15368) must report. Use it for names that
#                         contain a comma. The names go in the repository ruleset
#                         "frostyard: required checks" (the only ruleset this
#                         script writes; it never changes or deletes another one).
#   --required-check-any  Like --required-check, but any app may report the context
#                         (no integration_id).
#   --merge-queue         Also set strict_required_status_checks_policy and add the
#                         merge_queue rule (ADR-0042). Before any change, a queue
#                         preflight refuses the run when the repository is not
#                         organization-owned, or when a workflow that reports a
#                         required check (found from the runs at the head of the last
#                         merged pull request) has no `merge_group` trigger.
#                         Needs at least one required name.
#   --apply               Make the changes. Without it, print each as
#                         "WOULD  <METHOD> <endpoint> (<reason>)" and its JSON body.
#
# Without a required name the script changes no ruleset (it prints a NOTE) and only
# creates the missing labels level:L1 to level:L4 (existing labels are never changed).
# Exit codes: 0 success, 1 a refusal or an error, 2 a usage error.
# Requires: gh (admin on the repository for --apply), jq, node (the trigger helper).
set -euo pipefail

usage() { sed -n '2,31p' "$0" >&2; exit 2; }

RULESET_NAME="frostyard: required checks"
ACTIONS_APP_ID=15368

repo="" apply=0 merge_queue=0
declare -a required=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) apply=1; shift ;;
    --merge-queue) merge_queue=1; shift ;;
    --required-check) [[ $# -ge 2 && -n $2 ]] || usage; required+=("A:$2"); shift 2 ;;
    --required-check-any) [[ $# -ge 2 && -n $2 ]] || usage; required+=("N:$2"); shift 2 ;;
    -h|--help) usage ;;
    -*) echo "unknown flag: $1" >&2; usage ;;
    *) if [[ -z $repo ]]; then repo="$1"; else usage; fi; shift ;;
  esac
done
[[ -n $repo && $repo == */* ]] || usage
if [[ $merge_queue -eq 1 && ${#required[@]} -eq 0 ]]; then
  echo "--merge-queue needs at least one --required-check or --required-check-any" >&2
  usage
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }

changes=0
say() { printf '%s\n' "$*"; }
refuse() { printf 'REFUSED  %s\n' "$*" >&2; }
plan() { # plan <METHOD> <endpoint> <reason> <json body>: print, and call only with --apply
  local method="$1" endpoint="$2" reason="$3" body="$4"
  changes=$((changes + 1))
  if [[ $apply -eq 1 ]]; then
    say "APPLY  $method $endpoint ($reason)"
  else
    say "WOULD  $method $endpoint ($reason)"
  fi
  jq . <<<"$body"
  if [[ $apply -eq 1 ]]; then
    gh api -X "$method" "$endpoint" --input - <<<"$body" >/dev/null
  fi
}

live="$(gh api "repos/$repo")"
default_branch="$(jq -r .default_branch <<<"$live")"
owner_type="$(jq -r .owner.type <<<"$live")"

required_json='[]'
if [[ ${#required[@]} -gt 0 ]]; then
  # Keep the argument order; drop exact duplicates.
  required_json="$(jq -cn --argjson app "$ACTIONS_APP_ID" --args '
    $ARGS.positional | map({kind: .[0:1], name: .[2:]})
    | map(if .kind == "A" then {context: .name, integration_id: $app} else {context: .name} end)
    | reduce .[] as $e ([]; if index([$e]) then . else . + [$e] end)' -- "${required[@]}")"
fi

# ---- 1. Queue preflight (only with --merge-queue; refuses before any change) --
if [[ $merge_queue -eq 1 ]]; then
  failures=0
  fail() { refuse "$*"; failures=$((failures + 1)); }

  if [[ $owner_type != Organization ]]; then
    fail "$repo is owned by a $owner_type account; a merge queue needs an organization-owned repository"
  else
    base_q="$(jq -rn --arg b "$default_branch" '$b | @uri')"
    sha=""
    if pulls="$(gh api "repos/$repo/pulls?state=closed&base=$base_q&sort=updated&direction=desc&per_page=50" 2>&1)"; then
      sha="$(jq -r '[.[] | select(.merged_at != null)] | sort_by(.merged_at) | last | .head.sha // empty' <<<"$pulls")"
    else
      fail "cannot list the closed pull requests of $repo: $(head -c 200 <<<"$pulls")"
    fi
    if [[ -z $sha && $failures -eq 0 ]]; then
      fail "$repo has no merged pull request on $default_branch; the preflight reads the workflow runs at its head and has none to read"
    fi

    if [[ -n $sha ]]; then
      # Every job that ran at that head: [{path, name}].
      jobs_json='[]'
      if runs="$(gh api "repos/$repo/actions/runs?head_sha=$sha&per_page=100" 2>&1)"; then
        while IFS=$'\t' read -r run_id run_path; do
          [[ -n $run_id ]] || continue
          if run_jobs="$(gh api "repos/$repo/actions/runs/$run_id/jobs?per_page=100" 2>&1 </dev/null)"; then
            jobs_json="$(jq -c --arg p "${run_path%%@*}" --argjson j "$(jq -c '[.jobs[].name]' <<<"$run_jobs")" '. + ($j | map({path: $p, name: .}))' <<<"$jobs_json")"
          else
            fail "cannot read the jobs of workflow run $run_id: $(head -c 200 <<<"$run_jobs")"
          fi
        done < <(jq -r '.workflow_runs | unique_by(.id)[] | [.id, .path] | @tsv' <<<"$runs")
      else
        fail "cannot list the workflow runs at $sha: $(head -c 200 <<<"$runs")"
      fi

      declare -A wf_has_queue=()
      while IFS= read -r name; do
        [[ -n $name ]] || continue
        paths="$(jq -r --arg n "$name" '[.[] | select(.name == $n) | .path] | unique[]' <<<"$jobs_json")"
        if [[ -z $paths ]]; then
          fail "required check \"$name\" matches no job of the workflow runs at $sha; check the exact name (a --required-check-any name that no Actions job reports cannot be checked either)"
          continue
        fi
        while IFS= read -r path; do
          if [[ -z ${wf_has_queue[$path]:-} ]]; then
            if text="$(gh api -H 'Accept: application/vnd.github.raw' "repos/$repo/contents/$path?ref=$default_branch" 2>&1 </dev/null)"; then
              rc=0
              printf '%s\n' "$text" | node "$here/scripts/lib/workflow-triggers.mjs" merge_group || rc=$?
              case $rc in 0) wf_has_queue[$path]=yes ;; 1) wf_has_queue[$path]=no ;; *) wf_has_queue[$path]=error ;; esac
            else
              wf_has_queue[$path]=error
              fail "cannot read $path at $default_branch of $repo: $(head -c 200 <<<"$text")"
            fi
          fi
          case ${wf_has_queue[$path]} in
            yes) say "  preflight: $name -> $path (merge_group: yes)" ;;
            no) fail "required check \"$name\" is reported by $path, which has no merge_group trigger under on: (a queued pull request would wait forever)" ;;
          esac
        done <<<"$paths"
      done < <(jq -r 'map(.context) | unique[]' <<<"$required_json")
    fi
  fi
  if [[ $failures -gt 0 ]]; then
    echo "queue preflight failed for $repo ($failures problem(s)); nothing was changed" >&2
    exit 1
  fi
fi

# ---- 2. Ruleset "frostyard: required checks" --------------------------------
if [[ ${#required[@]} -eq 0 ]]; then
  say "  NOTE  no --required-check or --required-check-any given; the ruleset \"$RULESET_NAME\" is not touched (labels still applied)"
else
  body="$(jq -cn --argjson checks "$required_json" --arg name "$RULESET_NAME" --argjson queue "$([[ $merge_queue -eq 1 ]] && echo true || echo false)" '
    {name:$name, target:"branch", enforcement:"active", bypass_actors:[],
     conditions:{ref_name:{include:["~DEFAULT_BRANCH"], exclude:[]}},
     rules: ([ {type:"required_status_checks", parameters:{strict_required_status_checks_policy:$queue, do_not_enforce_on_create:false, required_status_checks:$checks}} ]
       + (if $queue then [ {type:"merge_queue", parameters:{merge_method:"SQUASH", grouping_strategy:"ALLGREEN", max_entries_to_build:5, min_entries_to_merge:1, max_entries_to_merge:5, min_entries_to_merge_wait_minutes:0, check_response_timeout_minutes:60}} ] else [] end))}')"
  existing="$(gh api "repos/$repo/rulesets?includes_parents=false&per_page=100")"
  # Only a repository-level branch ruleset of exactly this name is ours.
  ruleset_id="$(jq -r --arg n "$RULESET_NAME" '[.[] | select(.name == $n and .target == "branch" and ((.source_type // "Repository") == "Repository"))] | .[0].id // empty' <<<"$existing")"
  if [[ -z $ruleset_id ]]; then
    plan POST "repos/$repo/rulesets" "create the required-checks ruleset: $(jq length <<<"$required_json") check(s)$([[ $merge_queue -eq 1 ]] && echo ', merge queue')" "$body"
  else
    # Compare what matters: checks sorted by context, a missing integration_id equal to null, rules sorted by type.
    norm='{enforcement, bypass_actors: (.bypass_actors // []), conditions,
      rules: ([.rules[] | {type, parameters: (.parameters // null)}]
        | map(if .type == "required_status_checks" then .parameters.required_status_checks |= (map({context, integration_id: (.integration_id // null)}) | sort_by(.context, .integration_id)) else . end)
        | sort_by(.type))}'
    current="$(gh api "repos/$repo/rulesets/$ruleset_id" | jq -S -c "$norm")"
    desired="$(jq -S -c "$norm" <<<"$body")"
    if [[ $current != "$desired" ]]; then
      plan PUT "repos/$repo/rulesets/$ruleset_id" "repair the required-checks ruleset" "$body"
    fi
  fi
fi

# ---- 3. Level labels (missing ones only; an existing label is never changed) --
existing_labels="$(gh api "repos/$repo/labels?per_page=100" --jq '[.[].name | ascii_downcase]')"
while IFS='|' read -r label color description; do
  if ! jq -e --arg l "${label,,}" 'index($l)' <<<"$existing_labels" >/dev/null; then
    plan POST "repos/$repo/labels" "create label $label" "$(jq -cn --arg n "$label" --arg c "$color" --arg d "$description" '{name:$n, color:$c, description:$d}')"
  fi
done <<'LABELS'
level:L1|B60205|Read every line
level:L2|D93F0B|Read the diff
level:L3|FBCA04|Skim
level:L4|0E8A16|Title and CI
LABELS

if [[ $changes -eq 0 ]]; then
  say "$repo already matches."
elif [[ $apply -eq 0 ]]; then
  say "$changes change(s) planned for $repo; re-run with --apply to make them."
else
  say "$changes change(s) applied to $repo."
fi
