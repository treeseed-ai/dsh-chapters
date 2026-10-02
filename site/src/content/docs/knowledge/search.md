---
title: "12. Search"
description: How the two-layer index is built, what ranks, and why search quality is identical online and offline.
lastUpdated: true
---

`chapters_search` answers over the **mirror** — so it behaves identically offline, on git, or on TreeDX, and its inputs are plain files you can grep.

## What's indexed

Search reads every chapter and rule file in the mirror, frontmatter first. The two-layer index around it:

**Layer 1 — curation facts.** Per-machine, append-only JSONL at `edits/<harnessId>/curation.jsonl`: topic aliases, pins, weights, groups, notes — and this machine's rule-approval facts. One writer per file, ever; zero conflicts by construction.

**Layer 2 — the derived index.** One shard per canonical topic (`index/<topic>.md`, alphabetical) plus a build manifest, rebuilt deterministically from the corpus at every sync. Incremental when nothing changed; a full rebuild from primaries is the recovery path — which is why divergence is recovery, not corruption.

**Stitching.** Legacy compaction fragments (pressure-sliced chapters titled "Earlier history" / "Conversation span") that sit adjacent within a session cohere into ONE search entry citing every member — nothing merged on disk, no chapter rewritten.

## What ranks

- **Lexical score**, deterministic and inspectable: topic hits ×2, title and summary ×1 each — a rule's body scores as its summary, and a category match adds 1.5. Recency only breaks ties (a fresh file that matched no term never ranks). Results pack to a token budget (`searchDefaultMaxTokens`, default 400) — the *shape* of the answer is bounded, the corpus is not, and `total` vs `shown` says when to raise the budget;
- **topic-awareness** — emergent vocabulary from the enrichment ladder ([§14](/knowledge/enrichment/)) aliases surface forms; candidates are applied only if `vocabApply` is on, so the default posture is *shadow, review, then enable*;
- **per-machine rule bonus** (`rulesCoreBonus`, default 0.15) — rules you approved *on this machine* rank their categories higher; teammates get their own ranking from their own approvals.

## Why the receipts in the answer

Each hit cites `chapters/<key>/…md` — a path to verbatim text, not a paragraph to trust. That closes the loop back to the archive: search is the address book, `read` is the retrieval, and the guarantee stays "every byte remains retrievable." The [field study](/evidence/field-study/) watched agents follow chapter paths with `read` 49/49 times.

Continue: [Rules & governance](/knowledge/rules/).
