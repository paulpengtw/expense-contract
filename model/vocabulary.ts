import type { Consumer } from './consumers.ts'

/** Ordered source headers. Category/account values remain live sheet data. */
export const PARTNER_ENTRY_HEADERS = ['txn_id', '日期', '金額', '付款人', '分攤方式', '分類', '交易對象', '記帳人', '來源', '沖銷txn_id'] as const
export const SOLO_JOURNAL_HEADERS = ['日期', '時間', '類型', '借方帳戶', '貸方帳戶', '金額', '幣別', '分類', '交易對象', '說明', '結清狀態', '沖銷txn_id', 'txn_id', '來源', '建立時間'] as const
export const WEB_DETAIL_HEADER = ['金融機構/手動新增', '身分證字號', '機構名稱', '帳戶名稱', '分類', '明細描述', '幣別', '金額', '消費日', '入帳日', '標籤', '備註', '帳戶停用時間'] as const
export const WEB_ACCOUNT_HEADER = ['金融機構/手動新增', '身分證字號', '機構名稱', '帳戶名稱', '幣別', '信用額度', '帳戶金額', '可用額度', '帳戶停用時間'] as const

/** Unordered names for supported projections. */
export const COMMON_TERMS = ['txn_id', '日期', '金額', '分類', '交易對象', '來源', '沖銷txn_id'] as const
export const PARTNER_TERMS = ['付款人', '分攤方式', '記帳人'] as const
export const SOLO_TERMS = ['時間', '類型', '借方帳戶', '貸方帳戶', '幣別', '說明', '結清狀態', '建立時間'] as const
export const WEB_TERMS = [...new Set([...WEB_DETAIL_HEADER, ...WEB_ACCOUNT_HEADER])] as const
export const PARTNER_SPLIT_MODES = ['這筆平分', '幫狗狗付', '幫自己付'] as const
export const SOLO_TRANSACTION_TYPES = ['支出', '收入', '轉帳'] as const
export const SOLO_IOU_TYPES = ['應收', '應付'] as const

export const CONSUMER_TERMS: Record<Consumer, readonly string[]> = {
  web: WEB_TERMS,
  'partner-ledger': [...COMMON_TERMS, ...PARTNER_TERMS],
  'solo-ledger': [...COMMON_TERMS, ...SOLO_TERMS],
}

const string = { kind: 'string' } as const
const number = { kind: 'number' } as const
const optionalString = { kind: 'string', optional: true } as const
const webDetailFields = Object.fromEntries(WEB_DETAIL_HEADER.map(name => [name, string]))
const webAccountFields = Object.fromEntries(WEB_ACCOUNT_HEADER.map(name => [name, string]))
/** Source-backed stable field types; this projection does not replace consumer validation. */
export const CONSUMER_SHAPES = {
  web: {
    DetailRow: webDetailFields,
    AccountRow: webAccountFields,
  },
  'partner-ledger': {
    Transaction: {
      date: string, amount: number, payer: string,
      split: { kind: 'enum', values: PARTNER_SPLIT_MODES },
      category: string, payee: optionalString,
    },
  },
  'solo-ledger': {
    Transaction: {
      type: { kind: 'enum', values: SOLO_TRANSACTION_TYPES },
      amount: number, date: string, description: string,
      time: optionalString, account: optionalString, toAccount: optionalString,
      category: optionalString, payee: optionalString, currency: optionalString,
      iou: { kind: 'enum', values: SOLO_IOU_TYPES, optional: true },
    },
  },
} as const

export function requireTerm(consumer: Consumer, term: string): string {
  if (!Object.hasOwn(CONSUMER_TERMS, consumer)) throw new Error(`consumer ${consumer} is outside contract inventory`)
  if (!CONSUMER_TERMS[consumer].includes(term)) throw new Error(`term ${term} is outside ${consumer} vocabulary`)
  return term
}

/** Strict projection check for contract fields. Dynamic option values are not constrained here. */
export function assertShape(consumer: Consumer, shapeName: string, value: unknown): true {
  if (!Object.hasOwn(CONSUMER_SHAPES, consumer)) throw new Error(`consumer ${consumer} is outside contract inventory`)
  const shapes = CONSUMER_SHAPES[consumer] as Record<string, Record<string, {kind: string; optional?: boolean; values?: readonly string[]}>>
  if (!Object.hasOwn(shapes, shapeName)) throw new Error(`shape ${shapeName} is outside ${consumer} vocabulary`)
  const fields = shapes[shapeName]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid ${shapeName}`)
  const input = value as Record<string, unknown>
  for (const name of Object.keys(input)) if (!Object.hasOwn(fields, name)) throw new Error(`field ${name} is outside ${consumer} ${shapeName}`)
  for (const [name, rule] of Object.entries(fields)) {
    const field = input[name]
    if (field === undefined && rule.optional) continue
    const valid = rule.kind === 'number' ? typeof field === 'number' && Number.isFinite(field)
      : rule.kind === 'enum' ? typeof field === 'string' && (rule.values?.includes(field) ?? false)
      : typeof field === 'string'
    if (!valid) throw new Error(`invalid ${name}`)
  }
  return true
}
