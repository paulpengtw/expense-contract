/** The active participants in the shared contract. Release checks read this value. */
export const CONSUMERS = ['web', 'partner-ledger', 'solo-ledger'] as const
export type Consumer = typeof CONSUMERS[number]
