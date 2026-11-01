#!/usr/bin/env bash
# Per-repo sync orchestration for scripts/sync-skills.sh (ADR-0026).
set -euo pipefail

SKILLS_SYNC_REPO_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
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

  local dir
  dir=$(mktemp -d)
  trap "rm -rf '${dir}'" RETURN

  local cred_helper
  cred_helper=$(skills_sync_credential_helper)

  if ! git -c credential.helper="$cred_helper" clone --quiet --depth 1 \
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
  if ! skills_root=$(realpath -m "${dir}/.agents") ||
    ! rel_root=$(realpath -m --relative-to="$dir" "${skills_root}/skills"); then
    echo "::error::sync failed for frostyard/${repo}" >&2
    return 1
  fi

  # Run the per-repo git/PR work in a subshell where every step checks its
  # own status. `set -e` cannot be the guard here: sync-skills.sh calls this
  # function as an `if` condition, and bash ignores `set -e` for every
  # command inside a function run in that context — even in a subshell that
  # sets -e again — so a failed push or `gh` call would fall through and
  # report the repository synced (a green run that pushed nothing). The
  # `|| rc=$?` keeps a caller that runs with `set -e` from exiting here.
  local rc=0
  (
    cd "$dir" || exit 1
    git add -A "$rel_root" || exit 1
    # 0: nothing staged; 1: a change; anything else is a git error.
    diff_rc=0
    git diff --cached --quiet || diff_rc=$?
    if [ "$diff_rc" -eq 0 ]; then
      echo "== ${repo}: up to date"
      exit 0
    elif [ "$diff_rc" -ne 1 ]; then
      exit 1
    fi
    git checkout -q -B "$branch" || exit 1
    git -c user.name="$git_name" -c user.email="$git_email" \
      commit -q -m "chore: sync agent skills from frostyard/core@${src_sha}" || exit 1
    git -c credential.helper="$cred_helper" push -qf origin "$branch" || exit 1
    # Check-then-create, with no fallback masking: a create failure (e.g.
    # token missing pull-requests:write) must fail the run loudly.
    existing=$(gh pr list --repo "frostyard/${repo}" --head "$branch" --state open \
      --json number --jq '.[].number') || exit 1
    if [ -n "$existing" ]; then
      echo "== ${repo}: PR #${existing} already open — branch force-updated"
    else
      gh pr create --repo "frostyard/${repo}" --head "$branch" \
        --title "chore: sync agent skills from frostyard/core" \
        --body "$(printf 'Automated skill sync from [frostyard/core](https://github.com/frostyard/core) @ %s per [ADR-0026](https://github.com/frostyard/core/blob/main/docs/adr/0026-distribute-core-skills-via-sync-prs.md).\n\nSynced skills: %s\n\nThese directories are managed in core — edit them there, not here. Local edits are overwritten by the next sync.\n\nRisk tier: 1 — documentation/skills only, no code or workflow changes.' "$src_sha" "${skills[*]}")" \
        || exit 1
    fi
    echo "== ${repo}: synced"
  ) || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "::error::sync failed for frostyard/${repo}" >&2
    return 1
  fi
}
