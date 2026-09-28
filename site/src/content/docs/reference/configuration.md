---
title: "17. Configuration"
description: Every knob, which plane it lives on, and the one rule that ties them together.
lastUpdated: true
---

No hardcoded tunables anywhere the harness can configure them, and one reference that never lies: the **comment header of the shipped `cordis.patch.yml`** (inside `node_modules/@treeseed/dsh-chapters/`) mirrors the live config schema exactly — enforced by a schema test. This page lists what users reach for; the patch file is the authority.

**Two planes.** `config` (below) is the *host plane* — your profile's plugin entry. The compaction *engine* lives on the *realm plane*: the `chapters` agent-preset row (`presets/chapters/agent.cordis.yml`), which owns `thresholdRatio`, `retainRatio/retainTokens`, `elicitedPlot`, `toolResultArtifactTokens`, `enrichmentTrigger`, and friends. Shared names behave per plane — design record §12.

| Key | Default | Meaning |
|---|---|---|
| `harnessId` | hostname | this machine's identity: commit author, curation partition, rule authorship |
| `knowledgeRemote` | `''` | pre-bind an upstream (else `/chapters-link`) |
| `projectKeyOverride` | `''` | wins over the remote-derived project key |
| `syncDebounceMs` | 30000 | coalesce window for post-archive pushes |
| `enrichmentEnabled` | true | **false makes the whole P2 ladder a pure no-op** — corpus stays fully working |
| `enrichmentModel` | `''` (conversation route) | the annotator override |
| `enrichmentIdleMs` / `enrichmentBatchCap` | 60000 / 5 | idle trigger; chapters per drain |
| `vocabApply` | false | shadow (default) vs git-visible topic curation |
| `vocabCoMin` / `vocabOverlapMin` | 3 / 0.5 | trust thresholds for emergent vocabulary |
| `coreRulesBudgetTokens` | 1200 | the CORE RULES block in notices — **refuses with numbers, never clips** |
| `rulesCoreBonus` | 0.15 | per-machine rank bonus for core-approved rules |
| `continuationBudgetRatio` | 0.25 | TOC + note share of the window *remaining after the header* |
| `chapterTokenTarget` / `chapterLimit` | 8000 / 8000 | soft per-chapter size / hard split |
| `mergeThreshold` | 0.3 | turn→chapter topic-merge τ (archive-time only) |
| `toolResultDeferFloorTokens` | 200 | archive-time inline/defer floor (realm `toolResultArtifactTokens` is the *arrival* floor — keep it **above** your chunk size: below it, stubs hide compaction and thresholds silently stop firing — measured) |
| `artifactStoreRoot` | `.dsh-chapters` | workspace store (must be `read`-reachable) |
| `installChaptersPreset` | true | copy preset into `.agent-presets/` at boot (never clobbers your edits) |
| `fallbackPreset` | `chapters` | mounted for children when the caller's preset can't be resolved |
| `searchDefaultMaxTokens` | 400 | answer packing budget |

Read the row values, change what you own, restart to reload. Next: [18. The continuation notice, annotated](/reference/notice/).
