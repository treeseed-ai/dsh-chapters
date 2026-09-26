#!/usr/bin/env node
# Prompt-size escalation probe: finds the size at which the server stops answering.
# Used to distinguish upstream unified-KV crashes (die at ~6K) from honest context-limit refuses (HTTP 400 beyond n_ctx).
# Usage: node scripts/prefix-size-cliff.mjs
/* Find the prompt size at which the server dies: 6K, 12K, 20K, 30K, 45K. */
const WORDS='alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ')
let s=4242; const rnd=()=>(s=(s*1103515245+12345)%2147483648)/2147483648
const filler=(n)=>Array.from({length:n},(_,i)=>`${String(i).padStart(5,'0')} ${WORDS[Math.floor(rnd()*WORDS.length)]} ${WORDS[Math.floor(rnd()*WORDS.length)]} ${WORDS[Math.floor(rnd()*WORDS.length)]}`).join('\n')
for (const lines of [1200, 2400, 4000, 6000, 9000]) {
  const body = JSON.stringify({model:'qwen3.8-flash-next',messages:[{role:'user',content:filler(lines)+'\n\nReply with exactly: SIZED-OK'}],max_tokens:6,temperature:0})
  const t0=Date.now()
  try {
    const r = await fetch('http://localhost:8080/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body})
    const j = await r.json()
    console.log(`~${lines} lines (${Math.round(body.length/1024)}KB body): HTTP ${r.status} prompt ${j.usage?.prompt_tokens} cached ${j.usage?.prompt_tokens_details?.cached_tokens} wall ${((Date.now()-t0)/1000).toFixed(0)}s`)
    if (j.error) console.log('  error body:', JSON.stringify(j.error).slice(0,150))
  } catch (e) { console.log(`~${lines} lines (${Math.round(body.length/1024)}KB body): CRASHED/REFUSED after ${((Date.now()-t0)/1000).toFixed(0)}s: ${String(e.cause?.message ?? e.message).slice(0,80)}`); break }
  await new Promise(r=>setTimeout(r,3000))
}
