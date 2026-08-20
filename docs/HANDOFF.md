# Maintainer Handoff Guide

This guide transfers development and repository operations to another person
without transferring personal credentials or losing release knowledge. Keep
the previous maintainer available until the new maintainer completes the
acceptance checks.

## Current Operational Baseline

At the v1.0.8 handoff baseline:

- The repository is public at `Topasm/textex`, with `main` as the default
  branch.
- GitHub Actions validates lint, types, formatting, tests, Linux, Windows, and
  macOS universal packaging.
- A `v*` tag can publish a public GitHub Release. Follow
  [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before creating one.
- Tectonic 0.17.0 is bundled. macOS universal packaging needs both x64 and
  arm64 binaries.
- macOS CI output is ad-hoc signed and not Apple-notarized.
- The build currently needs no custom Actions secret; GitHub provides the
  workflow `GITHUB_TOKEN`. Do not assume that remains true if signing,
  notarization, or an external publishing service is added.
- `main` does not currently have branch protection. Enable a ruleset before
  broadening write access if the repository will have multiple maintainers.
- Dependabot checks npm and GitHub Actions weekly. Review open dependency PRs
  rather than deleting their branches as ordinary cleanup.

Treat this section as a baseline, not a permanent source of truth. The commands
below query the live repository state during the handoff.

## 1. Choose the Type of Handoff

### Add a maintainer without changing repository ownership

This is the lowest-risk option because release URLs, clone URLs, updater URLs,
and badges remain unchanged.

1. In GitHub repository settings, open access or collaborator management.
2. Invite the new person's own GitHub account.
3. Grant only the required role. Use `Maintain` for normal project operation;
   use `Admin` only if they must manage access, rules, or transfer ownership.
4. Wait for the invitation to be accepted.
5. Keep the previous maintainer's access until the acceptance checks pass.

### Transfer the repository to another account or organization

Use GitHub's repository transfer flow only when the namespace itself must
change. A transfer can affect clone URLs, badges, updater URLs, release links,
and external references even when GitHub redirects old URLs.

Before transferring:

1. Confirm the destination account or organization can accept the repository.
2. Record the current release and Actions state.
3. Search the project for the current repository owner and URL:

   ```bash
   rg -n "Topasm/textex|github.com/Topasm" . \
     --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**'
   ```

4. Transfer through the repository settings danger zone and have the new owner
   accept it.
5. Update the local remote and any intentional owner-specific configuration:

   ```bash
   git remote set-url origin https://github.com/<new-owner>/textex.git
   git remote -v
   ```

6. Recheck release downloads and updater behavior before removing the previous
   owner.

## 2. Do Not Transfer Personal Credentials

- The new maintainer signs in with their own GitHub account and their own SSH
  key, passkey, or personal access token.
- Never send a personal access token, SSH private key, signing private key, or
  recovery code through chat, email, an issue, or a committed file.
- If a shared external credential is unavoidable, transfer it with an approved
  secret manager and rotate it immediately after acceptance.
- Repository or environment secrets should be recreated by an administrator;
  GitHub does not reveal existing secret values.
- Code-signing certificates and Apple notarization credentials are operational
  assets outside Git. Record their owner and expiry separately. None are
  required by the current ad-hoc macOS CI build.

## 3. New Maintainer Bootstrap

The new maintainer should perform a clean clone instead of reusing another
person's working directory:

```bash
git clone https://github.com/Topasm/textex.git
cd textex
git status --short --branch
node --version
npm ci
```

Node.js 22.13 or newer is required. Read these files before changing code:

1. `AGENTS.md` — architecture and mandatory working rules
2. `docs/DEVELOPMENT.md` — setup and commands
3. `docs/ARCHITECTURE.md` — process boundaries and data flow
4. `docs/RELEASE_CHECKLIST.md` — release blockers and recovery
5. `docs/PACKAGING.md` — sidecars, artifacts, signing, and updater metadata

Run the full acceptance build:

```bash
npm run pre-commit
npm run build
npm run build:cli
npm run build:mcp
node out/cli/cli/index.js --version
```

On a supported host, also verify the bundled Tectonic binary and package the
host platform. Cross-platform acceptance comes from GitHub Actions.

## 4. Verify GitHub Access

Authenticate the GitHub CLI with the new maintainer's own account:

```bash
gh auth login
gh auth status
gh repo view Topasm/textex
gh workflow list --repo Topasm/textex
gh release view v1.0.8 --repo Topasm/textex
gh pr list --repo Topasm/textex --state open
```

The new maintainer should be able to:

- fetch and push an ordinary feature branch;
- open and review a pull request;
- read Actions logs and download development artifacts;
- manage releases only if that responsibility was assigned;
- view repository settings only when granted administrative responsibility.

Use a harmless documentation branch or the next real task for the first PR. Do
not use a version tag or a publication-enabled workflow dispatch as an access
test.

## 5. Repository Safety Setup

Before several people receive write access, add a GitHub ruleset for `main`.
Recommended minimums are:

- require pull requests for changes to `main`;
- require the current `Lint & Typecheck` and `Test` checks;
- for packaging or release changes, require successful Linux, Windows, and
  macOS universal jobs before tagging;
- block force pushes and branch deletion for `main`;
- keep administrators subject to the rules unless emergency bypass ownership
  is explicitly assigned.

Do not guess status-check names while configuring the ruleset. Select them from
a completed `Build & Package` run.

Review live automation and permissions:

```bash
gh run list --workflow "Build & Package" --branch main --limit 5
gh secret list --repo Topasm/textex --app actions
gh pr list --repo Topasm/textex --state open --author app/dependabot
git ls-remote --heads origin
```

An empty `gh secret list` is expected for the current ad-hoc release flow. If
secrets are later added, document only their names and purpose, never values.

## 6. Branch and Pull Request Hygiene

Delete only branches whose work is merged, superseded, or explicitly
abandoned. An open PR means its branch is still owned by that workflow or
contributor.

```bash
git fetch --prune origin
git branch --merged main
git branch --no-merged main
gh pr list --state open
```

- Use `git branch -d <name>` for merged local branches.
- Before deleting a remote branch, verify its associated PR state.
- Close a superseded PR with a short explanation before deleting its branch.
- Do not delete active Dependabot branches merely to make the branch list
  shorter. Review, merge, close, or ask Dependabot to rebase them.
- Never delete `main` or a published release tag.

## 7. Release Responsibility Acceptance

The new release owner should read the complete release checklist and inspect a
successful historical run before publishing anything:

```bash
gh run list --workflow "Build & Package" --limit 10
gh release view v1.0.8 --json url,tagName,isDraft,isPrerelease,assets
```

Key invariants:

- validate the exact release commit on `main` before creating its tag;
- wait for all three platform builds because fail-fast is disabled on purpose;
- keep version strings synchronized across the app, CLI, MCP server, and lock;
- preserve macOS universal native-module and sidecar rules;
- publish updater manifests, blockmaps, macOS ZIP, and checksums;
- never move a tag after a GitHub Release exists.

## 8. Transfer Project Knowledge Outside Git

The outgoing maintainer should separately explain:

- current roadmap and priority issues;
- known user-facing defects and unreleased experiments;
- why any open dependency major upgrades were deferred;
- release cadence and who approves a public release;
- ownership of domains, package registries, signing accounts, or support inboxes
  if any are added later;
- macOS signing/notarization plans and the current Gatekeeper limitation;
- the large tracked Tectonic binaries and whether a future Git LFS migration is
  desired.

Keep durable technical decisions in repository documentation or issues rather
than only in a private conversation.

## 9. Acceptance and Offboarding

The handoff is complete only after the new maintainer confirms all of these:

- clean clone and `npm ci` succeed;
- `npm run pre-commit`, desktop build, CLI build, and MCP build succeed;
- GitHub access and a normal feature-branch workflow succeed;
- Actions logs, releases, open PRs, and Dependabot responsibilities are visible;
- release and rollback rules are understood;
- non-Git operational assets have an identified owner.

After acceptance:

1. Remove access that is no longer needed.
2. Rotate shared credentials, if any existed.
3. Verify branch rules and release permissions again.
4. Record the handoff date and new responsibility owner in a private operations
   record when personal information should not be public.
