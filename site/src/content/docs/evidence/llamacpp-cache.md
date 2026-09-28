---
title: "21. Cache behavior on llama.cpp"
description: Prefix caching, single-slot arithmetic, what was measured — and what dsh-chapters does and does not do about it.
lastUpdated: true
---

Agentic work is cache-shaped: same prefix + delta per request, so prompt-cache reuse is the difference between $0.02 turns and watching a local model re-prefill 40K tokens for the ninth time. This page is the measured truth, from a day of controlled experiments on the reference box (Qwen3.8-Flash-Next, 8GB VRAM, llama.cpp b10920, `n_ctx 65536`).

## What was measured, in order

1. **Serial sessions warm beautifully.** A one-tenant chain: provider `cacheRead` rising monotonically each turn, steady-state hit **0.997–0.998** — on the plugin, with 21-window-sized conversations. Prefix lookup works.
2. **Interleaving pins.** Two synthetic chains sharing a 21K-token prefix, alternating on `--parallel 1`: every request reuses **exactly the shared prefix** and re-prefills its own divergent tail (hit → 0.50). Not a policy bug — a *capacity* fact: one slot holds one sequence state; prefix lookup can only return the longest common prefix.
3. **Compaction invalidates its own tail** — any compaction's (span replacement's) fault: provider cacheRead falls to the prefix before the replacement point. Both stock summarizers and deterministic checkpoints pay this; it's why we say compaction is *not* a caching win ([§5](/concepts/why-not-summaries/)), and why continuation (new window, small cold start) is the cache-friendly *orientation*.
4. **Unified KV is the fix — with a caveat.** llama.cpp's `--parallel ≥ N` + shared KV pool lets concurrent sequences keep their own tails warm; measured on a patched build: chains recovered within one request, hit back to 0.998. On one specific build the unified path crashed with hybrid-attention models upstream ([llama.cpp #23210](https://github.com/ggml-org/llama.cpp/issues/23210)); the pinned retest procedure lives in the reference box's compose file. **Check your server's issue state before trusting either story** — this page will age.

## What dsh-chapters actually controls

- it **never mutates sent history** mid-session (append-only, shadowing, arrival-stub deferral — the byte-stability of what you *have* cached; pinned by tape-ledger tests);
- it **shrinks what has to be re-prefilled after compaction** — a ~102-token TOC beats re-summarizing a 40K transcript *and* keeps the originals retrievable;
- it **is orthogonal to your server config** — the arithmetic above is llama.cpp's, and better caching makes the plugin's retrieval turns cheaper, not wrong.

## Your levers, ranked

1. Keep the single slot for one *live* chain at a time if fan-out depth < 2 (it is genuinely optimal);
2. run `--parallel ≥ max concurrent chains`, with `--ctx-size` as the shared pool — the honest capacity budget is **Σ(concurrent chain lengths) ≤ pool**;
3. quantize KV (`--cache-type-k q4_0` style) to stretch the pool;
4. let sub-agents *finish* rather than interleave when the pool is tight — a child's result is what the parent archives anyway.

Next: [22. The alternatives, compared](/evidence/comparison/).
