import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import vm from 'node:vm'
import { buildEnvelope } from '../src/envelope.ts'
import { CONSUMERS } from '../model/consumers.ts'
import { ENVELOPE } from '../model/envelope.ts'
import { CONSUMER_TERMS, PARTNER_SPLIT_MODES, SOLO_TRANSACTION_TYPES, SOLO_IOU_TYPES, PARTNER_ENTRY_HEADERS, SOLO_JOURNAL_HEADERS, WEB_DETAIL_HEADER, WEB_ACCOUNT_HEADER, assertShape, requireTerm } from '../model/vocabulary.ts'
import { expectedArtifacts } from '../generators/emit.mjs'
import { MemoryDurableAdapter, protectedEffect } from '../src/nonce.ts'

const vectors=JSON.parse(readFileSync(new URL('../vectors/envelopes.json',import.meta.url)))
const source=readFileSync(new URL('../src/verify.gs',import.meta.url),'utf8')
function verifier(now, secret, body=source) {
  const context={
    MAX_SKEW_SECONDS: ENVELOPE.maxSkewSeconds,
    Date:class extends Date {static now(){return now*1000}},
    Utilities:{
      computeHmacSha256Signature(input,key){return [...createHmac('sha256',Buffer.from(key,'utf8')).update(input,'utf8').digest()]},
      base64EncodeWebSafe(bytes){return Buffer.from(bytes).toString('base64url')},
      base64Decode(text){return [...Buffer.from(text,'base64')]},
      newBlob(bytes){return {getDataAsString(){return Buffer.from(bytes).toString('utf8')}}},
    },
    PropertiesService:{getScriptProperties(){return {getProperty(){return secret}}}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput(text){return {text,setMimeType(){return this}}}},
    route_(payload,nonce){return {ok:true,payload,nonce}},
  }
  vm.createContext(context)
  vm.runInContext(body,context)
  return context
}

