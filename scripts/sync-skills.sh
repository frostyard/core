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

: "${GH_TOKEN:?GH_TOKEN (ORG_PAT) is not configured}"

fail=0
for repo in $(jq -r '.repos | keys[]' "$CONFIG"); do
  mapfile -t skills < <(jq -r --arg r "$repo" '(.defaults + .repos[$r]) | unique | .[]' "$CONFIG")
  echo "== ${repo}: syncing ${skills[*]}"

  dir=$(mktemp -d)
  if ! git clone --quiet --depth 1 \
      "https://x-access-token:${GH_TOKEN}@github.com/frostyard/${repo}.git" "$dir"; then
    echo "::error::clone failed for frostyard/${repo}"
    fail=1
    continue
  fi

  # Some repos (chairlift, pilothouse) have .agents as a symlink to
  # docs/agents — resolve to the physical dir so git pathspecs match the
  # files, not the symlink.
  skills_root=$(realpath -m "${dir}/.agents")/skills
  rel_root=$(realpath -m --relative-to="$dir" "$skills_root")

  for skill in "${skills[@]}"; do
    src=".agents/skills/${skill}"
    if [ ! -d "$src" ]; then
      echo "::error::skills-sync.json names unknown skill '${skill}'"
      exit 1
    fi
    dst="${skills_root}/${skill}"
    mkdir -p "$dst"
    rsync -a --delete "$src/" "$dst/"
    # No commit SHA in the marker: a SHA would make every core commit dirty
    # every consumer (marker-only diff PRs). Provenance detail lives in the
    # sync commit message instead.
    printf 'Managed by frostyard/core — edit there, not here (ADR-0026).\nSource: https://github.com/frostyard/core/tree/main/.agents/skills/%s\n' \
      "$skill" > "$dst/.synced-from-core"
  done

  # Run the per-repo git/PR work in a subshell whose exit status we read
  # AFTER it finishes — `( ... ) || fail=1` would put the subshell in a
  # tested context, where bash suspends `set -e` and failures fall through.
  set +e
  (
    set -e
    cd "$dir"
    git add -A "$rel_root"
    if git diff --cached --quiet; then
      echo "== ${repo}: up to date"
      exit 0
    fi
    git checkout -q -B "$BRANCH"
    git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" \
      commit -q -m "chore: sync agent skills from frostyard/core@${SRC_SHA}"
    git push -qf origin "$BRANCH"
    # Check-then-create, with no fallback masking: a create failure (e.g.
    # token missing pull-requests:write) must fail the run loudly.
    existing=$(gh pr list --repo "frostyard/${repo}" --head "$BRANCH" --state open \
      --json number --jq '.[].number')
    if [ -n "$existing" ]; then
      echo "== ${repo}: PR #${existing} already open — branch force-updated"
    else
      gh pr create --repo "frostyard/${repo}" --head "$BRANCH" \
        --title "chore: sync agent skills from frostyard/core" \
        --body "$(printf 'Automated skill sync from [frostyard/core](https://github.com/frostyard/core) @ %s per [ADR-0026](https://github.com/frostyard/core/blob/main/docs/adr/0026-distribute-core-skills-via-sync-prs.md).\n\nSynced skills: %s\n\nThese directories are managed in core — edit them there, not here. Local edits are overwritten by the next sync.\n\nRisk tier: 1 — documentation/skills only, no code or workflow changes.' "$SRC_SHA" "${skills[*]}")"
    fi
    echo "== ${repo}: synced"
  )
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "::error::sync failed for frostyard/${repo}"
    fail=1
  fi
done

exit "$fail"
