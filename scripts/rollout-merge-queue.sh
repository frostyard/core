#!/usr/bin/env bash
# rollout-merge-queue.sh — apply core ADR-0042 (merge queue on the default branch)
# across repositories, one apply-repo-settings.sh run each, using each repository's
# CURRENT required checks from its live "frostyard: default branch" ruleset.
#
#   scripts/rollout-merge-queue.sh <owner/repo>... [--apply] [--allow-missing-merge-group]
#
# A merge queue only works when the required checks also run on `merge_group`
# events; a repository whose pull_request-triggered workflows lack that trigger is
# SKIPPED (reported, not applied) unless --allow-missing-merge-group is given —
# enabling the queue before CI runs on it would stall every entry until the
# check timeout. Dry run by default; --apply is passed through to
# apply-repo-settings.sh. Requires gh (authenticated as an admin of the repos) and jq.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
apply=0 allow_missing=0 repos=()
for arg in "$@"; do
  case "$arg" in
    --apply) apply=1 ;;
    --allow-missing-merge-group) allow_missing=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) repos+=("$arg") ;;
  esac
done
[[ ${#repos[@]} -gt 0 ]] || { echo "usage: $0 <owner/repo>... [--apply] [--allow-missing-merge-group]" >&2; exit 2; }

status=0
for repo in "${repos[@]}"; do
  echo "== $repo"
  # 1. Workflows that run on pull_request but not on merge_group.
  missing=()
  while IFS= read -r name; do
    [[ -n $name ]] || continue
    body="$(gh api "repos/$repo/contents/.github/workflows/$name" --jq .content 2>/dev/null | base64 -d || true)"
    if grep -qE '^\s*pull_request(_target)?\s*:' <<<"$body" && ! grep -qE '^\s*merge_group\s*:' <<<"$body"; then
      missing+=("$name")
    fi
  done < <(gh api "repos/$repo/contents/.github/workflows" --jq '.[].name' 2>/dev/null || true)
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "  workflows on pull_request without merge_group: ${missing[*]}"
    if [[ $allow_missing -eq 0 ]]; then
      echo "  SKIP: add 'merge_group:' to those workflows (PR-only jobs may succeed trivially on merge_group) and re-run, or pass --allow-missing-merge-group"
      status=1; continue
    fi
  fi
  # 2. Current required checks from the live ruleset; the contract does not pin names.
  ruleset_id="$(gh api "repos/$repo/rulesets?per_page=100" --jq '[.[] | select(.target=="branch" and .name=="frostyard: default branch")] | .[0].id // empty')"
  if [[ -z $ruleset_id ]]; then
    echo "  SKIP: no 'frostyard: default branch' ruleset yet — run apply-repo-settings.sh with --required-checks first"; status=1; continue
  fi
  mapfile -t checks < <(gh api "repos/$repo/rulesets/$ruleset_id" --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context')
  if [[ ${#checks[@]} -eq 0 ]]; then
    echo "  SKIP: the ruleset has no required checks — pass them explicitly through apply-repo-settings.sh"; status=1; continue
  fi
  args=("$repo")
  [[ $apply -eq 1 ]] && args+=(--apply)
  for c in "${checks[@]}"; do args+=(--required-check "$c"); done
  echo "  required checks: ${checks[*]}"
  "$here/apply-repo-settings.sh" "${args[@]}"
done
exit $status
