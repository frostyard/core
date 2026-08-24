#!/usr/bin/env bash
# Containment boundary for scripts/sync-skills.sh (ADR-0026).
#
# Each sync target is a freshly cloned, untrusted consumer repo. A
# consumer that plants a `.agents` symlink (or an existing
# `.agents/skills/<skill>` symlink) pointing outside the clone can turn
# the sync's mkdir / `rsync --delete` / marker write into an escape from
# the temporary clone root. Every resolved destination is checked here,
# fail-closed, before any of those three operations run.
set -euo pipefail

# skills_sync_require_contained <root> <path> <label>
#
# <path> need not exist yet: realpath -m resolves any existing prefix
# (including a symlink) and normalizes the remainder without requiring
# it to exist. Prints ::error:: and returns 1 when the canonicalized
# <path> is not <root> itself or strictly beneath it.
skills_sync_require_contained() {
  local root="$1" path="$2" label="$3"
  local root_real path_real
  root_real=$(realpath -m -- "$root")
  path_real=$(realpath -m -- "$path")
  case "$path_real" in
    "$root_real" | "$root_real"/*)
      return 0
      ;;
    *)
      echo "::error::${label} escapes the cloned repository root (${path_real} is not under ${root_real})" >&2
      return 1
      ;;
  esac
}

# skills_sync_sync_repo <dir> <core_root> <skill...>
#
# Mirrors each named skill from <core_root>/.agents/skills/<skill> into
# <dir>/.agents/skills/<skill> — resolving a supported in-repo `.agents`
# symlink (e.g. `.agents -> docs/agents`) — and writes its
# `.synced-from-core` marker. Callers must have already validated that
# each skill exists under <core_root>. Returns 1 without creating any
# directory, deleting any file, or writing any marker when the resolved
# `.agents/skills` root or a skill's destination is not contained in
# <dir>.
skills_sync_sync_repo() {
  local dir="$1" core_root="$2"
  shift 2

  local skills_root
  skills_root=$(realpath -m "${dir}/.agents")/skills
  skills_sync_require_contained "$dir" "$skills_root" ".agents/skills root" || return 1

  local skill src dst
  for skill in "$@"; do
    src="${core_root}/.agents/skills/${skill}"
    dst="${skills_root}/${skill}"
    skills_sync_require_contained "$dir" "$dst" "managed-skill destination '${skill}'" || return 1
    mkdir -p "$dst"
    rsync -a --delete "$src/" "$dst/"
    # No commit SHA in the marker: a SHA would make every core commit dirty
    # every consumer (marker-only diff PRs). Provenance detail lives in the
    # sync commit message instead.
    printf 'Managed by frostyard/core — edit there, not here (ADR-0026).\nSource: https://github.com/frostyard/core/tree/main/.agents/skills/%s\n' \
      "$skill" > "$dst/.synced-from-core"
  done
}
