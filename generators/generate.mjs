import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
const required = readFileSync(new URL('../.nvmrc',import.meta.url),'utf8').trim()
if (process.version !== `v${required}`) throw new Error(`TOOLCHAIN CONFIGURATION ERROR: expected Node ${required}, got ${process.version}`)
const { expectedArtifacts } = await import('./emit.mjs')
for (const [name, body] of expectedArtifacts()) {
  mkdirSync(dirname(name),{recursive:true})
  writeFileSync(name,body)
  console.log(`generated ${name}`)
}
