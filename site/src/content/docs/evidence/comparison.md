---
title: "22. The alternatives, compared"
description: An honest map of every other way to solve long context, and where each one wins and loses.
lastUpdated: true
---

There are good alternatives, and they win some axes. This is the honest map.

| Method | Fidelity | Inference cost | Infra | What it's genuinely better at |
|---|---|---|---|---|
| **Long context** (1M-window models) | perfect | API-priced | none | when the budget is unbounded and the whole thing fits in one head |
| **LLM summarization / auto-compact** | lossy | full-history prefill **every** compaction | none | *context economy* — one small block always in view |
| **Vector-RAG conversation memory** (Mem0 et al.) | lossy (chunks) | embedding tax per write + read | vector DB | semantic recall under paraphrase ("that thing about the auth bug") |
| **Knowledge graphs** (Zep / Graphiti) | lossy (extraction) | heavy (LLM extraction) | graph infra | structured entity relationships over time |
| **MemGPT / Letta hierarchy** | lossy on eviction | model-authored memory ops | memory server | autonomous, always-on self-managing memory |
| **dsh-chapters** | **verbatim** | **0 to compact** | none (files + git) | exact retrievability, zero-token windowing, append-only trust |

## Where each wins (no asterisks)

- **1M context** if you have it and your tasks fit: it's perfect memory; the plugin's pitch shrinks as windows grow (until cost, latency, and *needle-in-haystack quality* matter again — RLM's evidence is that they do).
- **LLM summarization** genuinely beats on *always-in-view* small state: the model reads its own summary every turn and doesn't have to *ask*. A TOC must be queried. For "the model should just know the gist", a summary is the right tool — and dsh-chapters' checkpoints, when the `chapters` preset is mounted, are summaries too (deterministic, with a carried plot — the *same* trade in a different currency).
- **Semantic RAG** wins fuzzy recall across phrasings; keyword+topic search on titles/summaries is deliberately narrower infrastructure, and can't be beaten on "give me the *exact bytes*".
- **Knowledge graphs** win aggregate structure ("who depends on whom across 200 sessions"); the archive stays episodic truth.

## Where nothing else reaches

- compaction at **0 inference tokens** with **verbatim reload** — that combination is the niche, built for local models where prefill is wall-clock, *and* it makes a 64K model as capable as a 1M one in exactly the same shape.
- **Append-only trust**: the durable log is never rewritten by *anything*, and the archive is the log — audit trails, reversibility, forensics.
- **Zero infra**: Markdown + your git, works offline, and it's yours.

## The honest caveat on every "wins" cell

This table's dsh-chapters column is from measured runs ([§20](/evidence/field-study/)); the competitor columns are from *their* general literature. The arms benchmark ([§19](/evidence/benchmarks/)) exists precisely so the comparison can be run on one machine rather than argued from blogs — that's the last thing to do here, not this page.

Next: [23. Install, upgrade, provenance](/operations/install/).
