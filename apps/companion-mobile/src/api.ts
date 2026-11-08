import type {
  CompanionAnswerReceipt,
  CompanionDeviceReceipt,
  CompanionHealth,
  CompanionPendingItem,
  CompanionTestReceipt,
} from '@dsh-companion/protocol'
import { log } from './log'

export class CompanionApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export class CompanionApi {
  constructor(
    readonly hostUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.hostUrl.replace(/\/+$/, '')}${path}`
    log(`→ ${init?.method ?? 'GET'} ${url}`)
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(this.token === '' ? {} : { authorization: `Bearer ${this.token}` }),
          ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
      })
      const text = await response.text()
      log(`← ${String(response.status)} ${url} ${text.slice(0, 500)}`)
      const body: unknown = text === '' ? undefined : JSON.parse(text)
      if (!response.ok) {
        const message = typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${String(response.status)}`
        throw new CompanionApiError(response.status, message)
      }
      return body as T
    } catch (cause) {
      if (cause instanceof CompanionApiError) throw cause
      log(`✗ request failed ${url}: ${String(cause)} ${cause instanceof Error ? cause.stack ?? '' : ''}`)
      throw cause
    }
  }

  health(): Promise<CompanionHealth> {
    return this.request<CompanionHealth>('/dsh-companion/health')
  }

  registerDevice(pushToken: string, platform: 'ios' | 'android', name: string | undefined): Promise<CompanionDeviceReceipt> {
    return this.request<CompanionDeviceReceipt>('/dsh-companion/devices', {
      method: 'POST',
      body: JSON.stringify({ token: pushToken, platform, name }),
    })
  }

  pending(): Promise<{ items: CompanionPendingItem[] }> {
    return this.request<{ items: CompanionPendingItem[] }>('/dsh-companion/pending')
  }

  answer(pendingId: string, actionId: string, text?: string): Promise<CompanionAnswerReceipt> {
    return this.request<CompanionAnswerReceipt>('/dsh-companion/answer', {
      method: 'POST',
      body: JSON.stringify({ pendingId, actionId, ...(text === undefined ? {} : { text }) }),
    })
  }

  test(): Promise<CompanionTestReceipt> {
    return this.request<CompanionTestReceipt>('/dsh-companion/test', { method: 'POST' })
  }
}
