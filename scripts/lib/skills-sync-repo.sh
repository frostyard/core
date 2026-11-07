#!/usr/bin/env bash
# Per-repo sync orchestration for scripts/sync-skills.sh (ADR-0026, ADR-0075).
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
# The sync commit is new on each run (a new timestamp, so a new SHA). The
# function pushes the sync branch only when the remote branch is missing
# or differs from that commit in its tree or its parent (the default-branch
# tip). A branch that already holds the same tree on the same parent is
# not pushed, so a daily run does not restart CI on an unchanged open sync
# PR (ADR-0075). The PR check-then-create step runs in both cases: an open
# PR is never duplicated, and a current branch with no open PR gets one.
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

  # The sync writes only to `.agents/skills/`, as real directories.
  # skills_sync_sync_repo refuses, before any mkdir/rsync/marker write, a
  # destination that escapes the clone root or that is a symlink at
  # `.agents`, `.agents/skills` or a managed skill's directory (ADR-0026).
  if ! skills_sync_sync_repo "$dir" "$core_root" "${skills[@]}"; then
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
    git add -A .agents/skills || exit 1
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
    # Find the remote sync branch. `ls-remote --exit-code` exits 2 when
    # the ref does not exist; any other non-zero status is an error.
    remote_rc=0
    git -c credential.helper="$cred_helper" ls-remote --exit-code --quiet \
      origin "refs/heads/${branch}" >/dev/null || remote_rc=$?
    branch_current=0
    if [ "$remote_rc" -eq 0 ]; then
      git -c credential.helper="$cred_helper" fetch -q --depth 1 origin \
        "+refs/heads/${branch}:refs/remotes/origin/${branch}" || exit 1
      # The fetch is shallow, and it can mark the new commit shallow too
      # when the 2 commits have the same ID, so `<ref>^` may not resolve:
      # read the tree and parent lines of each commit header instead.
      new_commit=$(git cat-file -p HEAD) || exit 1
      old_commit=$(git cat-file -p "refs/remotes/origin/${branch}") || exit 1
      new_tree=$(printf '%s\n' "$new_commit" | sed -n '/^$/q; s/^tree //p') || exit 1
      new_parent=$(printf '%s\n' "$new_commit" | sed -n '/^$/q; s/^parent //p') || exit 1
      old_tree=$(printf '%s\n' "$old_commit" | sed -n '/^$/q; s/^tree //p') || exit 1
      old_parent=$(printf '%s\n' "$old_commit" | sed -n '/^$/q; s/^parent //p') || exit 1
      if [ "$new_tree" = "$old_tree" ] && [ "$new_parent" = "$old_parent" ]; then
        branch_current=1
      fi
    elif [ "$remote_rc" -ne 2 ]; then
      echo "::error::cannot read the sync branch of frostyard/${repo}" >&2
      exit 1
    fi
    if [ "$branch_current" -eq 1 ]; then
      echo "== ${repo}: sync branch already current"
    else
      git -c credential.helper="$cred_helper" push -qf origin "$branch" || exit 1
    fi
    # Check-then-create, with no fallback masking: a create failure (e.g.
    # token missing pull-requests:write) must fail the run loudly.
    existing=$(gh pr list --repo "frostyard/${repo}" --head "$branch" --state open \
      --json number --jq '.[].number') || exit 1
    if [ -n "$existing" ]; then
      if [ "$branch_current" -eq 1 ]; then
        echo "== ${repo}: PR #${existing} already open — branch unchanged"
      else
        echo "== ${repo}: PR #${existing} already open — branch force-updated"
      fi
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
