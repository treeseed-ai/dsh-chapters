---
title: "12. Search"
description: How the two-layer index is built, what ranks, and why search quality is identical online and offline.
lastUpdated: true
---

`chapters_search` answers over the **mirror** — so it behaves identically offline, on git, or on TreeDX, and its inputs are plain files you can grep.

## What's indexed

**Layer 1 — fragments.** Append-only JSONL written at archive/sync time: path, title, summary, topics, token estimate, provenance tags. Cheap, never rewrites anything, survives any transport. Adjacent legacy fragments are **stitched at index level** into one coherent entry citing all members — coherence without touching the disk record.

**Layer 2 — the derived index.** Rebuilt deterministically from the store: fragments → ranked, deduplicated, topic-joined. Rebuildable from primaries at any time, which is why divergence is recovery, not corruption.

## What ranks

- lexical score over title/summary/topics/body-snippets, packed to a token budget (`searchDefaultMaxTokens`, default 400) — the *shape* of the answer is bounded, the corpus is not;
- **topic-awareness** — emergent vocabulary from the enrichment ladder ([§14](/knowledge/enrichment/)) aliases surface forms; candidates are applied only if `vocabApply` is on, so the default posture is *shadow, review, then enable*;
- **per-machine rule bonus** (`rulesCoreBonus`) — rules you approved *on this machine* rank their categories higher; teammates get their own ranking from their own approvals.

## Why the receipts in the answer

Each hit cites `chapters/<key>/…md` — a path to verbatim text, not a paragraph to trust. That closes the loop back to the archive: search is the address book, `read` is the retrieval, and the guarantee stays "every byte remains retrievable." The [field study](/evidence/field-study/) watched agents do exactly this 49 times without being prompted.

Continue: [Rules & governance](/knowledge/rules/).
