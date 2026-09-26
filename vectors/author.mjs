// Deliberate authoring command; no test or check invokes this file.
import { createHmac, createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const secret = 'synthetic-test-secret'
const ts = 1700000000
const now = ts
const b64 = (bytes) => Buffer.from(bytes).toString('base64url')
const sign = (s, t, n, p) => b64(createHmac('sha256', s).update(`${t}.${n}.${p}`, 'utf8').digest())
const result = []
function vector(id, payloadText, offset, expected, wrongAnswer, nonce=id) {
  const payloadBytes = Buffer.from(payloadText, 'utf8')
  const payload = b64(payloadBytes)
  const env = { ts, nonce, payload, sig: sign(secret,ts,nonce,payload) }
  result.push({id, secret, now:now+offset, payloadUtf8:payloadText, payloadBytesHex:payloadBytes.toString('hex'), signingInput:`${ts}.${nonce}.${payload}`, envelope:env, expected, wrongAnswer})
}
vector('health', '{"action":"health"}', 0, 'accept', 'signing a digest or reserialized value')
vector('non-ascii', '{"action":"create","description":"晚餐🍜"}', 0, 'accept', 'incorrect UTF-8 handling')
vector('plus-300', '{"action":"health"}', 300, 'accept', 'exclusive upper boundary')
vector('plus-301', '{"action":"health"}', 301, 'request timestamp outside allowed window', 'accepting expired/future timestamp')
vector('minus-300', '{"action":"health"}', -300, 'accept', 'exclusive lower boundary')
vector('minus-301', '{"action":"health"}', -301, 'request timestamp outside allowed window', 'accepting stale timestamp')
vector('alternate-compact', '{"a":1,"b":2}', 0, 'accept', 'canonical JSON requirement')
vector('alternate-spaced', '{ "a": 1, "b": 2 }', 0, 'accept', 'canonical JSON requirement')
vector('tampered-payload', '{"action":"health"}', 0, 'bad signature', 'checking decoded payload or metadata only')
result.at(-1).envelope.payload = b64(Buffer.from('{"action":"healTh"}'))
vector('tampered-signature', '{"action":"health"}', 0, 'bad signature', 'accepting altered MAC')
result.at(-1).envelope.sig = 'A'+result.at(-1).envelope.sig.slice(1)
vector('missing-nonce', '{"action":"health"}', 0, 'missing nonce', 'partially processing missing field')
delete result.at(-1).envelope.nonce
vector('nonfinite-ts', '{"action":"health"}', 0, 'missing ts', 'processing nonfinite timestamp')
result.at(-1).envelope.ts = 'NaN'
vector('missing-payload', '{"action":"health"}', 0, 'missing payload', 'processing missing payload')
delete result.at(-1).envelope.payload
vector('missing-signature', '{"action":"health"}', 0, 'missing sig', 'processing unauthenticated payload')
delete result.at(-1).envelope.sig
vector('nonobject-envelope', '{"action":"health"}', 0, 'invalid envelope', 'processing a structurally invalid request')
result.at(-1).envelope = null
const ledger = {secret:'test-secret', input:{action:'create_transaction',idempotencyKey:'3b241101-e2bb-4255-8caf-4136c566a962',transaction:{type:'支出',date:'2026-07-26',time:'12:30',amount:260,currency:'TWD',account:'現金',category:'食-外食',payee:'路易莎',description:'午餐'}},envelope:{ts,nonce:'3b241101-e2bb-4255-8caf-4136c566a962',payload:'eyJhY3Rpb24iOiJjcmVhdGVfdHJhbnNhY3Rpb24iLCJpZGVtcG90ZW5jeUtleSI6IjNiMjQxMTAxLWUyYmItNDI1NS04Y2FmLTQxMzZjNTY2YTk2MiIsInRyYW5zYWN0aW9uIjp7InR5cGUiOiLmlK_lh7oiLCJkYXRlIjoiMjAyNi0wNy0yNiIsInRpbWUiOiIxMjozMCIsImFtb3VudCI6MjYwLCJjdXJyZW5jeSI6IlRXRCIsImFjY291bnQiOiLnj77ph5EiLCJjYXRlZ29yeSI6Iumjny3lpJbpo58iLCJwYXllZSI6Iui3r-aYk-iOjiIsImRlc2NyaXB0aW9uIjoi5Y2I6aSQIn19',sig:'1V4I3O1YucC3QW6Jx-4Hkd6jBDL-mdGFACON0-nGthc'}}
const pwa = {secret:'test-secret', input:{action:'create',expense:{payer:'cheng',bearer:'平分拆帳',amount:260,currency:'TWD',category:'食-家庭',description:'晚餐',paymentMethod:'LINE Pay'}},envelope:{ts,nonce:'3b241101-e2bb-4255-8caf-4136c566a962',payload:'eyJhY3Rpb24iOiJjcmVhdGUiLCJleHBlbnNlIjp7InBheWVyIjoiY2hlbmciLCJiZWFyZXIiOiLlubPliIbmi4bluLMiLCJhbW91bnQiOjI2MCwiY3VycmVuY3kiOiJUV0QiLCJjYXRlZ29yeSI6Iumjny3lrrbluq0iLCJkZXNjcmlwdGlvbiI6IuaZmumkkCIsInBheW1lbnRNZXRob2QiOiJMSU5FIFBheSJ9fQ',sig:'JWjK0sEG8i7zcyx5mp3L8HgVugFVb3PFokS4gaxxn8U'}}
for(const [id, f] of [['legacy-ledgers',ledger],['legacy-pwa',pwa]]) {const bytes=Buffer.from(f.envelope.payload,'base64url');result.push({id,secret:f.secret,now:ts,payloadUtf8:bytes.toString('utf8'),payloadBytesHex:bytes.toString('hex'),signingInput:`${ts}.${f.envelope.nonce}.${f.envelope.payload}`,envelope:f.envelope,signerInput:f.input,expected:'accept',wrongAnswer:'breaking committed consumer fixture compatibility'})}
const body=JSON.stringify(result,null,2)+'\n'
writeFileSync(new URL('./envelopes.json', import.meta.url),body)
writeFileSync(new URL('./digests.json',import.meta.url),JSON.stringify({'envelopes.json':createHash('sha256').update(body).digest('hex')},null,2)+'\n')
