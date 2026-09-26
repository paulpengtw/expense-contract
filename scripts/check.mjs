import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { assertSourceAgreement } from './preflight.mjs'
const { CONSUMERS } = await assertSourceAgreement()
const { expectedArtifacts } = await import('../generators/emit.mjs')
const digests=JSON.parse(readFileSync(new URL('../vectors/digests.json',import.meta.url)))
const vectorFiles=readdirSync('vectors').filter(name=>name.endsWith('.json') && name!=='digests.json').sort()
if(JSON.stringify(vectorFiles)!==JSON.stringify(Object.keys(digests).sort())) throw new Error('VECTOR DIGEST MISMATCH: manifest coverage')
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