test('internal provenance digests retain the signer and 24 shared GAS bodies',()=>{
  const p=JSON.parse(readFileSync(new URL('../src/provenance.json',import.meta.url)))
  const signer=readFileSync(new URL('../src/envelope.ts',import.meta.url))
  assert.equal(createHash('sha256').update(signer).digest('hex'),p.signerSha256)
  const bodies=source.split(/^function /m).slice(1).map(x=>'function '+x.trim())
  assert.equal(bodies.length,24)
  for(const body of bodies){const name=/^function (\w+)\(/.exec(body)?.[1];assert.equal(createHash('sha256').update(body).digest('hex'),p.sharedFunctionBodies[name],name)}
  assert.equal(Object.keys(p.sharedFunctionBodies).length,24)
})

test('four consumer subsets exclude each other’s unique vocabulary',()=>{
  assert.deepEqual(CONSUMERS,['web','expense-pwa','partner-ledger','solo-ledger'])
  assert.equal(requireTerm('partner-ledger','付款人'),'付款人')
  assert.equal(requireTerm('solo-ledger','借方帳戶'),'借方帳戶')
  assert.throws(()=>requireTerm('partner-ledger','借方帳戶'),/outside/)
  assert.throws(()=>requireTerm('solo-ledger','分攤方式'),/outside/)
  for(const c of CONSUMERS) assert.equal(new Set(CONSUMER_TERMS[c]).size,CONSUMER_TERMS[c].length,c)
  assert.deepEqual(PARTNER_SPLIT_MODES,['這筆平分','幫狗狗付','幫自己付'])
  assert.deepEqual(SOLO_TRANSACTION_TYPES,['支出','收入','轉帳'])
  assert.deepEqual(SOLO_IOU_TYPES,['應收','應付'])
})

test('source-backed ordered headers and field shapes reject excluded or mistyped fields',()=>{
  assert.deepEqual(PARTNER_ENTRY_HEADERS,['txn_id','日期','金額','付款人','分攤方式','分類','交易對象','記帳人','來源','沖銷txn_id'])
  assert.equal(SOLO_JOURNAL_HEADERS.length,15)
  assert.equal(WEB_DETAIL_HEADER.length,13)
  assert.equal(WEB_ACCOUNT_HEADER.length,7)
  const detail=Object.fromEntries(WEB_DETAIL_HEADER.map(name=>[name,'']))
  assert.equal(assertShape('web','DetailRow',detail),true)
  assert.throws(()=>assertShape('web','DetailRow',{...detail,'金額':25}),/invalid 金額/)
  assert.throws(()=>assertShape('web','DetailRow',{...detail,'付款人':'someone'}),/outside/)
  const partner={date:'2026-01-01',amount:25,payer:'someone',split:'這筆平分',category:'餐飲'}
  assert.equal(assertShape('partner-ledger','Transaction',partner),true)
  assert.throws(()=>assertShape('partner-ledger','Transaction',{...partner,split:'wrong'}),/invalid split/)
  assert.throws(()=>assertShape('partner-ledger','Transaction',{...partner,amount:'25'}),/invalid amount/)
  assert.throws(()=>assertShape('partner-ledger','Transaction',{...partner,'借方帳戶':'cash'}),/outside/)
  assert.throws(()=>assertShape('solo-ledger','Transaction',partner),/invalid type|outside/)
  assert.equal(assertShape('solo-ledger','Transaction',{type:'支出',amount:25,date:'2026-01-01',description:'test',account:'dynamic name'}),true)
  assert.equal(assertShape('expense-pwa','Expense',{payer:'person',bearer:'split',amount:25,currency:'TWD',category:'dynamic category',description:'test'}),true)
  assert.throws(()=>assertShape('expense-pwa','Expense',{payer:'person',bearer:'split',amount:25,currency:'TWD',category:'x',description:'test',paymentMethod:5}),/invalid paymentMethod/)
  for(const consumer of CONSUMERS) for(const inherited of ['toString','constructor','__proto__']) {
    assert.throws(()=>assertShape(consumer,inherited,{}),/outside/)
  }
  assert.throws(()=>assertShape('expense-pwa','unknown',{}),/shape unknown is outside expense-pwa vocabulary/)
  assert.throws(()=>assertShape('__proto__','toString',{}),/outside/)
  assert.throws(()=>requireTerm('__proto__','payer'),/outside/)
  assert.throws(()=>assertShape('toString','Expense',{}),/outside/)
  assert.throws(()=>requireTerm('constructor','payer'),/outside/)
})

test('generation is deterministic and GAS has no module imports',()=>{
  const once=expectedArtifacts(), twice=expectedArtifacts()
  assert.deepEqual([...once],[...twice])
  assert.equal(once.size,10)
  for(const [name,body] of once){
    assert.ok(body.endsWith('\n'),name)
    assert.equal(body.includes('\r'),false,name)
    if(name.endsWith('.gs')) {assert.doesNotMatch(body,/^\s*(import|export)\b/m);new vm.Script(body)}
  }
  assert.doesNotMatch(once.get('generated/partner-ledger/vocabulary.ts'),/借方帳戶/)
  assert.doesNotMatch(once.get('generated/solo-ledger/vocabulary.ts'),/分攤方式/)
  assert.match(once.get('generated/partner-ledger/vocabulary.ts'),/SPLIT_MODES/)
  assert.match(once.get('generated/solo-ledger/vocabulary.ts'),/TRANSACTION_TYPES/)
  assert.match(once.get('generated/partner-ledger/vocabulary.ts'),/export type Transaction/)
  assert.match(once.get('generated/solo-ledger/vocabulary.ts'),/"iou"\?:/)
  assert.match(once.get('generated/expense-pwa/vocabulary.ts'),/export type Expense/)
  assert.match(once.get('generated/web/vocabulary.ts'),/export type DetailRow/)
  assert.deepEqual(JSON.parse(vectors.find(x=>x.id==='alternate-compact').payloadUtf8),JSON.parse(vectors.find(x=>x.id==='alternate-spaced').payloadUtf8))
  for(const consumer of ['partner-ledger','solo-ledger']){
    const gas=once.get(`generated/${consumer}/Contract.gs`)
    assert.equal((gas.match(/^function /gm)||[]).length,7)
    assert.doesNotMatch(gas,/function (weeklyBackup|backupFolder_|pruneBackups_|route_)\(/)
    const provenance=JSON.parse(readFileSync(new URL('../src/provenance.json',import.meta.url)))
    for(const body of gas.split(/^function /m).slice(1).map(x=>'function '+x.trim())){
      const name=/^function (\w+)\(/.exec(body)[1]
      assert.equal(createHash('sha256').update(body).digest('hex'),provenance.sharedFunctionBodies[name],name)
    }
    const accepted=vectors.find(x=>x.id==='health'), rejected=vectors.find(x=>x.id==='tampered-payload')
    assert.equal(verifier(accepted.now,accepted.secret,gas).verifyEnvelope_(accepted.envelope).nonce,accepted.envelope.nonce)
    assert.throws(()=>verifier(rejected.now,rejected.secret,gas).verifyEnvelope_(rejected.envelope),/bad signature/)
  }
})

test('generated TypeScript projections parse under the declared Node toolchain',async()=>{
  for(const consumer of CONSUMERS){
    const vocabulary=await import(`../generated/${consumer}/vocabulary.ts`)
    const envelope=await import(`../generated/${consumer}/envelope.ts`)
    assert.ok(Array.isArray(vocabulary.TERMS))
    assert.equal(typeof envelope.buildEnvelope,'function')
  }
})

test('fixed vectors exercise original signer and original GAS verifier',async(t)=>{
  for(const v of vectors) await t.test(v.id,async()=>{
    assert.ok(v.wrongAnswer)
    assert.equal(Buffer.from(v.payloadBytesHex,'hex').toString('utf8'),v.payloadUtf8)
    if(v.expected==='accept' || v.expected==='invalid payload JSON'){
      assert.equal(`${v.envelope.ts}.${v.envelope.nonce}.${v.envelope.payload}`,v.signingInput)
      assert.equal(Buffer.from(v.envelope.payload,'base64url').toString('hex'),v.payloadBytesHex)
      assert.equal(createHmac('sha256',v.secret).update(v.signingInput).digest('base64url'),v.envelope.sig)
    }
    const gas=verifier(v.now,v.secret)
    if(v.expected==='accept') {
      const actual=gas.verifyEnvelope_(v.envelope)
      assert.equal(JSON.stringify(actual.payload),JSON.stringify(JSON.parse(v.payloadUtf8)))
      assert.equal(actual.nonce,v.envelope.nonce)
      if(v.signerInput){assert.deepEqual(await buildEnvelope(v.secret,v.signerInput,v.envelope.ts,v.envelope.nonce),v.envelope)}
      else if(JSON.stringify(JSON.parse(v.payloadUtf8))===v.payloadUtf8){assert.deepEqual(await buildEnvelope(v.secret,JSON.parse(v.payloadUtf8),v.envelope.ts,v.envelope.nonce),v.envelope)}
    }else if(v.expected==='invalid payload JSON') assert.throws(()=>gas.verifyEnvelope_(v.envelope),error=>error.name==='SyntaxError' && /JSON/.test(error.message))
    else assert.throws(()=>gas.verifyEnvelope_(v.envelope),new RegExp(v.expected))
  })
})

test('fixed signed replay passes through production verifier and durable model once',async()=>{
  const vector=vectors.find(x=>x.id==='signed-replay')
  assert.ok(vector)
  assert.equal(vector.deliveries,2)
  const gas=verifier(vector.now,vector.secret)
  const adapter=new MemoryDurableAdapter()
  let effects=0
  const results=[]
  for(let index=0;index<vector.deliveries;index++) {
    const verified=gas.verifyEnvelope_(vector.envelope)
    results.push(await protectedEffect(adapter,verified.nonce,async()=>{effects++;return {txnId:verified.nonce}}))
  }
  assert.deepEqual(results.map(x=>x.kind),vector.expectedDuplicateOutcomes)
  assert.equal(effects,1)
})

test('an undefined prior result still has a durable duplicate key',async()=>{
  const adapter=new MemoryDurableAdapter()
  let commits=0
  const prepare=async()=>{commits++;return undefined}
  assert.deepEqual(await protectedEffect(adapter,'undefined-result',prepare),{kind:'applied',value:undefined})
  assert.deepEqual(await protectedEffect(adapter,'undefined-result',prepare),{kind:'already',value:undefined})
  assert.equal(adapter.records.has('undefined-result'),true)
  assert.equal(commits,1)
})

test('doPost calls the same verifier function and wraps refusal',()=>{
  const v=vectors.find(x=>x.id==='health'), gas=verifier(v.now,v.secret)
  assert.equal(JSON.parse(gas.doPost({postData:{contents:JSON.stringify(v.envelope)}}).text).ok,true)
  assert.match(gas.doPost({postData:{contents:'{}'}}).text,/missing ts/)
  const malformed=vectors.find(x=>x.id==='signed-malformed-json')
  const refusal=JSON.parse(gas.doPost({postData:{contents:JSON.stringify(malformed.envelope)}}).text)
  assert.equal(refusal.ok,false)
  assert.match(refusal.error,/JSON/)
})

test('durable adapter serializes concurrent duplicate check and effect',async()=>{
  let now=0
  const adapter=new MemoryDurableAdapter(()=>now)
  let effects=0
  const effect=async()=>{effects++;await new Promise(r=>setTimeout(r,5));return {txnId:'synthetic-1'}}
  const results=await Promise.all(Array.from({length:8},()=>protectedEffect(adapter,'n-1',effect)))
  assert.equal(effects,1)
  assert.equal(results.filter(r=>r.kind==='applied').length,1)
  assert.equal(results.filter(r=>r.kind==='already').length,7)
  assert.deepEqual(adapter.cached('n-1'),{txnId:'synthetic-1'})
  now=601
  assert.equal(adapter.cached('n-1'),undefined)
  adapter.responseCache.clear()
  assert.equal((await protectedEffect(adapter,'n-1',effect)).kind,'already')
  assert.equal(effects,1)
})

test('failures refuse and prior success is reported only from durable record',async()=>{
  const adapter=new MemoryDurableAdapter()
  let effects=0
  await assert.rejects(protectedEffect(adapter,'k',async()=>{effects++;throw new Error('before write')}),/before write/)
  assert.equal(adapter.records.has('k'),false)
  const result=await protectedEffect(adapter,'k',async()=>{effects++;return 'done'})
  assert.deepEqual(result,{kind:'applied',value:'done'})
  assert.equal(effects,2)
  adapter.failLock=true
  await assert.rejects(protectedEffect(adapter,'other',async()=>{effects++;return 'bad'}),/lock unavailable/)
  adapter.failLock=false;adapter.failRead=true
  await assert.rejects(protectedEffect(adapter,'other',async()=>{effects++;return 'bad'}),/durable read unavailable/)
  adapter.failRead=false;adapter.failWrite=true
  await assert.rejects(protectedEffect(adapter,'other',async()=>{effects++;return 'bad'}),/durable write unavailable/)
  assert.equal(adapter.records.has('other'),false)
  assert.equal(effects,2)
})
