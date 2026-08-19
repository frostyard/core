#!/usr/bin/env bash
# Apply the repository settings contract (organization/contracts/repository-settings/v1.json,
# ADR-0040) to one GitHub repository through the GitHub API. Human-run, idempotent,
# dry-run by default: it prints every change it would make and makes none until
# --apply is given. Snowcat proposes drift; a person runs this.
#
#   scripts/apply-repo-settings.sh <owner/repo> [--apply]
#       [--required-checks "<ctx>[,<ctx>...]"] [--required-check "<ctx>"]...
#       [--checks-app-id <id>] [--no-rulesets] [--contract <path>]
#
#   --required-checks   The status-check contexts the default-branch ruleset must
#                       require (the contract does not carry per-repository names),
#                       comma-separated. Required to create/repair the default-branch
#                       ruleset unless --no-rulesets. Example: "check (node 24),check (node 26)".
#   --required-check    One exact context, repeatable; use it for names that contain
#                       a comma (matrix jobs such as "Build (linux, amd64)"). Combines
#                       with --required-checks. Preflight: a name that no PR produces
#                       makes GitHub wait forever, so compare with `gh pr checks`.
#   --checks-app-id     GitHub App integration ID that produces the checks
#                       (default 15368 = GitHub Actions).
#   --no-rulesets       Skip the default-branch and tag rulesets.
#   --contract          Contract file (default: the one in this checkout).
#
# Requires: gh (authenticated with admin on the repository), jq. Exit 0 when the
# repository already matches; every applied change is printed. Never deletes a
# ruleset it did not create; never touches settings the contract does not name.
set -euo pipefail

usage() { sed -n '2,20p' "$0" >&2; exit 2; }

repo="" apply=0 checks="" app_id=15368 rulesets=1 contract=""
declare -a single_checks=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) apply=1; shift ;;
    --required-checks) checks="$2"; shift 2 ;;
    --required-check) single_checks+=("$2"); shift 2 ;;
    --checks-app-id) app_id="$2"; shift 2 ;;
    --no-rulesets) rulesets=0; shift ;;
    --contract) contract="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "unknown flag: $1" >&2; usage ;;
    *) if [[ -z $repo ]]; then repo="$1"; else usage; fi; shift ;;
  esac
