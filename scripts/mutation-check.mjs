import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
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
} finally {rmSync(scratch,{recursive:true,force:true})}
