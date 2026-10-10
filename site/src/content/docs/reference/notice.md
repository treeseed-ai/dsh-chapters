---
title: "18. The continuation notice, annotated"
description: The single message a new session starts with — every section, annotated with what it is and why it exists.
lastUpdated: true
---

A continuation's whole inherited history is one message: exactly one synthetic `user/message` event at seq 0, seeded with source `{ kind: 'plugin', plugin: 'dsh-chapters', form: 'snapshot', sections: [...] }`. Here is the structure, line by line (as `assembleNotice` renders it — `src/continue-core.ts` is its only author):

```markdown
# Continuation: <title>                              ← the branch's headline
                                                       (durable — renamed via the host's title service)

Project: <slug> · <projectKey>                       ← only when a knowledge project is linked, with the
                                                       one-line pointer to chapters_search
<CORE RULES>                                         ← this machine's approved rules, verbatim; over budget
                                                       the continuation refuses, never clips

## Plans on this path
(3 submitted: 1 approved, 1 rejected, 1 pending)
- ACTIVE PLAN: "Carry plans into chapters" — APPROVED
  (ch. 4 · full text: .dsh-chapters/<root>/artifacts/8f/8f3….txt · ~4.6K tok)
  Read the full text with chapters_artifact before implementing. Do NOT re-plan from recall.
- "Carry plans into chapters" — REJECTED — the user sent it back with feedback (ch. 4 …)
- "Rollback plan" — PENDING — the review was never answered (NOT ARCHIVED — parent log seq 11 only)
                                                     ← ONLY when the path holds a plan; a session that never
                                                       entered plan mode gets ZERO bytes here, so its
                                                       notice is identical to before this existed. The
                                                       NEWEST submission is the operative one; superseded
                                                       drafts stay listed, chronological; and anything that
                                                       is not APPROVED says so to the child's face — a plan
                                                       nobody answered must never be implemented. A review
                                                       still open sits in an unfinished turn, above the
                                                       archive ceiling: it is named as live and un-stored

This session continues an archived conversation. Chapters are verbatim Markdown in the workspace;
every byte remains retrievable — inline, or at artifact paths cited inside a chapter. Read a chapter
by its path with the read tool when the detail matters. The previous session stays intact.
                                                     ← the fixed preamble, identical every time

## In flight
<State of play — the handoff note. Free text, the
agent's framing of "here's what's happening now".>   ← budget-checked TOGETHER with the index below;
                                                       "(none stated)" when empty

## Chapters
1. [Deeply analyze this project…](.dsh-chapters/<root>/chapters/001-….md) — <summary> (33 msgs)
2. [Earlier history](.dsh-chapters/<root>/chapters/002-….md) — <summary> ⚠ modified since archived
                                                     ← a PATH to verbatim text, not a paraphrase. The count
                                                       is CONVERSATION messages — injected host context
                                                       (AGENTS.md, skill catalogs) is marked-and-excluded,
                                                       so the same chapter counts identically on every
                                                       machine. ⚠ marks a chapter missing or modified
                                                       since archived — flagged, never trusted

Ancestry: root <session-id>; parent <session-id>; archive under .dsh-chapters/.
                                                     ← explicit back-links, one line; the chapter list
                                                       itself is the ancestor path flattened root-first —
                                                       reading order IS causal order; the model never
                                                       traverses
```

That is the entire inherited-context surface. There is no replay of the parent's last messages and no second index — the TOC is the only index, deliberately (a regenerated duplicate would drift).

A plan is the highest-value thing a continuation can inherit, and the one thing a child cannot reconstruct:
`exit_plan_mode` puts the whole design in a tool-call argument, and DSH does not let a created session
inherit plan mode. So the operative plan's title, verdict, chapter and artifact path ride above the fold —
~40 tokens that stand between a child and the two failure modes: implementing something nobody approved, or
re-planning from recall. Its full bytes stay in the store (see [§9](/concepts/archive-anatomy/)); the notice
names where they are, the budget counts every one of them, and an over-budget continuation still refuses
rather than clipping a single line.

What's deliberately absent: the parent's full events (invariant 2 — citation not copying), any summary of a body (the model authors ranges, never text — invariant 4), any shared system-prompt edit (invariant 3). What's present because the numbers said so: **~102 tokens** for this index vs **~2,476** for the transcript it replaces — and every line is a door back to the full bytes ([§9](/concepts/archive-anatomy/)). The CORE RULES block rides under the title when you've approved some — verbatim, budget-capped, refuse-don't-clip ([§13](/knowledge/rules/)).

Next, the receipts: [19. Benchmarks](/evidence/benchmarks/).
