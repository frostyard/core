#!/usr/bin/env bash
# Sync core-managed agent skills into consuming repos as PRs (ADR-0026).
#
# Config: .github/skills-sync.json
#   { "defaults": ["<skill>", ...],
#     "groups": { "<group>": ["<skill>", ...] },
#     "repos": { "<repo>": ["<extra skill>", ...] } }
# Each repo receives defaults + its extras, mirrored into .agents/skills/<name>/
# with a .synced-from-core marker. Only the managed skill dirs are touched —
# repo-local skills are never modified or deleted.
# A name written "@<group>" in defaults or a repo entry expands to that entry
# of "groups"; an unknown group stops the run before any clone. A group holds
# skill names only — it does not nest another "@" name.
#
# Requires: GH_TOKEN with repo scope across the org (the ORG_PAT secret).
set -euo pipefail

CONFIG=.github/skills-sync.json
SRC_SHA=$(git rev-parse --short HEAD)
BRANCH=chore/sync-core-skills
GIT_NAME="frostyard-core[bot]"
GIT_EMAIL="core@frostyard.invalid"

: "${GH_TOKEN:?GH_TOKEN (ORG_PAT) is not configured}"
export GH_TOKEN

SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/skills-sync-repo.sh
source "${SELF_DIR}/lib/skills-sync-repo.sh"

# resolve_skills <repo>: print the repo's effective skill names, one per line.
# A group name is replaced by its skills before the deduplication; the
# unknown-skill check in scripts/lib/skills-sync-repo.sh then rejects any name
# that is absent under core's .agents/skills/ — a nested "@" name included.
resolve_skills() {
  jq -r --arg r "$1" '
    . as $c
    | (($c.defaults // []) + ($c.repos[$r] // []))
    | map(
        if startswith("@") then
          ltrimstr("@") as $name
          # \u0027 is the single quote of the error message.
          | if ($c.groups // {}) | has($name) then $c.groups[$name]
            else error("skills-sync.json names unknown skill group \u0027@\($name)\u0027")
            end
        else .
        end
      )
    | flatten
    | unique
    | .[]
  ' "$CONFIG"
}

# A command substitution under set -e: a malformed config stops the run.
repo_list=$(jq -r '.repos | keys[]' "$CONFIG")
repos=()
if [ -n "$repo_list" ]; then
  mapfile -t repos <<<"$repo_list"
fi

# Resolve every repository before the first clone, so that an unknown group
# anywhere stops the run with nothing pushed. Use a command substitution, not
# a process substitution: bash discards the exit status of a process
# substitution, so a jq failure would go unnoticed.
declare -A skill_lists=()
for repo in "${repos[@]}"; do
  if ! skill_lists[$repo]=$(resolve_skills "$repo"); then
    echo "::error::cannot resolve the skills for frostyard/${repo}" >&2
    exit 1
  fi
done

fail=0
for repo in "${repos[@]}"; do
  skills=()
  if [ -n "${skill_lists[$repo]}" ]; then
    mapfile -t skills <<<"${skill_lists[$repo]}"
  fi
  echo "== ${repo}: syncing ${skills[*]}"

  if skills_sync_run_repo "$repo" "$PWD" "$BRANCH" "$SRC_SHA" "$GIT_NAME" "$GIT_EMAIL" "${skills[@]}"; then
    continue
  fi
  rc=$?
  if [ "$rc" -eq 2 ]; then
    exit 1
  fi
  fail=1
done

exit "$fail"
