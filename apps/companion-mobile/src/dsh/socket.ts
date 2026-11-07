import type { ConnectionWebSocket } from '@deepseek-ai/dsh-client-connection/client'

type SocketEvent = 'open' | 'message' | 'close' | 'error'
type Listener = (event: { readonly data?: unknown }) => void

/** React Native WebSocket wrapped in the connection package's socket shape. */
export class RnWebSocketAdapter implements ConnectionWebSocket {
  private readonly socket: WebSocket
  private readonly listeners = new Map<SocketEvent, Set<Listener>>()

  constructor(url: string, cookie: string) {
    this.socket = new WebSocket(url, { headers: { cookie } } as unknown as string[])
    const dispatch = (event: SocketEvent, data?: unknown): void => {
      for (const listener of [...(this.listeners.get(event) ?? [])]) {
        listener({ ...(data === undefined ? {} : { data }) })
      }
    }
    this.socket.onopen = (): void => { dispatch('open') }
    this.socket.onerror = (): void => { dispatch('error') }
    this.socket.onclose = (): void => { dispatch('close') }
    this.socket.onmessage = (message: { readonly data?: unknown }): void => { dispatch('message', message.data) }
  }

  get readyState(): number {
    return this.socket.readyState
  }

  send(data: string): void {
    this.socket.send(data)
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason)
  }

  addEventListener(event: SocketEvent, listener: Listener, options?: { readonly once?: boolean }): void {
    const set = this.listeners.get(event) ?? new Set<Listener>()
    if (options?.once === true) {
      const once: Listener = (payload) => {
        set.delete(once)
        listener(payload)
      }
      set.add(once)
    } else {
      set.add(listener)
    }
    this.listeners.set(event, set)
  }

  removeEventListener(event: SocketEvent, listener: Listener): void {
    this.listeners.get(event)?.delete(listener)
  }
}
