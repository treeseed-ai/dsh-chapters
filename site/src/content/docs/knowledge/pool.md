---
title: "10. The pool"
description: What a shared knowledge pool is, what goes in, what's derived, and what every linked workspace gets for free.
lastUpdated: true
---

A **pool** is a git repository (or TreeDX workspace) that holds your chapter corpus and its derived indices, shared across machines. One `/chapters-link` connects a workspace; the sync loop then does the rest in the background (debounced by `syncDebounceMs`, default 30 s).

## What travels

| Path | Kind | Notes |
|---|---|---|
| `chapters/<projectKey>/<session>/NNN-slug.md` | primary | verbatim text — the authority |
| `artifacts/<projectKey>/<aa>/<sha>.txt` | primary | content-addressed blobs (shared across sessions — the per-session prefix is dropped) |
| `collections/<projectKey>/<session>.jsonl` | primary | one JSONL line per completed turn — the composition signature |
| `rules/<projectKey>/<harnessId>/NNN-slug.md` | primary | **proposed** rule files only — write-once; approval status rides per-machine facts, never the file |
| `index/` | derived | one shard per canonical topic + a build manifest, rebuilt deterministically at sync |
| `topics/vocabulary.json` | derived | canonical vocabulary + aliases (candidates stay shadow-only until `vocabApply`) |
| `edits/<harness>/curation.jsonl` | curation | per-machine curation and rule-status facts — one writer per file, ever |

Derived is *always rebuildable from primaries* — divergence resolves by rebuilding the mirror from the store, which is why a force-push history rewrite is recoverable and a pool is never a hostage.

## What every linked workspace gets

- **`chapters_search`** over the pool — the *previous* project session's findings, the teammate's incident writeup, ranked with topic awareness and a per-machine core-rule bonus ([§12](/knowledge/search/)).
- **Rules** ([§13](/knowledge/rules/)) proposed here, approved there — each machine's approval state is its own fact, never imposed.
- **Cross-machine identity**: `harnessId` stamps authorship on edits and pushes; project keys derive from the remote identity (deliberately credential-stripped — pasting a URL with or without `user:token@` cannot fork your pool, a pinned bug from 2026-09).

## Continuation carries the thread forward

Ancestor paths are walked, flattened chronologically, and printed *with explicit back-links* — the child session's notice is the only index (no second manifest that could drift; reading order is causal order at any depth or branching).

Continue: [Providers: git vs TreeDX](/knowledge/providers/).
