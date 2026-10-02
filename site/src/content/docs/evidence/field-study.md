---
title: "20. Field study — the TreeSeed run"
description: What actually happened when a 64K local model ran a 10-session multi-agent project analysis on this plugin. The receipts.
lastUpdated: true
---

**Setup.** Prompt: *"Deeply analyze this project and describe it for me. Use sub-agents to analyze different aspects… let me know if you understand how to develop this platform."* Model: qwen3.8-flash-next @ 65,536 on an 8GB-VRAM llama.cpp box. Plugin: 0.1.2, `chapters` preset. Instrumented by parsing the durable session logs of all ten sessions afterward.

## The ledger

| Metric | Value | Source |
|---|---|---|
| Sessions (parent + sub-agents) | **10 / 10 closed clean** — every turn balanced, every step paired | `turn/start↔end`, `step/start↔end` |
| LLM requests served | **402** | usage events |
| Compactions | **21** (1 parent, 20 children) | `compaction/start↔end` |
| Conversation tokens archived | **679,707 verbatim** | `shadowedTokenCount` sum |
| Inference tokens spent compacting | **0** | deterministic summarize; provider usage shows no summary calls |
| Archive retrievals by the agents | **49 / 49 succeeded, ~497 KB restored** | `tool/call↔tool/result` join |
| Chapters written | **30 registry rows = 30 files on disk**, every shadowed range covered | registry ↔ `.dsh-chapters/` |
| Error / failure / unparseable events | **0** | full scan |
| Deepest single session | **95 requests, 6 compactions** — one task threaded through 6 windows, one stable carried plot | child `6d2d93a6` |
| Steady-state cache hit (quiet windows) | **0.997 – 1.000** | provider usage lines |
| Stock-method equivalence | **≈ 113 min** (derived estimate: 680K prefill tokens @ 100 tok/s + 21 summary generations) | committed results JSON, labeled estimate |

## What the cache did (the honest part)

Mid-run, the parent's provider-side `cacheRead` collapsed from a warm prefix (29,656 tokens, hit .997) to a pinned **9,613** — the exact size of the shared header prefix. The cause was not message mutation but **KV-capacity eviction**: parent + three fan-out children + a live agent session sharing one 65,536-token llama.cpp pool (`total_slots 1`), so prefix lookup kept doing exactly its job — returning the shared 9,613-token header for every divergent chain (a single-slot capacity fact, [§21](/evidence/llamacpp-cache/)). Once the children quiesced, the parent **re-warmed** (read 21,969, hit .97) — the in-place compaction mid-run did not prevent recovery. What the series never showed: the plugin mutating the prefix — the pin was the host's single-slot capacity, never message corruption (the same server, chain left alone, warms straight back to .997; [§21](/evidence/llamacpp-cache/)). Post-compaction, agents re-consulted a 24K-token artifact **three times** — retrieval across a window boundary.

## The two real findings it produced

1. **Plot corruption (fixed).** 8/9 checkpoints of the *first* real run carried the persona instruction's own `'PLOT:'` text as the conversation's plot — a substring-scan bug. Run #2: 0 occurrences; plots genuine and carried. The audit → fix → release loop is [§26](/operations/changelog/).
2. **The command-surface trap (documented).** Slash commands don't run on the draft screen. Now in the [FAQ](/start/faq/) and the [quickstart](/start/quickstart/), because the user finding them by surprise is a docs bug.

## Reproduce / extend

The raw JSON this page renders from is committed (`site/src/data/results/field-run-treeseed-2026-09.json`); the analysis tooling that produced these numbers is a follow-up ticket. The controlled comparison against the other two arms is [§19](/evidence/benchmarks/) — once *your* runner produces it.

Next: [21. Cache behavior on llama.cpp](/evidence/llamacpp-cache/).
