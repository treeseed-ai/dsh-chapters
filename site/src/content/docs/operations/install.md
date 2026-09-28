---
title: "23. Install, upgrade, provenance"
description: Every install path, how versions move, and why you can verify what you installed.
lastUpdated: true
---

## Requirements

DeepSeek Harness (`@deepseek-ai/dsh`) ≥ 0.1.5-rc.x, Node ≥ 24. The plugin ships as one npm package: [`@treeseed/dsh-chapters`](https://www.npmjs.com/package/@treeseed/dsh-chapters).

## Install / update / verify

```bash
dsh plugin add @treeseed/dsh-chapters          # from npm (pin with @<version> for reproducible profiles)
dsh plugin update @treeseed/dsh-chapters       # bump — then restart dsh web (bundles load at boot)
dsh plugin list                                # enabled state per profile
```

Restart the harness. Expect on boot: engine-constructed lines in the server log, the six `chapters_*` tools, four `/chapters-*` commands, the fork button on assistant rows.

## Supply chain, auditable

- every CI-published version carries an **npm provenance attestation** (SLSA v1, via OIDC trusted publishing — no long-lived tokens) linking the tarball to the exact repo, workflow, commit, and CI run that built it;
- `npm audit signatures` on an installed tree verifies it;
- releases are gated by: 464 deterministic tests, an ≥85% coverage gate, and a **seven-segment browser acceptance chain replayed from committed model tapes** — no LLM, no GPU, no key, and a *loud* failure (503 on tape miss) rather than a skip.

## Versioning & the changelog

Semver, tag = version, bare (`0.1.3`). Real incidents, real fixes, recorded honestly in [§26](/operations/changelog/) — including which versions to avoid or upgrade past.

## Uninstall

`dsh plugin remove @treeseed/dsh-chapters` — the archive it wrote is plain Markdown under `.dsh-chapters/` and any pool you linked; removing the plugin never removes your data, by design.

Next: [24. Developing the plugin](/operations/development/).
