import { readFileSync } from 'node:fs'

export function assertToolchain() {
  const required = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim()
  if (process.version !== `v${required}`) throw new Error(`TOOLCHAIN CONFIGURATION ERROR: expected Node ${required}, got ${process.version}`)
}

/** Read-only authority check. Call before producing any artifact. */
export async function assertSourceAgreement() {
  assertToolchain()
  const { ENVELOPE } = await import('../model/envelope.ts')
  const { CONSUMERS } = await import('../model/consumers.ts')
  const { CONSUMER_TERMS, CONSUMER_SHAPES, PARTNER_SPLIT_MODES, SOLO_TRANSACTION_TYPES, SOLO_IOU_TYPES } = await import('../model/vocabulary.ts')
  const spec = readFileSync(new URL('../spec/envelope.md', import.meta.url), 'utf8')
  for (const [key, value] of Object.entries(ENVELOPE)) {
    const rows = [...spec.matchAll(new RegExp('^\\| `'+key+'` \\| (\\d+) \\|', 'gm'))]
    if (rows.length !== 1 || Number(rows[0][1]) !== value) throw new Error(`SPEC MODEL MISMATCH: ${key} prose=${rows[0]?.[1] ?? 'missing/duplicate'} model=${value}`)
  }
  const vocabulary = readFileSync(new URL('../spec/vocabulary.md', import.meta.url), 'utf8')
  for (const consumer of CONSUMERS) {
    for (const term of CONSUMER_TERMS[consumer]) if (!vocabulary.includes('`'+term+'`')) throw new Error(`VOCABULARY SPEC MISMATCH: ${consumer} ${term}`)
    for (const [name, fields] of Object.entries(CONSUMER_SHAPES[consumer])) {
      if (!vocabulary.includes('`'+name+'`')) throw new Error(`VOCABULARY SPEC MISMATCH: ${consumer} ${name}`)
      for (const field of Object.keys(fields)) if (!vocabulary.includes('`'+field+'`')) throw new Error(`VOCABULARY SPEC MISMATCH: ${consumer} ${name}.${field}`)
    }
  }
  for (const term of [...PARTNER_SPLIT_MODES, ...SOLO_TRANSACTION_TYPES, ...SOLO_IOU_TYPES]) if (!vocabulary.includes('`'+term+'`')) throw new Error(`VOCABULARY SPEC MISMATCH: ${term}`)
  return { CONSUMERS }
}
