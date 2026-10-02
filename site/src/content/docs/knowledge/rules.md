---
title: "13. Rules & governance"
description: How a team teaches its agents durable behavior without one shared file ever rewriting another machine's mind.
lastUpdated: true
---

Rules are short, category-tagged instructions — "check the archive before starting", "always run the tape replay before tagging" — the steering wheel for agent behavior on a project. **Approved** rules ride verbatim into every continuation notice; proposed rules affect nothing until a human approves them.

## The lifecycle (nothing is auto-applied)

1. **Propose** — `/chapters-rule add <category> "<text>"` (or the model's own `chapters_rule_propose` tool). The file is **write-once**: proposed rules are never edited in place; you amend with a new id. Proposed rules bind *nothing*.
2. **Review** — `/chapters-rule list [--proposed|--all|--category <c>]`.
3. **Approve** — `/chapters-rule approve <id>` — and this is the load-bearing word.

Nothing is auto-applied: topic-matched auto-inclusion (record §7.4) is designed but deliberately not shipped — every approval is a human act.

## Approval is a per-machine curation fact, never a shared rewrite

The single design decision that makes team memory survivable: **approval never rewrites a shared file**. It is recorded as a machine-local curation fact keyed by your `harnessId` — the same principle as shadow-by-default vocabulary, and its opposite is every "team prompt" system that turns one person's `git push` into instructions *everywhere*. On your machine you approve the rules that bind your agents; a teammate decides their own; nobody governs the other by committing text. `revoke` is the same fact withdrawn.

## How they reach the model

Approved-core rules compose into a **CORE RULES block inside the continuation notice** — the *only* channel (invariant 3: the global system prompt is never touched). When no rules are approved the block is byte-identical — **absent** (golden-tested), so a rules-free project renders no section at all. The block is sized by the same doctrine as the budget: over `coreRulesBudgetTokens` (default 1,200) and the composition **refuses with per-rule numbers rather than clipping**.

## Search tie-in

Rules your *own* machine has core-approved get a small rank bonus in search (`rulesCoreBonus`) — computed per machine at query time, never baked into the shared index shards — so retrieval is tuned to each machine's governance state without any shared ranking.

Continue: [Enrichment ladder](/knowledge/enrichment/).
