# Tape provenance — `plans` project

**Distilled 2026-10-10 from the SCRIPTED upstream** (`tests/e2e/stub-model.ts`), not
from the live Local model. Read this before trusting what the tape proves.

| | |
|---|---|
| Journey | `tests/e2e/plans.spec.ts` — plan mode entered with `/plan <message>`, a real `exit_plan_mode` tool call, the host's plan-review card opened and answered by a real click, then `/chapters-fork` |
| Served by | `node tests/e2e/stub-model.ts` (OpenAI-compatible SSE on :8081), started with `E2E_UPSTREAM=http://127.0.0.1:8081` |
| `model` field in the JSON | `qwen3.8-flash-next` — the proxy records the REQUEST's route name, so this field says nothing about what answered. The provenance is this file |
| Why not the live model | the local model server dropped the stream mid-turn, on both attempts — see "Attempted live, twice" below; the scripted upstream made the browser plane reproducible the same day |

## What this tape proves, and what it does not

**Proves** — everything on our side of the seam, in a real browser against a real
harness: the plan-mode policy section is composed by the preset, the host executes
`exit_plan_mode`, opens its review and logs `plan/mode`, `tool/call` and
`tool/result` in the shapes `src/plans.ts` reads; the archive writes the Plans
block, the artifact holds the plan byte-for-byte, and the child's single seeded
event calls the plan out. It also CAUGHT two wrong assumptions of mine during
distillation: approving a plan leaves plan mode (so the folded `planMode:` is
`inactive`, not `active`), and the chip in the toolbar is an EXIT control only —
`/plan` is the entry door.

**Does not prove** that a trained model would choose to submit that plan. The
scripted upstream decided that, and it decided it on every turn.

## Attempted live, twice, on 2026-10-10

Both attempts failed identically, so nobody re-tries this blind: the model container
(`qwen-flash-next`, reporting *healthy*) accepted the request and then **dropped the stream mid-turn** —
the session log ends `turn/end {reason:{kind:"error", error:{message:"terminated", code:"TRANSPORT"}}}` —
once after ~50 s on an 8-token probe, and once after **15 minutes** with no tool call emitted and zero
tape entries recorded. A `/v1/models` answer is therefore NOT evidence the server can finish a turn: get a
real completion through `curl /v1/chat/completions` with a header the size the journey actually sends
(~17K tokens) before scheduling a re-record.

## Re-recording from the live model

Retires this note. Nothing else changes — the spec is the same spec:

```bash
rm -f tests/fixtures/model-tape/plans/*.json
E2E_MODEL=record E2E_TAPE=plans E2E_PORT=41750 E2E_THRESHOLD=0.9 \
  PLAYWRIGHT_BROWSERS_PATH=$PWD/var/ms-playwright \
  npx playwright test -c tests/e2e/playwright.config.ts --project=plans
```

The `:8080` server must be healthy (`curl localhost:8080/v1/models`), and the model
has to actually call `exit_plan_mode` — if it answers in prose instead, the review
never opens and the spec fails loudly rather than recording a session that never
planned. Then update this file to say the tape is model-distilled.
