# Tape provenance — `prompt` project

**Distilled 2026-10-22 from the SCRIPTED upstream** (`tests/e2e/stub-model.ts`,
`SUGGEST_TRIGGER` arm), against the pinned host 0.2.0-rc.2 (`dev/dsh-host-lock`).
Read this before trusting what the tape proves.

| | |
|---|---|
| Journey | `tests/e2e/prompt-suggestion.spec.ts` — a session takes one real turn; the composer ghost offers the second reader's line; typing hides it; an emptied draft re-shows it; ArrowRight accepts it into the draft; Enter sends it; the durable log holds the human message and NEVER the reader persona |
| Served by | `node tests/e2e/stub-model.ts` (OpenAI-compatible SSE on :8081), started with `E2E_UPSTREAM=http://127.0.0.1:8081` |
| Entries | `0000` the session turn, `0001` the title call, `0002` the **second-reader suggest call** — the auxiliary call is a real `ctx.llm.stream` through the profile's `local` provider to the tape proxy, so the routing, the bound `enrichmentMaxTokens`, and the host-side cache watermark all ran for real |
| `model` field | `qwen3.8-flash-next` — the proxy records the REQUEST's route name; what answered is this file |
| Boot pins | `E2E_PROMPT=1` (writes `promptModel: local/qwen3.8-flash-next` into the plugin row — the ONLY project whose boot carries it), threshold 0.99, `E2E_NO_AUX_MODEL=1`, port 41739 |

## What this tape proves, and what it does not

**Proves** — in a real browser against a real harness: the `conversation.input.overlay`
registration loads, the idle-boundary pull executes `/chapters-prompt suggest` over
`remote.commands`, the host routes one bounded auxiliary call, the chip renders the
answer, typing hides it, **ArrowRight acceptance writes the draft through the host's own
`InputActions.setDraft`**, Enter sends, and the accepted bytes arrive in the durable log
as an ordinary human message with the persona line nowhere near it. It also proved the
first product bug of this feature for free: the journey's `localModelUp` guard had to be
fixed to probe a LOCAL `E2E_UPSTREAM` port — the #54 silent-skip family, one port smaller.

**Does not prove** that a trained model picks a good next prompt — the recommendation is
the scripted arm's fixed line. That half belongs to a live distill
(`E2E_MODEL=record` against a healthy Local model), which can re-record this same project
without touching the product.

**Replay status**: this tape was distilled ON the pinned 0.2.0-rc.2 host — ahead of the
corpus, which still replays nothing until the OTHER eight projects are re-anchored
(#56). When the chain re-anchors, `--project=prompt` joins it as the ninth leg.
