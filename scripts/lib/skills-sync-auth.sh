#!/usr/bin/env bash
# Git credential authentication for scripts/sync-skills.sh (ADR-0026).
#
# GH_TOKEN authenticates clone and push without ever being interpolated
# into a remote URL or passed as a raw command argument: the string below
# is a git credential helper (git-credential(1)) that reads GH_TOKEN from
# its own process environment only when git invokes it to fill a
# credential. It contains the literal characters `$GH_TOKEN`, never the
# token's value, so neither a clone's stored `origin` URL, nor argv, nor
# the cloned repo's `.git/config` ever holds the secret.
set -euo pipefail

skills_sync_credential_helper() {
  echo '!f() { test "$1" = get && printf "username=x-access-token\npassword=%s\n" "$GH_TOKEN"; }; f'
}
