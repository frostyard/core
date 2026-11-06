# Security policy

Core holds shared org material: agent skills, templates, docs, validators and
the reusable workflows that other frostyard repositories call.

## Supported versions

Core makes no releases and has no tags. Only the `main` branch gets fixes.
Consuming repositories copy skills, templates and the risk-paths workflow from
`main`. A fix reaches them through the skills sync, or through their next pin
update.

## Reporting a vulnerability

Use GitHub private vulnerability reporting:
https://github.com/frostyard/core/security

Open the Security tab and click **Report a vulnerability**. Do not open a
public issue with the details. Do not post credentials, app tokens or keys in
an issue, a pull request or a discussion.

## What to include

- The affected commit.
- The affected path: a workflow, a script, a skill or a template.
- The impact.
- The steps to reproduce.

## Scope

The high-risk areas are:

- `.github/workflows/`: the risk-paths reusable workflow that other
  repositories call, and the skills sync that writes to other repositories
  with an app token.
- `scripts/sync-skills.sh` and `scripts/lib/skills-sync-*.sh`.
- `scripts/apply-repo-settings.sh`.
- `scripts/rollout-merge-queue.sh`.
- The skills and templates that every repository receives.
