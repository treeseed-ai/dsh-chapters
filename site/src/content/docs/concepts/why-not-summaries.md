---
title: "5. Why not summaries?"
description: The two real costs of summarize-to-compact — the paraphrase you must trust, and the inference tax that grows with your history.
lastUpdated: true
---

Summarization-based compaction solves the immediate problem — the window is full — and creates two others.

## 1. The paraphrase you must trust

A summary drops the exact flag, the line number, the error text — and leaves the model no handle to go get them back. What survives in context is a rewrite it must believe. When the task turns on a detail, *there is no "reload the original"*: it was discarded, and the durable record is invisible to the agent. This isn't a tuning problem; it is the mechanism.

dsh-chapters inverts it: the archive is **verbatim text written from the session log** (a file copy), and the index is a Table of Contents whose every line is a path back to that text. The guarantee is not "the chapter contains the whole history" — it is "**every byte remains retrievable**", with retrieval a first-class agent action.

## 2. The summarization tax

Producing a summary means prefilling the whole history into one auxiliary call — and repeating that every time the window fills:

| History | 30 tok/s | 100 tok/s | 300 tok/s |
|---|---|---|---|
| 32K | 18 min | 5 min | 2 min |
| 100K | **55 min** | 17 min | 3.5 min |

On local hardware that is not "slow", it is *stop-working* slow. The index this plugin carries instead cost, measured, **~102 tokens** where the equivalent transcript ran ~2,476 — and produced with **zero inference**. The field number to anchor on: a real 10-session production run archived **680K tokens across 21 compactions at 0 model tokens**; the stock equivalent pays that 680K as prefill, repeatedly, plus the generation.

## And the tax you don't want to hear either

Honesty is a feature here: compaction is **not cheaper for prompt caching**. Replacing a span mid-conversation invalidates everything after it — every compaction scheme's cold tail (measured on llama.cpp, it re-prefills). Continuation pays one cold prefill (header + TOC + note) like any post-compaction request does. What continuation *buys* instead: verbatim reload, an untouched cacheable parent, reversibility, and branchable history. If a vendor pitches compaction as a caching win, they are selling you the one axis this design concedes by name.

Next: [6. The four invariants](/concepts/invariants/) — the rules that make the above trustworthy rather than merely convenient.
