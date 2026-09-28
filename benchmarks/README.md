# Memory benchmark protocol

Three arms, one grader, your own hardware. **Local-only by design** — CI has no model and this
runner needs the one llama slot quiet. Never run it during other agent work; results will be
contention-poisoned (and the methodology page on the site says so out loud).

## Run

```bash
npm run build                       # lib/ must exist — arm C imports the plugin's own pure modules
node benchmarks/run-bench.mjs                          # defaults: horizon 32768, :8080, 8 needles
node benchmarks/run-bench.mjs --horizon 65536 --needles 12
node benchmarks/run-bench.mjs --every 48               # nightly loop: a run every 48 min, ctrl-c stops
```

Each pass writes `site/src/data/results/bench-<utc>.json`; commit it and the next site build
publishes it. The site renders whatever is committed — nothing is fabricated in place of a run.

## Arms

| Arm | Head handling | Cost accounting |
|---|---|---|
| `truncation` | head dropped; tail only | 1 call |
| `llm-summarize` | head → model-written summary (the summarize call's own tokens/wall time are **billed to the arm**, as in real auto-compaction products) | 2 calls |
| `chapters` | head → verbatim archive + the plugin's own `deriveIdentity()` TOC line; one scripted retrieval turn (`read` on the chapter) when first-pass recall < 100% | 1–2 calls |

## Metrics & scoring

- **recall %**: N needle facts (distinct identifiers + numbers) planted at spaced offsets through the
  head; graded by presence in the final answer, whitespace-normalized.
- **uncached / cached tokens**: provider-reported per call, summed per arm.
- **wall ms**: summed across the arm's calls (the summarization tax is visible exactly where it lives).

## Known honesty limits (documented, not hidden)

- Arm C is a **module-level emulation**: deterministic index + verbatim archive + scripted retrieval —
  it uses the plugin's real pure functions but not the browser harness or model-driven `read`.
- Needle grading is exact-substring: it undercounts paraphrased-but-correct recall (arm B in particular
  will look worse than it answers).
- Filler text ≈ 4 chars/token; the horizon is approximate — recorded per run so cross-run deltas stay
  comparable.
- Results are machine- and model-specific. That is the point of running it locally: publish **your**
  numbers, from **your** box, next to the site's observational receipts.
