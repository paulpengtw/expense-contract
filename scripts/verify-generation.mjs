/** Run the real file-writing generator in scratch and compare the complete tree. */
import { mkdtempSync, cpSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertSourceAgreement } from './preflight.mjs'
await assertSourceAgreement()
const root = resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'expense-contract-generation-'))
function files(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])
}
try {
  for (const name of ['.nvmrc', 'model', 'spec', 'src', 'generators', 'scripts/preflight.mjs']) {
    const target = join(scratch, name)
    cpSync(join(root, name), target, { recursive: true })
  }
  const run = spawnSync(process.execPath, ['generators/generate.mjs'], { cwd: scratch, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`GENERATION ENTRY POINT FAILED: ${run.stderr || run.stdout}`)
  const currentRoot = join(root, 'generated'), madeRoot = join(scratch, 'generated')
  const current = files(currentRoot).map(name => relative(currentRoot, name)).sort()
  const made = files(madeRoot).map(name => relative(madeRoot, name)).sort()
  if (JSON.stringify(current) !== JSON.stringify(made)) throw new Error(`REGENERATION DRIFT: file list differs; committed=${current.join(',')} regenerated=${made.join(',')}`)
  for (const name of current) if (!readFileSync(join(currentRoot, name)).equals(readFileSync(join(madeRoot, name)))) throw new Error(`REGENERATION DRIFT: generated/${name}`)
  console.log(`actual generator matched ${made.length} committed artifacts`)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
