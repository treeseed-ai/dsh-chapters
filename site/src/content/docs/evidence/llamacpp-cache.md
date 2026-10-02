---
title: "21. Cache behavior on llama.cpp"
description: Prefix caching, single-slot arithmetic, what was measured — and what dsh-chapters does and does not do about it.
lastUpdated: true
---

Agentic work is cache-shaped: same prefix + delta per request, so prompt-cache reuse decides whether a turn costs only its delta or re-prefills the whole window. This page is the measured truth, from a day of controlled experiments on the reference box (Qwen3.8-Flash-Next, 8GB VRAM, llama.cpp b10920, `n_ctx 65536`).

## What was measured, in order

1. **Serial sessions warm beautifully.** One tenant at a time: provider `cacheRead` rises monotonically each turn to a steady-state hit of **0.997+** (first live-gated cache run: 0% → 99.7%, monotonic; the field series peaked at 0.997–1.000, [§20](/evidence/field-study/)). Prefix lookup works.
2. **Interleaving pins.** Two synthetic chains sharing a 21K-token prefix, alternating on `--parallel 1`: every request reuses **exactly the shared prefix** and re-prefills its own divergent tail (hit → 0.50). Not a policy bug — a *capacity* fact: one slot holds one sequence state; prefix lookup can only return the longest common prefix.
3. **Compaction invalidates its own tail — and how much survives is per-machine.** Never quote one machine's number for the other. On the **cloud provider**, the post-replacement refill halves: uncached fell 13,658 → ~7,000, meaning **~7.4K of the header stayed cached** across the span replacement. On **llama.cpp** (the target box) the slot reuses **nothing** across a head-position replacement (measured `cacheReuse = 0`): the local win is *not* cache reuse — it is zero-token compaction (a deterministic checkpoint at **0 prompt tokens**, vs **~11 min** for an LLM summary of the same history on that box) plus steady-state turns that cost only their new content. Either way a span replacement is a cache event; it's why we say compaction is *not* a caching win ([§5](/concepts/why-not-summaries/)), and why continuation (new window, small cold start) is the cache-friendly *orientation*.
4. **Unified KV is the fix — with a caveat.** llama.cpp's `--parallel ≥ N` + shared KV pool lets concurrent sequences keep their own tails warm; measured on a patched build, interleaved chains recovered within one request. On one specific build the unified path crashed with hybrid-attention models upstream ([llama.cpp #23210](https://github.com/ggml-org/llama.cpp/issues/23210)); the pinned retest procedure lives in the reference box's compose file. **Check your server's issue state before trusting either story** — this page will age.

## What dsh-chapters actually controls

- it **never mutates sent history** mid-session (append-only, shadowing, arrival-stub deferral — the byte-stability of what you *have* cached; pinned by tape-ledger tests);
- it **shrinks what has to be re-prefilled after compaction** — a ~102-token TOC where the equivalent transcript runs ~2,476 tokens, produced with **0 prompt tokens** on this box (vs ~11 min for an LLM summary) *and* with the originals still retrievable;
- it **is orthogonal to your server config** — the arithmetic above is llama.cpp's, and better caching makes the plugin's retrieval turns cheaper, not wrong.

## Your levers, ranked

1. Keep the single slot for one *live* chain at a time if fan-out depth < 2 (it is genuinely optimal);
2. run `--parallel ≥ max concurrent chains`, with `--ctx-size` as the shared pool — the honest capacity budget is **Σ(concurrent chain lengths) ≤ pool**;
3. quantize KV (`--cache-type-k q4_0` style) to stretch the pool;
4. let sub-agents *finish* rather than interleave when the pool is tight — a child's result is what the parent archives anyway.

Next: [22. The alternatives, compared](/evidence/comparison/).
