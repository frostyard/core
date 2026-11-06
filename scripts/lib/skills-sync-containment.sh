#!/usr/bin/env bash
# Containment boundary for scripts/sync-skills.sh (ADR-0026).
#
# Each sync target is a freshly cloned, untrusted consumer repo. A
# consumer that plants a `.agents` symlink (or an existing
# `.agents/skills/<skill>` symlink) pointing outside the clone can turn
# the sync's mkdir / `rsync --delete` / marker write into an escape from
# the temporary clone root. Every resolved destination is checked here,
# fail-closed, before any of those three operations run.
#
# The sync writes only to real directories at `.agents/skills/<name>/`
# (ADR-0026): it refuses a symlink at `.agents`, at `.agents/skills`, or at
# a managed skill's directory, in the clone or not.
set -euo pipefail

# skills_sync_require_contained <root> <path> <label>
#
# <path> need not exist yet: realpath -m resolves any existing prefix
# (including a symlink) and normalizes the remainder without requiring
# it to exist. Prints ::error:: and returns 1 when the canonicalized
# <path> is not strictly beneath <root> — <path> resolving to <root>
# itself is rejected too, since both callers below (the .agents/skills
# root and each skill's destination) must land inside the managed
# subtree, never coincide with the clone root (e.g. an in-clone
# `.agents/skills -> ..` symlink resolving exactly to <root>).
skills_sync_require_contained() {
  local root="$1" path="$2" label="$3"
  local root_real path_real
  # Each resolution checks its own status: callers run this in an `if`
  # condition, where bash ignores `set -e`, and an empty root_real would
  # make every absolute path look contained.
  root_real=$(realpath -m -- "$root") && [ -n "$root_real" ] || {
    echo "::error::cannot resolve the cloned repository root ${root}" >&2
    return 1
  }
  path_real=$(realpath -m -- "$path") && [ -n "$path_real" ] || {
    echo "::error::cannot resolve ${label} (${path})" >&2
    return 1
  }
  case "$path_real" in
    "$root_real"/*)
      return 0
      ;;
    *)
      echo "::error::${label} escapes the cloned repository root (${path_real} is not under ${root_real})" >&2
      return 1
      ;;
  esac
}

# skills_sync_require_real_dir <dir> <relative path>
#
# Refuses a symlink at <dir>/<relative path>. The sync stages, copies into
# and marks real directories only (.agents/skills/<name>/), so a symlink at
# any of the three managed levels is an error even when it stays inside the
# clone: it puts the skill outside the path ADR-0026 names. <path> need not
# exist.
skills_sync_require_real_dir() {
  local dir="$1" rel="$2"
  if [ -L "${dir}/${rel}" ]; then
    echo "::error::${rel} is a symlink: managed skills must be real directories at .agents/skills/<name>/ (ADR-0026)" >&2
    return 1
  fi
  return 0
}

# skills_sync_sync_repo <dir> <core_root> <skill...>
#
# Mirrors each named skill from <core_root>/.agents/skills/<skill> into
# <dir>/.agents/skills/<skill> and writes its `.synced-from-core` marker.
# Callers must have already validated that each skill exists under
# <core_root>. The destinations must be real directories: the sync refuses
# a symlink at `.agents`, `.agents/skills` or a managed skill's directory
# (ADR-0026). Returns 1 without creating any directory, deleting any file,
# or writing any marker when a destination escapes <dir> or is a symlink.
skills_sync_sync_repo() {
  local dir="$1" core_root="$2"
  shift 2

  local skills_root
  skills_root=$(realpath -m "${dir}/.agents") || return 1
  skills_root="${skills_root}/skills"
  skills_sync_require_contained "$dir" "$skills_root" ".agents/skills root" || return 1

  # Validate every destination before any mutation: with multiple skills, an
  # earlier valid destination must not be mkdir/rsync/marker-written before a
  # later escaping one is caught (fail-closed, no-mutation guarantee above).
  local skill dst
  for skill in "$@"; do
    dst="${skills_root}/${skill}"
    skills_sync_require_contained "$dir" "$dst" "managed-skill destination '${skill}'" || return 1
  done

  # Same no-mutation rule for symbolic links: every managed path is checked
  # before the first mkdir, so a symlinked later skill cannot leave an
  # earlier skill written behind.
  skills_sync_require_real_dir "$dir" ".agents" || return 1
  skills_sync_require_real_dir "$dir" ".agents/skills" || return 1
  for skill in "$@"; do
    skills_sync_require_real_dir "$dir" ".agents/skills/${skill}" || return 1
  done

  local src
  for skill in "$@"; do
    src="${core_root}/.agents/skills/${skill}"
    dst="${skills_root}/${skill}"
    # Each step checks its own status: the caller runs this function as an
    # `if` condition, where bash ignores `set -e`, so a failed copy would
    # otherwise stage a partial mirror.
    mkdir -p "$dst" || return 1
    rsync -a --delete "$src/" "$dst/" || return 1
    # No commit SHA in the marker: a SHA would make every core commit dirty
    # every consumer (marker-only diff PRs). Provenance detail lives in the
    # sync commit message instead.
    printf 'Managed by frostyard/core — edit there, not here (ADR-0026).\nSource: https://github.com/frostyard/core/tree/main/.agents/skills/%s\n' \
      "$skill" > "$dst/.synced-from-core" || return 1
  done
}
