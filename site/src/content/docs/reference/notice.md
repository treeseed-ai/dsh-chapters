---
title: "18. The continuation notice, annotated"
description: The single message a new session starts with — every section, annotated with what it is and why it exists.
lastUpdated: true
---

A continuation's whole inherited history is one message. Here is one, line by line (from a real session in the field study):

```markdown
# Continuation: <title>                                   ← the branch's headline
                                                              (durable, renamed properly via the host service)

<State of play — the handoff note. Free text, the agent's
or human's framing of "here's what's happening now".>        ← budget-checked TOGETHER with the TOC below

## Conversation TOC

1. [Deeply analyze this project…](.dsh-chapters/<root>/chapters/001-….md)
   — 33 user / 21 assistant messages (16,055 est tokens)     ← a PATH to verbatim text, not a paraphrase;
2. [Earlier history](.dsh-chapters/<root>/chapters/002-….md)   counts are CONVERSATION bytes — injected host
   — …                                                        context (AGENTS.md, skill catalogs) is marked-and-excluded,
                                                              so the same chapter counts identically on every machine

<RECENT TURNS: …>                                            ← the last few messages carried forward verbatim,
                                                              so the session doesn't start cold

<details>                                                    ← ancestry back-links: root session, parent session.
                                                              The DAG flattened chronologically — reading order
                                                              IS causal order; the model never traverses
```

- **CORE RULES** (when you've approved some): verbatim, budget-capped, refuse-don't-clip ([§13](/knowledge/rules/)).

What's deliberately absent: the parent's full events (invariant 2 — citation not copying), any summary of a body (the model authors ranges, never text — invariant 4), any shared system-prompt edit (invariant 3). What's present because the numbers said so: **~102 tokens** for this index vs **~2,476** for the transcript it replaces — and every line is a door back to the full bytes ([§9](/concepts/archive-anatomy/)).

That's the entire inherited-context surface. Next, the receipts: [19. Benchmarks](/evidence/benchmarks/).