done
[[ -n $repo && $repo == */* ]] || usage
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
contract="${contract:-$here/organization/contracts/repository-settings/v1.json}"
[[ -f $contract ]] || { echo "contract not found: $contract" >&2; exit 1; }
command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

changes=0
say() { printf '%s\n' "$*"; }
plan() { # plan <label> <gh api args...>: print, and run only with --apply
  local label="$1"; shift
  changes=$((changes + 1))
  if [[ $apply -eq 1 ]]; then
    say "APPLY  $label"
    gh api "$@" >/dev/null
  else
    say "WOULD  $label"
  fi
}
want() { jq -r "$1" "$contract"; }

# ---- 1. Repository object: merge hygiene, features -------------------------
live="$(gh api "repos/$repo")"
default_branch="$(jq -r .default_branch <<<"$live")"
patch='{}'
for key in delete_branch_on_merge allow_update_branch allow_auto_merge allow_merge_commit allow_squash_merge allow_rebase_merge merge_commit_title merge_commit_message squash_merge_commit_title squash_merge_commit_message has_wiki has_projects has_issues web_commit_signoff_required; do
  expected="$(want ".repository.$key")"
  observed="$(jq -r ".$key" <<<"$live")"
  if [[ $expected != "$observed" ]]; then
    say "  $key: $observed -> $expected"
    patch="$(jq --arg k "$key" --argjson v "$(jq ".repository.$key" "$contract")" '.[$k]=$v' <<<"$patch")"
  fi
done
# security features that live on the repository object
sec_patch='{}'
for pair in "secret_scanning:secret_scanning" "secret_scanning_push_protection:secret_scanning_push_protection" "dependabot_security_updates:dependabot_security_updates"; do
  ckey="${pair%%:*}"; gkey="${pair##*:}"
  expected="$(want ".security.$ckey")"
  status="$(jq -r ".security_and_analysis.$gkey.status // \"unknown\"" <<<"$live")"
  desired=$([[ $expected == true ]] && echo enabled || echo disabled)
  if [[ $status != "$desired" ]]; then
    say "  security_and_analysis.$gkey: $status -> $desired"
    sec_patch="$(jq --arg k "$gkey" --arg s "$desired" '.[$k]={status:$s}' <<<"$sec_patch")"
  fi
done
if [[ $sec_patch != '{}' ]]; then patch="$(jq --argjson s "$sec_patch" '.security_and_analysis=$s' <<<"$patch")"; fi
if [[ $patch != '{}' ]]; then
  plan "PATCH repos/$repo $(jq -c . <<<"$patch")" -X PATCH "repos/$repo" --input - <<<"$patch"
fi

# ---- 2. Metadata: topics (license and description are reported, not written) --
for topic in $(want '.metadata.topics_include[]'); do
  if ! jq -e --arg t "$topic" '.topics | index($t)' <<<"$live" >/dev/null; then
    plan "PUT repos/$repo/topics += $topic" -X PUT "repos/$repo/topics" --input - <<<"$(jq -c --arg t "$topic" '{names: (.topics + [$t] | unique)}' <<<"$live")"
    live="$(jq --arg t "$topic" '.topics += [$t]' <<<"$live")"
  fi
done
if [[ $(want .metadata.license_required) == true && $(jq -r '.license.spdx_id // empty' <<<"$live") == "" ]]; then
  say "  NOTE  no license detected; add a LICENSE file through a pull request (not applied by this script)"
fi
if [[ $(want .metadata.description_required) == true && $(jq -r '.description // empty' <<<"$live") == "" ]]; then
  say "  NOTE  description is empty; set one in repository settings (not applied by this script)"
fi

# ---- 3. Actions token permissions ------------------------------------------
wf="$(gh api "repos/$repo/actions/permissions/workflow")"
w_perm="$(want .actions.default_workflow_permissions)"; w_approve="$(want .actions.can_approve_pull_request_reviews)"
if [[ $(jq -r .default_workflow_permissions <<<"$wf") != "$w_perm" || $(jq -r .can_approve_pull_request_reviews <<<"$wf") != "$w_approve" ]]; then
  plan "PUT repos/$repo/actions/permissions/workflow {default_workflow_permissions:$w_perm, can_approve_pull_request_reviews:$w_approve}" \
    -X PUT "repos/$repo/actions/permissions/workflow" --input - <<<"{\"default_workflow_permissions\":\"$w_perm\",\"can_approve_pull_request_reviews\":$w_approve}"
fi

# ---- 4. Vulnerability alerts, private vulnerability reporting --------------
# 204 = enabled, 404 = disabled; gh exits non-zero on the 404, which is an answer here, not a failure.
alerts_status="$({ gh api -i "repos/$repo/vulnerability-alerts" 2>/dev/null || true; } | head -1 | awk '{print $2}')"
if [[ $(want .security.vulnerability_alerts) == true && $alerts_status != 204 ]]; then
  plan "PUT repos/$repo/vulnerability-alerts" -X PUT "repos/$repo/vulnerability-alerts"
elif [[ $(want .security.vulnerability_alerts) == false && $alerts_status == 204 ]]; then
  plan "DELETE repos/$repo/vulnerability-alerts" -X DELETE "repos/$repo/vulnerability-alerts"
fi
if [[ $(jq -r .visibility <<<"$live") != private ]]; then
  pvr="$(gh api "repos/$repo/private-vulnerability-reporting" --jq .enabled 2>/dev/null || echo unknown)"
  if [[ $(want .security.private_vulnerability_reporting) == true && $pvr != true ]]; then
    plan "PUT repos/$repo/private-vulnerability-reporting" -X PUT "repos/$repo/private-vulnerability-reporting"
  fi
fi

# ---- 5. Rulesets: default branch and tags -----------------------------------
if [[ $rulesets -eq 1 ]]; then
  existing="$(gh api "repos/$repo/rulesets?per_page=100")"
  branch_id="$(jq -r '[.[] | select(.target=="branch" and .name=="frostyard: default branch")] | .[0].id // empty' <<<"$existing")"
  tag_id="$(jq -r '[.[] | select(.target=="tag" and .name=="frostyard: release tags")] | .[0].id // empty' <<<"$existing")"

  if [[ -z $checks && ${#single_checks[@]} -eq 0 ]]; then
    say "  NOTE  --required-checks not given; the default-branch ruleset needs the repository's check names — skipping the branch ruleset (tag ruleset still applied)"
  else
    # Comma-separated list plus exact single names (which may contain commas), deduplicated in order.
    checks_json="$(jq -cn --arg s "$checks" --argjson app "$app_id" \
      --args '[($s | split(",")), $ARGS.positional] | add | map(gsub("^\\s+|\\s+$";"")) | map(select(length>0)) | unique_by(.) | map({context: ., integration_id: $app})' \
      -- "${single_checks[@]}")"
    branch_rules="$(jq -cn --argjson checks "$checks_json" \
      --argjson approvals "$(want .default_branch_ruleset.required_approving_review_count)" \
      --argjson threads "$(want .default_branch_ruleset.require_conversation_resolution)" \
      --argjson strict "$(want .default_branch_ruleset.strict_required_status_checks)" '
      [ {type:"deletion"}, {type:"non_fast_forward"},
        {type:"pull_request", parameters:{required_approving_review_count:$approvals, dismiss_stale_reviews_on_push:false, require_code_owner_review:false, require_last_push_approval:false, required_review_thread_resolution:$threads}},
        {type:"required_status_checks", parameters:{strict_required_status_checks_policy:$strict, do_not_enforce_on_create:false, required_status_checks:$checks}} ]')"
    branch_body="$(jq -cn --argjson rules "$branch_rules" '{name:"frostyard: default branch", target:"branch", enforcement:"active", bypass_actors:[], conditions:{ref_name:{include:["~DEFAULT_BRANCH"], exclude:[]}}, rules:$rules}')"
    if [[ -z $branch_id ]]; then
      plan "POST repos/$repo/rulesets (default branch: PR required, $(jq length <<<"$checks_json") required checks, no deletion/force push)" -X POST "repos/$repo/rulesets" --input - <<<"$branch_body"
    else
      current="$(gh api "repos/$repo/rulesets/$branch_id" | jq -c '{enforcement, bypass_actors, conditions, rules: [.rules[] | {type, parameters}]}')"
      desired="$(jq -c '{enforcement, bypass_actors, conditions, rules: [.rules[] | {type, parameters}]}' <<<"$branch_body")"
      if [[ $current != "$desired" ]]; then
        plan "PUT repos/$repo/rulesets/$branch_id (default branch ruleset repaired)" -X PUT "repos/$repo/rulesets/$branch_id" --input - <<<"$branch_body"
      fi
    fi
  fi

  tag_pattern="$(want .tag_ruleset.pattern)"
  tag_rules="$(jq -cn --argjson del "$(want .tag_ruleset.block_deletions)" --argjson ff "$(want .tag_ruleset.block_force_pushes)" --argjson create "$(want .tag_ruleset.restrict_creation)" '
    [ (if $del then {type:"deletion"} else empty end), (if $ff then {type:"non_fast_forward"} else empty end), (if $create then {type:"creation"} else empty end) ]')"
  tag_body="$(jq -cn --arg p "refs/tags/$tag_pattern" --argjson rules "$tag_rules" '{name:"frostyard: release tags", target:"tag", enforcement:"active", bypass_actors:[{actor_id:5, actor_type:"RepositoryRole", bypass_mode:"always"}], conditions:{ref_name:{include:[$p], exclude:[]}}, rules:$rules}')"
  # The tag ruleset bypasses repository admins (role 5) so `make bump` by a maintainer still creates the tag; nobody else can.
  if [[ -z $tag_id ]]; then
    plan "POST repos/$repo/rulesets (tags $tag_pattern: no deletion/force update, creation restricted to admins)" -X POST "repos/$repo/rulesets" --input - <<<"$tag_body"
  else
    current="$(gh api "repos/$repo/rulesets/$tag_id" | jq -c '{enforcement, conditions, rules: [.rules[] | {type}]}')"
    desired="$(jq -c '{enforcement, conditions, rules: [.rules[] | {type}]}' <<<"$tag_body")"
    if [[ $current != "$desired" ]]; then
      plan "PUT repos/$repo/rulesets/$tag_id (tag ruleset repaired)" -X PUT "repos/$repo/rulesets/$tag_id" --input - <<<"$tag_body"
    fi
  fi

  if gh api "repos/$repo/branches/$default_branch/protection" >/dev/null 2>&1; then
    say "  NOTE  classic branch protection is present on $default_branch; the contract wants it absent — remove it in Settings > Branches (not applied by this script)"
  fi
fi

# ---- 6. Labels --------------------------------------------------------------
labels="$(gh api "repos/$repo/labels?per_page=100" --jq '[.[].name | ascii_downcase]')"
for label in $(want '.labels.required[]'); do
  if ! jq -e --arg l "${label,,}" 'index($l)' <<<"$labels" >/dev/null; then
    plan "POST repos/$repo/labels $label" -X POST "repos/$repo/labels" -f name="$label" -f color="0e8a16" -f description="Queued for the Snowcat fleet"
  fi
done

if [[ $changes -eq 0 ]]; then
  say "$repo already matches the repository settings contract."
elif [[ $apply -eq 0 ]]; then
  say "$changes change(s) planned for $repo; re-run with --apply to make them."
else
  say "$changes change(s) applied to $repo."
fi
