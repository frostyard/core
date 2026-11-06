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
# Requires: GH_TOKEN with Contents and Pull requests write access to the
# configured consumers only (the SKILLS_SYNC_TOKEN secret).
set -euo pipefail

CONFIG=.github/skills-sync.json
SRC_SHA=$(git rev-parse --short HEAD)
BRANCH=chore/sync-core-skills
GIT_NAME="frostyard-core[bot]"
GIT_EMAIL="core@frostyard.invalid"

: "${GH_TOKEN:?GH_TOKEN (SKILLS_SYNC_TOKEN) is not configured}"
export GH_TOKEN

SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/skills-sync-repo.sh
source "${SELF_DIR}/lib/skills-sync-repo.sh"

# Config preflight: the shape is validated before any skill list is resolved
# and before the first clone, so a malformed config stops the run with a named
# problem instead of a jq error status (4 for bad JSON, 5 for a jq error).
# The file must hold exactly 1 JSON document (jq -s: an empty file or a stream
# of objects is refused). A group value must be an array of skill names and may
# not name another group.
problem=$(jq -rs '
  def is_skill_list: type == "array" and all(.[]; type == "string");
  def bad_repo: (.repos | to_entries[] | select(.value | is_skill_list | not) | .key);
  def bad_group: ((.groups // {}) | to_entries[] | select(.value | is_skill_list | not) | .key);
  def nested: ((.groups // {}) | [.[] | .[] | select(startswith("@"))] | first);

  if length != 1 then "the config must hold exactly 1 JSON document, not \(length)"
  else .[0] |
  if type != "object" then "the config must be a JSON object"
  elif (.defaults | is_skill_list | not) then "\"defaults\" must be an array of skill names"
  elif ((.repos | type) != "object") then "\"repos\" must be an object keyed by repository slug"
  elif ([bad_repo] | length) > 0 then "\"repos.\([bad_repo] | first)\" must be an array of skill names"
  elif ((.groups != null) and ((.groups | type) != "object")) then "\"groups\" must be an object keyed by group name"
  elif ([bad_group] | length) > 0 then "\"groups.\([bad_group] | first)\" must be an array of skill names"
  elif (nested != null) then "a skill group must not name another group (\(nested))"
  else "" end
  end
' "$CONFIG" 2>/dev/null) || {
  echo "::error::cannot read ${CONFIG} as JSON" >&2
  exit 1
}
if [ -n "$problem" ]; then
  echo "::error::${CONFIG}: ${problem}" >&2
  exit 1
fi

# resolve_skills <repo>: print the repo's effective skill names, one per line.
# A group name is replaced by its skills before the deduplication; the
# unknown-skill check in scripts/lib/skills-sync-repo.sh then rejects any name
# that is absent under core's .agents/skills/ (the preflight already rejected a
# group that names another group).
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

# A command substitution with an explicit status check: a malformed config
# stops the run with its own message, never jq's status.
if ! repo_list=$(jq -r '.repos | keys[]' "$CONFIG" 2>/dev/null); then
  echo "::error::cannot read the repository list from ${CONFIG}" >&2
  exit 1
fi
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
  # An empty effective list mirrors nothing: an empty string here would
  # resolve to the whole .agents/skills tree. Report the consumer unchanged
  # rather than clone it.
  if [ "${#skills[@]}" -eq 0 ]; then
    echo "== ${repo}: up to date"
    continue
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
