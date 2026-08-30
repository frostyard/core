#!/usr/bin/env bash
# Sync core-managed agent skills into consuming repos as PRs (ADR-0026).
#
# Config: .github/skills-sync.json
#   { "defaults": ["<skill>", ...], "repos": { "<repo>": ["<extra skill>", ...] } }
# Each repo receives defaults + its extras, mirrored into .agents/skills/<name>/
# with a .synced-from-core marker. Only the managed skill dirs are touched —
# repo-local skills are never modified or deleted.
#
# Requires: GH_TOKEN with repo scope across the org (the ORG_PAT secret).
set -euo pipefail

CONFIG=.github/skills-sync.json
SRC_SHA=$(git rev-parse --short HEAD)
BRANCH=chore/sync-core-skills
GIT_NAME="frostyard-core[bot]"
GIT_EMAIL="core@frostyard.invalid"

SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/skills-sync-repo.sh
source "${SELF_DIR}/lib/skills-sync-repo.sh"

# Least privilege: the workflow hands us the org-wide ORG_PAT exported as
# GH_TOKEN, which every descendant would otherwise inherit. Capture it into
# a private shell variable and unset it here, before the first subprocess
# runs, so the jq calls below and the mktemp/realpath/mkdir/rsync/printf
# work inside the sync see no credential. skills_sync_authenticated
# re-supplies it to the git clone/push and gh calls that authenticate.
# Fails closed when GH_TOKEN is not configured.
skills_sync_capture_token

fail=0
for repo in $(jq -r '.repos | keys[]' "$CONFIG"); do
  mapfile -t skills < <(jq -r --arg r "$repo" '(.defaults + .repos[$r]) | unique | .[]' "$CONFIG")
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
