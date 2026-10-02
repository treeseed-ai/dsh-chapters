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

What's deliberately absent: the parent's full events (invariant 2 — citation not copying), any summary of a body (the model authors ranges, never text — invariant 4), any shared system-prompt edit (invariant 3). What's present because the numbers said so: **~102 tokens** for this index vs **~2,476** for the transcript it replaces — and every line is a door back to the full bytes ([§9](/concepts/archive-anatomy/)). The CORE RULES block rides under the title when you've approved some — verbatim, budget-capped, refuse-don't-clip ([§13](/knowledge/rules/)).

Next, the receipts: [19. Benchmarks](/evidence/benchmarks/).
