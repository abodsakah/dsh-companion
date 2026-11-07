/**
 * Ambient declarations for the DSH client packages the app consumes at runtime
 * from a DeepSeek Harness checkout (workspace-linked). Shapes are transcribed
 * from deepseek-harness 0.2.2-rc.1 source; when the app is linked into the DSH
 * workspace, these declarations are superseded by the real packages.
 */

declare module '@deepseek-ai/cordis' {
  export class Context {
    constructor(config?: unknown)
    plugin(plugin: unknown, config?: unknown): Context
    get(name: string): unknown
    on(name: string, listener: (...args: never[]) => unknown, options?: unknown): () => void
    effect(callback: () => unknown, label?: string): () => void
    logger(name?: string): { info(message: string): void; warn(message: string): void; error(message: string): void }
    dispose(): Promise<void>
  }
  export class Service {
    constructor(ctx: Context, name: string, deps?: readonly string[])
  }
}

declare module '@deepseek-ai/dsh-client-connection/client' {
  export interface ConnectionWebSocket {
    readonly readyState: number
    send(data: string): void
    close(code?: number, reason?: string): void
    addEventListener(
      event: 'open' | 'error' | 'close' | 'message',
      listener: (event: { readonly data?: unknown }) => void,
      options?: { readonly once?: boolean },
    ): void
    removeEventListener(event: 'open' | 'error' | 'close' | 'message', listener: (event: { readonly data?: unknown }) => void): void
  }
  export interface ConnectionTransport {
    readonly fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>
    readonly createWebSocket?: (url: string) => ConnectionWebSocket
    readonly streamBaseUrl?: string
    readonly ownsHost?: boolean
  }
  export interface ConnectionInstallOptions {
    readonly transport?: ConnectionTransport
    readonly interactions?: 'answer' | 'none'
    readonly recovery?: Record<string, number>
  }
  export function installConnection(ctx: unknown, options?: ConnectionInstallOptions): void
}

declare module '@deepseek-ai/dsh-typert-registry/client' {
  export function apply(ctx: unknown): void
}

declare module '@deepseek-ai/dsh-api-gateway/client' {
  export function apply(ctx: unknown): void
}

declare module '@deepseek-ai/dsh-client-file-upload/client' {
  export function apply(ctx: unknown): void
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  import type { Context } from '@deepseek-ai/cordis'
  export type SessionId = string
  export interface ObservableSnapshot<T> {
    getSnapshot(): T | undefined
    subscribe(listener: () => void): () => void
  }
  export interface SessionSummary {
    readonly id?: string
    readonly title?: string
    readonly cwd?: string
    readonly updatedAt?: number
  }
  export interface SessionListState {
    readonly ids: readonly SessionId[]
    readonly byId: Readonly<Record<SessionId, SessionSummary>>
    readonly phase: string
  }
  export type SessionEventLikeEntry =
    | { readonly type: 'event'; readonly event: { readonly type?: unknown; readonly data?: unknown; readonly seq?: unknown } }
    | { readonly type: 'transient'; readonly event: unknown }
  export interface SessionEventWindow {
    readonly entries: readonly SessionEventLikeEntry[]
    readonly hasMore: boolean
    readonly revision: number
  }
  export interface SessionBinding {
    readonly sessionId: SessionId
    readonly session: ISession
    readonly eventSource: ObservableSnapshot<SessionEventWindow>
  }
  export interface SessionReference {
    readonly sessionId: SessionId
    readonly binding: SessionBinding
    readonly ready: Promise<SessionBinding>
    release(): void
  }
  export interface SessionRetainOptions {
    readonly source: string
    readonly signal?: AbortSignal
  }
  export interface SubmissionHandle {
    readonly requestId: string
    retireAsFailed(): void
  }
  export interface BeginSubmissionInput {
    readonly mode: 'queue' | 'steer'
    readonly text: string
    readonly onSettled?: (outcome: { readonly kind: 'observed' | 'failed' }) => void
  }
  export interface ISession {
    readonly sessionId: SessionId
    beginSubmission(input: BeginSubmissionInput): SubmissionHandle
    prompt(
      content: readonly { readonly type: 'text'; readonly text: string }[],
      mode: 'queue' | 'steer',
      signal?: AbortSignal,
      requestId?: string,
    ): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }>
    cancel(): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }>
  }
  export interface ISessions {
    readonly list: ObservableSnapshot<SessionListState>
    retain(target: SessionId, options: SessionRetainOptions): SessionReference
    using<T>(target: SessionId, options: SessionRetainOptions, operation: (reference: SessionReference) => T | Promise<T>): Promise<T>
    create(opts?: { readonly workspaceId?: string; readonly cwd?: string; readonly sessionId?: string; readonly agentPreset?: string }): Promise<SessionId>
    refresh(): Promise<void>
    readonly searchResultLimit: number
  }
  export const inject: readonly string[]
  export function apply(ctx: Context): void
}

declare module '@deepseek-ai/dsh-api-session-controller/typert' {
  export const TYPERT: unknown
}

declare module '@deepseek-ai/dsh-commands/typert' {
  export const TYPERT: unknown
}

declare module '@deepseek-ai/dsh-subagent/typert' {
  export const TYPERT: unknown
}
