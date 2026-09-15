#!/usr/bin/env bash
# Git/gh authentication for scripts/sync-skills.sh (ADR-0026).
#
# Two independent containments apply to the org-wide ORG_PAT:
#
#   1. Value containment. skills_sync_credential_helper is a git
#      credential helper (git-credential(1)) that reads GH_TOKEN from its
#      own process environment only when git invokes it to fill a
#      credential. It contains the literal characters `$GH_TOKEN`, never
#      the token's value, so neither a clone's stored `origin` URL, nor
#      argv, nor the cloned repo's `.git/config` ever holds the secret.
#
#   2. Environment containment. The token arrives exported (the workflow
#      sets `env: GH_TOKEN`), which would hand it to every descendant of
#      the sync — jq, mktemp, realpath, mkdir, rsync, printf and the
#      unauthenticated git calls that read and commit the local clone.
#      skills_sync_capture_token moves it out of the exported environment
#      into a private shell variable, and skills_sync_authenticated puts
#      it back for exactly one command: the git clone/push that use the
#      credential helper above, and the gh calls that read GH_TOKEN
#      directly. Nothing else inherits it.
set -euo pipefail

# Private to the sourcing shell: never exported, so no child sees it
# unless skills_sync_authenticated puts it in that child's environment.
SKILLS_SYNC_TOKEN="${SKILLS_SYNC_TOKEN:-}"

skills_sync_credential_helper() {
  echo '!f() { test "$1" = get && printf "username=x-access-token\npassword=%s\n" "$GH_TOKEN"; }; f'
}

# skills_sync_capture_token
#
# Reads the incoming GH_TOKEN (ORG_PAT) and unsets it, so that from this
# point on the exported environment carries no credential. Idempotent:
# a second call after the token is already captured is a no-op. Fails
# closed when neither a captured token nor GH_TOKEN is available.
skills_sync_capture_token() {
  if [ -n "$SKILLS_SYNC_TOKEN" ]; then
    unset GH_TOKEN
    return 0
  fi
  : "${GH_TOKEN:?GH_TOKEN (ORG_PAT) is not configured}"
  SKILLS_SYNC_TOKEN="$GH_TOKEN"
  unset GH_TOKEN
}

# skills_sync_authenticated <command> [arg...]
#
# Runs one command with the captured token in its environment as
# GH_TOKEN. The `GH_TOKEN=...` assignment prefix is consumed by the shell
# and applied to that single child only — it never becomes argv, so the
# value stays out of `ps`, out of the command logs the tests inspect, and
# out of every sibling subprocess.
skills_sync_authenticated() {
  GH_TOKEN="$SKILLS_SYNC_TOKEN" "$@"
}
