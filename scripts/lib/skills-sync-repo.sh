#!/usr/bin/env bash
# Per-repo sync orchestration for scripts/sync-skills.sh (ADR-0026).
set -euo pipefail

# Resolve enough of this library's location to load its siblings using shell
# expansion only. Direct callers may source this file while GH_TOKEN is still
# exported, so no source-time child may run before the function captures it.
SKILLS_SYNC_REPO_LIB_DIR=${BASH_SOURCE[0]%/*}
if [ "$SKILLS_SYNC_REPO_LIB_DIR" = "${BASH_SOURCE[0]}" ]; then
  SKILLS_SYNC_REPO_LIB_DIR=.
fi
# shellcheck source=skills-sync-auth.sh
source "${SKILLS_SYNC_REPO_LIB_DIR}/skills-sync-auth.sh"
# shellcheck source=skills-sync-containment.sh
source "${SKILLS_SYNC_REPO_LIB_DIR}/skills-sync-containment.sh"

# skills_sync_run_repo <repo> <core_root> <branch> <src_sha> <git_name> <git_email> <skill...>
#
# Clones frostyard/<repo> into a fresh mktemp directory using a git
# credential helper (skills_sync_credential_helper — GH_TOKEN
# authenticates without ever appearing in a URL or a raw command
# argument), mirrors the named skills into it via skills_sync_sync_repo,
# and opens or updates its sync PR when the mirrored tree changed.
#
# The credential reaches only the four subprocesses that authenticate to
# GitHub — the clone, the push, and the two gh pull-request calls — each
# wrapped in skills_sync_authenticated. Everything else this function runs
# (mktemp, realpath, the mkdir/rsync/printf sync copy path, and the local
# git add/diff/checkout/commit against the clone) executes with no
# GH_TOKEN in its environment at all.
#
# The mktemp clone is removed before this function returns on every exit
# path — clone failure, an unknown skill, containment failure, no change,
# a git/gh failure, and success — via a RETURN trap bound to this
# invocation's directory, so callers never manage its lifecycle. Returns
# 1 for a recoverable per-repo failure (clone, containment, or git/gh),
# 2 for an unknown skill (the caller's cue to stop the whole run), 0 on
# success or no-change.
skills_sync_run_repo() {
  local repo="$1" core_root="$2" branch="$3" src_sha="$4" git_name="$5" git_email="$6"
  shift 6
  local skills=("$@")

  # Take the org-wide credential out of the exported environment before the
  # first subprocess runs. A caller that already captured it (the
  # scripts/sync-skills.sh entry point) makes this a no-op; a direct caller
  # that hands the function an exported GH_TOKEN gets the same containment.
  skills_sync_capture_token

  local dir
  dir=$(mktemp -d)
  trap "rm -rf '${dir}'" RETURN

  local cred_helper
  cred_helper=$(skills_sync_credential_helper)

  if ! skills_sync_authenticated git -c credential.helper="$cred_helper" clone --quiet --depth 1 \
      "https://github.com/frostyard/${repo}.git" "$dir"; then
    echo "::error::clone failed for frostyard/${repo}" >&2
    return 1
  fi

  local skill
  for skill in "${skills[@]}"; do
    if [ ! -d "${core_root}/.agents/skills/${skill}" ]; then
      echo "::error::skills-sync.json names unknown skill '${skill}'" >&2
      return 2
    fi
  done

  # Some repos (chairlift, pilothouse) have .agents as a symlink to
  # docs/agents — resolve to the physical dir so git pathspecs match the
  # files, not the symlink. skills_sync_sync_repo rejects, before any
  # mkdir/rsync/marker write, a resolved skills root or skill destination
  # that escapes the clone root (e.g. an .agents symlink pointing outside
  # $dir, or a pre-existing managed-skill destination symlink that does).
  if ! skills_sync_sync_repo "$dir" "$core_root" "${skills[@]}"; then
    echo "::error::sync failed for frostyard/${repo}" >&2
    return 1
  fi
  local skills_root rel_root
  skills_root=$(realpath -m "${dir}/.agents")/skills
  rel_root=$(realpath -m --relative-to="$dir" "$skills_root")

  # Run the per-repo git/PR work in a subshell whose exit status we read
  # AFTER it finishes — `( ... ) || return 1` would put the subshell in a
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
    git checkout -q -B "$branch"
    git -c user.name="$git_name" -c user.email="$git_email" \
      commit -q -m "chore: sync agent skills from frostyard/core@${src_sha}"
    skills_sync_authenticated git -c credential.helper="$cred_helper" push -qf origin "$branch"
    # Check-then-create, with no fallback masking: a create failure (e.g.
    # token missing pull-requests:write) must fail the run loudly.
    existing=$(skills_sync_authenticated gh pr list --repo "frostyard/${repo}" \
      --head "$branch" --state open --json number --jq '.[].number')
    if [ -n "$existing" ]; then
      echo "== ${repo}: PR #${existing} already open — branch force-updated"
    else
      skills_sync_authenticated gh pr create --repo "frostyard/${repo}" --head "$branch" \
        --title "chore: sync agent skills from frostyard/core" \
        --body "$(printf 'Automated skill sync from [frostyard/core](https://github.com/frostyard/core) @ %s per [ADR-0026](https://github.com/frostyard/core/blob/main/docs/adr/0026-distribute-core-skills-via-sync-prs.md).\n\nSynced skills: %s\n\nThese directories are managed in core — edit them there, not here. Local edits are overwritten by the next sync.\n\nRisk tier: 1 — documentation/skills only, no code or workflow changes.' "$src_sha" "${skills[*]}")"
    fi
    echo "== ${repo}: synced"
  )
  local rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "::error::sync failed for frostyard/${repo}" >&2
    return 1
  fi
}
