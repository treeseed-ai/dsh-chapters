---
title: "24. Developing the plugin"
description: The build-test loop that doesn't restart the harness, the tape-replay acceptance system, and the rules that keep it honest.
lastUpdated: true
---

One package, plain npm, no monorepo:

```bash
npm ci && npm run build && npm test          # 464 unit + integration (zero skips when services are up)
npm run coverage:ci                          # the ≥85% gate, same numbers CI enforces
npm run test:e2e:replay                      # 7 browser acceptance segments, off model TAPES
bash scripts/bootstrap-dev-profile.sh --home .dshdev-local   # isolated dev harness home
```

## The tape system (why CI has no LLM)

E2E browser tests would normally need a live model, a GPU, and minutes per spec. Instead, recorded model exchanges are committed under `tests/fixtures/model-tape/` and replayed by a proxy; every request must match a recorded exchange after **normalization on both sides** (volatile values — ports, paths, token counts — are masked out), or the run fails loudly with a miss journal + diff dump (candidates sorted by shared prefix). Usage numbers ride the tape, so token-meter thresholds fire at identical steps — *threshold behavior* under test with zero model calls. E2E_MODEL=record distills fresh tapes from the local model — once per scenario, whole projects at a time (specs share a boot); re-record when **product prompts** change — doc edits are free with one measured exception: near-threshold scenarios (`heavy`, `fanout`) digest injected docs into model-visible checkpoints.

## The discipline, condensed

- **the point of a test is to test, not skip** — a test that skips for a missing dep is a bug report;
- **measure before you attribute** — three "bug" reports this year were each a different thing (a unit mismatch, a capacity fact, and a real defect) — the audits that decode provider units from meter units are in the repo history;
- **a tape records the context it was distilled in** — one journey per boot, never two GPU suites at once;
- **loud beats lossy** — refusals carry numbers; degradations name their step.

The contributor-facing full loop: `docs/development.md` and `AGENTS.md` in the repo (the site you're reading is *for users*; those are for the agents and humans working *on* it). Next: [25. Internals map](/operations/internals/).
