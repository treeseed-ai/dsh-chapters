---
title: "23. Install, upgrade, provenance"
description: Every install path, how versions move, and why you can verify what you installed.
lastUpdated: true
---

## Requirements

DeepSeek Harness (`@deepseek-ai/dsh`) ≥ 0.1.5-rc.x, Node ≥ 24. The plugin ships as one npm package: [`@treeseed/dsh-chapters`](https://www.npmjs.com/package/@treeseed/dsh-chapters).

## Install / update / verify

```bash
dsh plugin --profile web add @treeseed/dsh-chapters          # from npm (pin with @<version> for reproducible profiles)
dsh plugin --profile web update @treeseed/dsh-chapters       # bump — then restart dsh web (bundles load at boot)
dsh plugin --profile web list                                # enabled state for that profile
```

`--profile` is required on every plugin command — `web` is the browser harness profile; substitute your
own profile name.

Restart the harness. Expect on boot: engine-constructed lines in the server log, the six `chapters_*` tools, four `/chapters-*` commands, the fork button on assistant rows, and the optional `chapters` preset that routes `/compact` through the zero-token engine.

## Supply chain, auditable

- every CI-published version carries an **npm provenance attestation** (SLSA v1, via OIDC trusted publishing — no long-lived tokens) linking the tarball to the exact repo, workflow, commit, and CI run that built it;
- `npm audit signatures` on an installed tree verifies it;
- releases publish from a green `main`: the release workflow itself blocks on the **full deterministic suite — 464 tests — under the ≥85% coverage gate**, and CI runs the **seven-segment browser acceptance chain replayed from committed model tapes** on every push to `main`, so a release is always cut from a green acceptance run — no LLM, no GPU, no key, and a *loud* failure (503 on tape miss) rather than a skip.

## Versioning & the changelog

Semver, tag = version, bare (`0.1.3`). Real incidents, real fixes, recorded honestly in [§26](/operations/changelog/) — including which versions to avoid or upgrade past.

## Uninstall

`dsh plugin --profile web remove @treeseed/dsh-chapters` — the archive it wrote is plain Markdown under `.dsh-chapters/` and any pool you linked; removing the plugin never removes your data, by design.

Next: [24. Developing the plugin](/operations/development/).
