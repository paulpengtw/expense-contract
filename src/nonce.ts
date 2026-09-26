/** Required duplicate semantics, independent of an evictable response cache. */
import { ENVELOPE } from '../model/envelope.ts'
export interface DurableAdapter<T> {
  exclusive<R>(work: () => Promise<R>): Promise<R>
  read(key: string): Promise<T | undefined>
  /** Commit the effect and its duplicate key in the same durable record. prepare must not perform external writes. */
  commit(key: string, prepare: () => Promise<T>): Promise<T>
}

export async function protectedEffect<T>(
  adapter: DurableAdapter<T>,
  key: string,
  prepare: () => Promise<T>,
): Promise<{ kind: 'applied' | 'already'; value: T }> {
  if (!key) throw new Error('missing duplicate key')
  return adapter.exclusive(async () => {
    const prior = await adapter.read(key)
    if (prior !== undefined) return { kind: 'already', value: prior }
    const value = await adapter.commit(key, prepare)
    return { kind: 'applied', value }
  })
}

/** Test-only model of the lock plus durable txn_id lookup, with injectable failures. */
export class MemoryDurableAdapter<T> implements DurableAdapter<T> {
  readonly records = new Map<string, T>()
  readonly responseCache = new Map<string, T>()
  private readonly cacheExpiry = new Map<string, number>()
  failLock = false
  failRead = false
  failWrite = false
  private tail: Promise<unknown> = Promise.resolve()
  private readonly clock: () => number
  private readonly cacheSeconds: number
  constructor(clock: () => number = () => 0, cacheSeconds = ENVELOPE.nonceCacheSeconds) {
    this.clock = clock
    this.cacheSeconds = cacheSeconds
  }

  async exclusive<R>(work: () => Promise<R>): Promise<R> {
    if (this.failLock) throw new Error('lock unavailable')
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    try { return await work() } finally { release() }
  }
  async read(key: string): Promise<T | undefined> {
    if (this.failRead) throw new Error('durable read unavailable')
    return this.records.get(key)
  }
  cached(key: string): T | undefined {
    if ((this.cacheExpiry.get(key) ?? -Infinity) <= this.clock()) return undefined
    return this.responseCache.get(key)
  }
  async commit(key: string, prepare: () => Promise<T>): Promise<T> {
    if (this.failWrite) throw new Error('durable write unavailable')
    const value = await prepare()
    this.records.set(key, value)
    this.responseCache.set(key, value)
    this.cacheExpiry.set(key, this.clock() + this.cacheSeconds)
    return value
  }
}
