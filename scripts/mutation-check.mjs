import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const root=resolve(import.meta.dirname,'..')
const scratch=mkdtempSync(join(tmpdir(),'expense-contract-mutations-'))
try {
  cpSync(root,scratch,{recursive:true,filter:p=>!/(^|\/)(\.git|node_modules|\.cache)(\/|$)/.test(p)})
  const run=()=>spawnSync(process.execPath,['scripts/check.mjs'],{cwd:scratch,encoding:'utf8'})
  const baseline=run()
  if(baseline.status!==0) throw new Error(`baseline check failed: ${baseline.stderr}`)
  const cases=[
    ['generated/web/vocabulary.ts',body=>body+'// edited\n','GENERATED ARTIFACT DRIFT'],
    ['spec/envelope.md',body=>body.replace('| `maxSkewSeconds` | 300 |','| `maxSkewSeconds` | 301 |'),'SPEC MODEL MISMATCH'],
    ['vectors/envelopes.json',body=>body+' ','VECTOR DIGEST MISMATCH'],
    ['.nvmrc',()=>'26.4.0\n','TOOLCHAIN CONFIGURATION ERROR'],
  ]
  for(const [name,mutate,message] of cases){
    const file=join(scratch,name), original=readFileSync(file,'utf8')
    const changed=mutate(original)
    if(changed===original) throw new Error(`mutation did not change ${name}`)
    writeFileSync(file,changed)
    const result=run()
    writeFileSync(file,original)
    if(result.status===0 || !result.stderr.includes(message)) throw new Error(`${name}: expected ${message}, got status ${result.status}\n${result.stderr}`)
    console.log(`${name}: ${message}`)
  }
  function snapshot(dir) {
    return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
      const name=join(dir,entry.name)
      return entry.isDirectory()?snapshot(name):[[name,createHash('sha256').update(readFileSync(name)).digest('hex'),String(statSync(name,{bigint:true}).mtimeNs)]]
    }).sort((a,b)=>a[0].localeCompare(b[0]))
  }
  const specFile=join(scratch,'spec/envelope.md'), specOriginal=readFileSync(specFile,'utf8')
  writeFileSync(specFile,specOriginal.replace('| `maxSkewSeconds` | 300 |','| `maxSkewSeconds` | 301 |'))
  const before=snapshot(scratch)
  const refused=spawnSync(process.execPath,['generators/generate.mjs'],{cwd:scratch,encoding:'utf8'})
  const after=snapshot(scratch)
  writeFileSync(specFile,specOriginal)
  if(refused.status===0 || !refused.stderr.includes('SPEC MODEL MISMATCH') || JSON.stringify(before)!==JSON.stringify(after)) throw new Error('generation wrote files after spec/model disagreement')
  console.log('generate preflight: SPEC MODEL MISMATCH, zero file changes')
  const generator=join(scratch,'generators/generate.mjs'), originalGenerator=readFileSync(generator,'utf8')
  writeFileSync(generator,'// broken generation entry point\n')
  const skipped=spawnSync(process.execPath,['scripts/verify-generation.mjs'],{cwd:scratch,encoding:'utf8'})
  writeFileSync(generator,originalGenerator)
  if(skipped.status===0 || !skipped.stderr.includes('REGENERATION DRIFT')) throw new Error(`broken generator was not detected: ${skipped.stderr}`)
  console.log('broken generator entry point: REGENERATION DRIFT')
  const extra=join(scratch,'vectors/unlisted.json')
  writeFileSync(extra,'{}\n')
  const unlisted=run()
  rmSync(extra)
  if(unlisted.status===0 || !unlisted.stderr.includes('VECTOR DIGEST MISMATCH: manifest coverage')) throw new Error('unlisted vector was not detected')
  console.log('unlisted vector: VECTOR DIGEST MISMATCH: manifest coverage')
} finally {rmSync(scratch,{recursive:true,force:true})}
