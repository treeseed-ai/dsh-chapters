---
title: "9. Anatomy of the archive"
description: Every artifact the system writes, what lives where, and why the split is exactly as deep as it needs to be.
lastUpdated: true
---

Three durable layers, in three different places on purpose:

## 1. The workspace store — `read`-reachable text

```
.dsh-chapters/
  artifacts/<aa>/<sha256>.txt   # store-root blobs — content-addressed oversized tool results, shared across every session
  <root-session>/
    chapters/001-<slug>.md      # verbatim body + YAML frontmatter (title, seq range, body hash, topics)
```

Why the workspace: the model reloads chapters with its ordinary `read` tool, so the text must live where `read` reaches — a `$HOME` path can be reachable-but-not-writable or writable-but-not-readable; the workspace is the one place both guarantees hold. Content-addressing applies to the artifacts: identical tool results anywhere in the archive are stored **once**, at the store root — and since 0.1.4 they publish to the pool too, so a teammate's `chapters_artifact` read resolves the blob from the shared mirror when the local store doesn't hold it. Chapter bodies need no dedup — each is one validated, non-overlapping range of the log, so the same text never appears in two chapters.

## 2. The harness storage domain — bookkeeping

```
storages/dsh_chapters.json   (DSH home, plugin-owned domain)
```

Ancestry edges, chapter numbering, body hashes, per-session TOC bullet lists, registry of collections. Structured, atomic-ish, restart-safe. The rule of thumb everywhere in this system: **anything a human should `read` is a file in the workspace; anything a machine should join is the storage domain.** The corpus is grep-able by design, the ledger is transactional by necessity.

## 3. The pool + mirror — the transportable mind

A linked upstream ([§10](/knowledge/pool/)) holds `chapters/`, `artifacts/`, `rules/`, and the *derived* two-layer index (`index/` fragments stitched into ranked entries, `collections/`, `topics/vocabulary.json`). The local mirror (`.dsh-knowledge/` clone) is what search actually queries — so search quality is identical online, offline, git or TreeDX. Which brings us to the knowledge layer proper:

Part III — [The pool](/knowledge/pool/) · [Providers: git vs TreeDX](/knowledge/providers/) · [Search](/knowledge/search/) · [Rules & governance](/knowledge/rules/) · [Enrichment](/knowledge/enrichment/)
