import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
const required = readFileSync(new URL('../.nvmrc',import.meta.url),'utf8').trim()
if (process.version !== `v${required}`) throw new Error(`TOOLCHAIN CONFIGURATION ERROR: expected Node ${required}, got ${process.version}`)
const { expectedArtifacts } = await import('../generators/emit.mjs')
const { ENVELOPE } = await import('../model/envelope.ts')
const { CONSUMERS } = await import('../model/consumers.ts')
const { CONSUMER_TERMS, PARTNER_SPLIT_MODES, SOLO_TRANSACTION_TYPES, SOLO_IOU_TYPES } = await import('../model/vocabulary.ts')
const spec=readFileSync(new URL('../spec/envelope.md',import.meta.url),'utf8')
for(const [key,value] of Object.entries(ENVELOPE)) {
  const rows=[...spec.matchAll(new RegExp('^\\| `'+key+'` \\| (\\d+) \\|','gm'))]
  if(rows.length!==1 || Number(rows[0][1])!==value) throw new Error(`SPEC MODEL MISMATCH: ${key} prose=${rows[0]?.[1]??'missing/duplicate'} model=${value}`)
}
const vocab=readFileSync(new URL('../spec/vocabulary.md',import.meta.url),'utf8')
for(const c of CONSUMERS) for(const term of CONSUMER_TERMS[c]) if(!vocab.includes('`'+term+'`')) throw new Error(`VOCABULARY SPEC MISMATCH: ${c} ${term}`)
for(const term of [...PARTNER_SPLIT_MODES,...SOLO_TRANSACTION_TYPES,...SOLO_IOU_TYPES]) if(!vocab.includes('`'+term+'`')) throw new Error(`VOCABULARY SPEC MISMATCH: ${term}`)
const digests=JSON.parse(readFileSync(new URL('../vectors/digests.json',import.meta.url)))
for(const [name,want] of Object.entries(digests)) {
  const body=readFileSync(new URL(`../vectors/${name}`,import.meta.url))
  const got=createHash('sha256').update(body).digest('hex')
  if(got!==want) throw new Error(`VECTOR DIGEST MISMATCH: ${name}`)
}
const expected=expectedArtifacts()
for (const [name,want] of expected) {
  if (!existsSync(name) || readFileSync(name,'utf8')!==want) throw new Error(`GENERATED ARTIFACT DRIFT: ${name}`)
}
function files(dir) {return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`])}
for (const name of files('generated')) if(!expected.has(name)) throw new Error(`GENERATED ARTIFACT DRIFT: unexpected ${name}`)
console.log(`contract checks passed: ${expected.size} generated artifacts, ${Object.keys(digests).length} digest(s), ${CONSUMERS.length} consumers`)
