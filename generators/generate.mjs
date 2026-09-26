import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { assertSourceAgreement } from '../scripts/preflight.mjs'
await assertSourceAgreement()
const { expectedArtifacts } = await import('./emit.mjs')
for (const [name, body] of expectedArtifacts()) {
  mkdirSync(dirname(name),{recursive:true})
  writeFileSync(name,body)
  console.log(`generated ${name}`)
}
