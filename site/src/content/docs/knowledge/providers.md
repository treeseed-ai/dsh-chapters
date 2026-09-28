---
title: "11. Providers: git vs TreeDX"
description: Six transport verbs, two shipped backends, one honest failure model — the same file tree either way.
lastUpdated: true
---

Transport is a **provider seam** (design record: *transport is pluggable; git is one provider*). Six verbs — clone / pull / push / commit / list / fetch — carry every sync path. Two backends ship; the layer above (search, rules, index, notices) reads the **materialized mirror** and is identical under both.

|  | **`git`** (default) | **`treedx`** |
|---|---|---|
| Address | `https://…/pool.git` + token, or a **local path** (no credentials) | `treedx+<url>/<repo>` + bearer token (token always required) |
| Wire | git smart-HTTP via isomorphic-git; plain repo, browsable by any git client | TreeDX service API: workspace-create → overlay writes → commit, lease-managed |
| Mirror memory | cloned mirror dir under the store | `.treedx-state.json` remembers the served head |
| Contention | push rejected → ff-pull retry → **divergence = rebuild from the store** | lease contention maps onto the same ladder; moved-head → diverged |
| Listing | git objects | paginated `paths/list` — **followed to the end** (a real truncation bug at >100 paths, caught live and pinned by a paginating stub) |
| Migration | — | every pre-existing record has `kind` absent ⇒ `git`; upgrading the transport changed no stored state |

## The shared failure model (tested as contract, not style)

- **Degrade to `local-only` naming the failed step** — the mirror stays current, the push lands when the remote returns. An auth rejection is reported *as an auth rejection*, never as "unreachable" (a live incident made that law).
- **The store is the truth, transport is expendable** — every divergence resolves by destroying and rebuilding the mirror from local state.
- **Zero-credential local mode** (`/chapters-link ./vendor/kb.git`) — a git upstream on disk needs no secrets at all; the air-gapped path is first-class.

## Which to run

Start on **git**: your infra, reviewable with `git log`, no service to operate. Move to **TreeDX** when you want the server-side model — service-enforced tokens, overlays as an API, and a knowledge *service* rather than a repository.

Continue: [Search](/knowledge/search/).
