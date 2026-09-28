---
title: "25. Internals map"
description: Where the machinery lives in the repo — for agents and humans who want the source of truth, not the paraphrase.
lastUpdated: true
---

The plugin is small because the rules are strict. One glance at the module map:

| Module | Job |
|---|---|
| `src/index.ts` | plugin entry: tools/commands/client registration, preset install, config schema (the host-plane reference) |
| `src/engine-core.ts` | pure engine: `planSummarize` (deterministic checkpoint + carried plot), `buildFinalizedChapters`, `extractPlot` (the contract-shaped matcher) |
| `src/engine.ts` | cordis subclass: pre-step wiring, arrival stubs, elicitation, finalization-after-commit |
| `src/render.ts` + `src/injections.ts` | verbatim chapter bodies; the host-injection screen (mark-and-exclude so counts are truth) |
| `src/continue-core.ts` | the TOC notice composer (ancestry flattened chronologically, budget preflight refusing with numbers) |
| `src/sync.ts` / `src/provider.ts` | the sync loop (offline degrade, divergence rebuild) and the six-verb provider seam |
| `src/gitops.ts` / `src/treedx/` | the two transports (isomorphic-git; TreeDX workspace→overlay→commit) |
| `src/index-build.ts` / `src/search.ts` / `src/vocabulary.ts` / `src/enrich-wire.ts` / `src/rules.ts` | the knowledge layer: derived index, ranked search, shadow vocabulary, enrichment ladder, per-machine rule ledger |
| `src/client/` | browser plane: the fork action on assistant rows |
| `tests/unit` + `tests/integration` | 464 deterministic tests (zero skips when services are up — skips are treated as defects) |
| `tests/e2e` + `tests/fixtures/model-tape/` | seven browser journeys replayed from committed model tapes; misses are loud failures |

Deep prose lives in the repo docs: `docs/architecture.md` (mechanics & decisions), `docs/knowledge-repo.md` (the governing design record with amendments), `docs/provider.md` (transport truth table), `docs/host-compaction-seam.md` (the harness integration surface), `docs/verify.md` (every claim's verification procedure). The archive's rule applies to this site too: **links over paraphrases.**

Next: [26. Changelog & release notes](/operations/changelog/).
