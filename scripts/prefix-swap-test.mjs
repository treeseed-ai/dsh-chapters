#!/usr/bin/env node
/* Server-side prefix-cache probe (no plugins involved).
 * Usage: node scripts/prefix-swap-test.mjs   [server at :8080]
 * Reads (interleaved rounds): B/A requests whose `cached` stays at the shared
 * prefix (~21,277 here) = the known-good single-slot behavior of 2026-09-26.
 * After upgrading llama.cpp AND flipping compose to N_PARALLEL "-1" +
 * LLAMA_ARG_KV_UNIFIED "1": PASS = `cached` climbs toward each chain's OWN
 * prompt size on interleaved rounds (tails survive switches) with no drops;
 * FAIL = "other side closed" at the first mid-size request (upstream
 * unified-KV crash on hybrid-GDN models still present — see the compose
 * comment and docs/verify.md § CACHE).
 */
/* Does THIS llama-server swap cached state out per request prefix?
   Two chains A/B share a long identical system prefix (like all harness
   sessions share the persona header) and carry divergent ~6K-token user
   histories. Interleave them, then give one chain two consecutive turns:
   - prefix swap works  -> each request's cached_tokens ~= its own history length
   - LCP-only reuse     -> interleaved requests fall back to the shared prefix
*/
import fs from 'node:fs'
const WORDS = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ')
const fill = (tag, n, seed0) => { let s = seed0; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const out = []
  for (let i = 0; i < n; i++) out.push(`${tag}${i.toString().padStart(4, '0')} ${WORDS[Math.floor(rnd() * WORDS.length)]} ${WORDS[Math.floor(rnd() * WORDS.length)]} ${WORDS[Math.floor(rnd() * WORDS.length)]}`)
  return out }
const SHARED = fill('shared', 2000, 12345)          // ~5K tokens, identical for both chains
const A = fill('chainA', 2400, 777), B = fill('chainB', 2400, 991)  // divergent ~6K each
async function ask(tag, msgs) {
  const t0 = Date.now()
  const r = await fetch('http://localhost:8080/v1/chat/completions', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen3.8-flash-next', messages: msgs, max_tokens: 6, temperature: 0, cache_prompt: true }) })
  let j; try { j = await r.json() } catch { console.log(tag, 'non-JSON response', r.status); return { reply: '' } }
  if (j.error) { console.log(`${tag.padEnd(6)} HTTP ${r.status} error: ${JSON.stringify(j.error).slice(0,140)}`); return { reply: '' } }
  const u = j.usage || {}
  const cached = u.prompt_tokens_details?.cached_tokens ?? j.timings?.prompt_cached ?? null
  const line = `${tag.padEnd(6)} prompt ${String(u.prompt_tokens).padStart(6)} | cached ${String(cached).padStart(6)} | wall ${((Date.now() - t0) / 1000).toFixed(1)}s`
  console.log(line); fs.appendFileSync('var/prefix-swap-results.txt', line + '\n')
  const txt = j.choices?.[0]?.message?.content ?? ''
  return { reply: String(txt).slice(0, 12) }
}
const sys = { role: 'system', content: 'You are a terse assistant.\n' + SHARED.join('\n') }
const histA = [], histB = []
for (let round = 1; round <= 3; round++) {
  histA.push({ role: 'user', content: `A turn ${round}:\n${A.slice(0, round * 800).join('\n')}\nReply OK-A${round}.` })
  const ra = await ask(`A${round}`, [sys, ...histA]); histA.push({ role: 'assistant', content: ra.reply || 'ok' })
  histB.push({ role: 'user', content: `B turn ${round}:\n${B.slice(0, round * 800).join('\n')}\nReply OK-B${round}.` })
  const rb = await ask(`B${round}`, [sys, ...histB]); histB.push({ role: 'assistant', content: rb.reply || 'ok' })
}
histA.push({ role: 'user', content: 'A consecutive turn 4 (chain A twice in a row now): Reply OK-A4.' })
await ask('A4x', [sys, ...histA])
histA.push({ role: 'assistant', content: 'ok' })
histA.push({ role: 'user', content: 'A consecutive turn 5: Reply OK-A5.' })
await ask('A5x', [sys, ...histA])
