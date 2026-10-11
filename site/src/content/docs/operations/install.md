---
title: "23. Install, upgrade, provenance"
description: Every install path, how versions move, and why you can verify what you installed.
lastUpdated: true
---

## Requirements

DeepSeek Harness (`@deepseek-ai/dsh`) ≥ 0.1.5-rc.x, Node ≥ 24. The plugin ships as one npm package: [`@treeseed/dsh-chapters`](https://www.npmjs.com/package/@treeseed/dsh-chapters).

## Install / update — the path this project uses

A harness profile is a plain npm directory: `package.json` (carrying the `dsh.profile.bundles` list) plus
its own `node_modules`, under `<DSH home>/profiles/<profile>/`. So installing or bumping the plugin is an
`npm` call *in that directory*, then a restart — bundles load at boot and nothing hot-swaps:

```bash
cd ~/.dsh/profiles/web
npm i @treeseed/dsh-chapters@latest     # install, or bump to whatever npm calls latest
npm ls @treeseed/dsh-chapters           # what is actually in this profile
# restart dsh web — the running process holds the old bundle until then
```

`@latest` rather than a pinned number, on purpose: an install instruction with a version typed into it is
a sentence that silently becomes wrong the moment a release ships. Pin deliberately only when you are
reproducing someone else's profile.

If the profile has never carried this plugin, `npm i` puts it on disk but the profile must also *name* it:
its `package.json` lists the bundles to load under `dsh.profile.bundles`, and `@treeseed/dsh-chapters` has
to appear there. That is exactly what this repo's own `scripts/bootstrap-dev-profile.sh` writes for a dev
profile (same mechanism, with a `file:` dependency pointed at the working tree instead of a published
version).

## The host's own plugin commands

`dsh plugin` exists and is the host's surface for this job:

```bash
dsh plugin --profile web add @treeseed/dsh-chapters     # host forwards the arguments to its own installer
dsh plugin --profile web list                           # enabled state for that profile
dsh plugin --profile web remove @treeseed/dsh-chapters
```

**Honest note, stated as what works rather than as a defect report:** in this project's own use, the npm
path above is the one that has installed and updated the plugin successfully; the `dsh plugin add` path has
never been observed working here, and this repo does not rely on it. That is a report of what we use. The
host's plugin command forwards its arguments to a package manager that is not npm (`bin.js:105` of the
installed host, and this repo is npm-only and never a monorepo — see the repo's `docs/development.md`),
which is the extent of what we have established: **we have not reproduced the failure, have no diagnosis
for it, and are not claiming this page fixes anything.** If it works for you, it works for you — the end
state is the same directory `npm ls` reads.

## Restart and check

Restart the harness. Expect on boot: engine-constructed lines in the server log, the six `chapters_*`
tools, the six `/chapters-*` commands, **both** archive buttons on assistant rows (*Fork with chapters* and
*Continue with chapters* — one deterministic door, two intents), and the optional `chapters` preset that
routes `/compact` through the zero-token engine.

## Supply chain, auditable

- every CI-published version carries an **npm provenance attestation** (SLSA v1, via OIDC trusted publishing — no long-lived tokens) linking the tarball to the exact repo, workflow, commit, and CI run that built it;
- `npm audit signatures` on an installed tree verifies it;
- releases publish from a green `main`: the release workflow itself blocks on the **full deterministic suite — unit + integration, under the ≥85% coverage gate** — and CI runs the **browser acceptance chain replayed from committed model tapes** on every push to `main`, so a release is always cut from a green acceptance run — no LLM, no GPU, no key, and a *loud* failure (503 on tape miss) rather than a skip. The current row count lives in the release ledger ([§26](/operations/changelog/)), not here: a count typed into a page goes stale exactly like a version does;

## Versioning & the changelog

Semver, tag = version, bare — the release workflow refuses to publish when the tag and `package.json`
disagree. That gate is also why this site can read its own version from the repo manifest at build time
instead of asking npm: at any release commit, the number in the manifest *is* the number that shipped.

**No page on this site tells a human to install a numbered version.** Instructions say `@latest`, which
cannot go stale; the one place that names the current release — the *Getting started* card on the home page —
interpolates it at build time. [§26](/operations/changelog/) keeps its literal version headings, and the
evidence pages keep the version each measured run ran on, for the same reason: those are records, not
instructions. What may not come back is a pinned install instruction —
`site/scripts/check-stale-versions.mjs` fails the site build if one is typed in.

Real incidents, real fixes, recorded honestly in [§26](/operations/changelog/) — including which versions to
avoid or upgrade past.

## Uninstall

`npm uninstall @treeseed/dsh-chapters` in the profile directory — or `dsh plugin --profile web remove
@treeseed/dsh-chapters` if that path works for you. Either way the archive it wrote is plain Markdown under
`.dsh-chapters/` and any pool you linked; removing the plugin never removes your data, by design.

Next: [24. Developing the plugin](/operations/development/).
