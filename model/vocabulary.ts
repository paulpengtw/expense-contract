import type { Consumer } from './consumers.ts'

/** Stable column/term names; category and account values come from live sheets. */
export const COMMON_TERMS = ['txn_id', '日期', '金額', '分類', '交易對象', '來源', '沖銷txn_id'] as const
export const PARTNER_TERMS = ['付款人', '分攤方式', '記帳人'] as const
export const SOLO_TERMS = ['時間', '類型', '借方帳戶', '貸方帳戶', '幣別', '說明', '結清狀態', '建立時間'] as const
export const WEB_TERMS = ['分類', '幣別', '金額', '帳戶金額'] as const
export const PWA_TERMS = ['payer', 'bearer', 'amount', 'currency', 'category', 'description', 'paymentMethod'] as const
export const PARTNER_SPLIT_MODES = ['這筆平分', '幫狗狗付', '幫自己付'] as const
export const SOLO_TRANSACTION_TYPES = ['支出', '收入', '轉帳'] as const
export const SOLO_IOU_TYPES = ['應收', '應付'] as const

export const CONSUMER_TERMS: Record<Consumer, readonly string[]> = {
  web: WEB_TERMS,
  'expense-pwa': PWA_TERMS,
  'partner-ledger': [...COMMON_TERMS, ...PARTNER_TERMS],
  'solo-ledger': [...COMMON_TERMS, ...SOLO_TERMS],
}

export function requireTerm(consumer: Consumer, term: string): string {
  if (!CONSUMER_TERMS[consumer].includes(term)) throw new Error(`term ${term} is outside ${consumer} vocabulary`)
  return term
}
