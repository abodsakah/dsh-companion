import { randomUUID } from 'node:crypto'
import type { CompanionPendingItem } from '@dsh-companion/protocol'

export const TEXT_ACTION_ID = '__dsh_companion_text__'

/** Maps a chosen action back to the seam's native answer shape. */
export type HeldAnswerOf = (actionId: string, text: string | undefined) => unknown

interface HeldEntry {
  readonly item: CompanionPendingItem
  readonly answerOf: HeldAnswerOf
  readonly settle: (value: unknown) => void
  readonly fail: (error: unknown) => void
  dispose: () => void
}

/** Answerable requests the plugin holds while waiting for the phone. */
export class HeldRegistry {
  private readonly entries = new Map<string, HeldEntry>()

  hold(
    item: Omit<CompanionPendingItem, 'pendingId' | 'createdAt'>,
    answerOf: HeldAnswerOf,
    timeoutMs: number,
  ): { readonly pendingId: string; readonly promise: Promise<unknown> } {
    const pendingId = randomUUID()
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const promise = new Promise<unknown>((resolve, reject) => {
      const entry: HeldEntry = {
        item: { ...item, pendingId, createdAt: Date.now() },
        answerOf,
        settle: (value) => {
          if (settled) return
          settled = true
          resolve(value)
        },
        fail: (error) => {
          if (settled) return
          settled = true
          reject(error)
        },
        dispose: () => {
          if (timer !== undefined) clearTimeout(timer)
          this.entries.delete(pendingId)
        },
      }
      this.entries.set(pendingId, entry)
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          entry.fail(new Error(`dsh-companion: held request ${pendingId} timed out`))
          entry.dispose()
        }, timeoutMs)
      }
    })
    return { pendingId, promise }
  }

  /** Resolve one held request with a chosen action; `gone` when it is no longer held. */
  answer(pendingId: string, actionId: string, text: string | undefined): 'answered' | 'gone' | 'invalid-action' {
    const entry = this.entries.get(pendingId)
    if (entry === undefined) return 'gone'
    const option = entry.item.options.find(option => option.id === actionId)
    if (option === undefined) return 'invalid-action'
    if (option.id === TEXT_ACTION_ID && (text === undefined || text === '')) return 'invalid-action'
    entry.settle(entry.answerOf(actionId, text))
    entry.dispose()
    return 'answered'
  }

  /** Drop one held request and fail its waiter with `error`. */
  cancel(pendingId: string, error: unknown): boolean {
    const entry = this.entries.get(pendingId)
    if (entry === undefined) return false
    entry.fail(error)
    entry.dispose()
    return true
  }

  list(): readonly CompanionPendingItem[] {
    return [...this.entries.values()].map(entry => entry.item)
  }

  get size(): number {
    return this.entries.size
  }
}
