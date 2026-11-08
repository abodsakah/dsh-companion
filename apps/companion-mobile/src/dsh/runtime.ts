import './module-loader'
import { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-client-connection/client'
import '@deepseek-ai/dsh-typert-registry/client'
import '@deepseek-ai/dsh-api-gateway/client'
import '@deepseek-ai/dsh-client-file-upload/client'
import '@deepseek-ai/dsh-api-session-controller/client'
import { TYPERT as SESSIONS_TYPERT } from '@deepseek-ai/dsh-api-session-controller/typert'
import { TYPERT as COMMANDS_TYPERT } from '@deepseek-ai/dsh-commands/typert'
import { TYPERT as SUBAGENTS_TYPERT } from '@deepseek-ai/dsh-subagent/typert'
import { dshExports } from './module-loader'
import { RnWebSocketAdapter } from './socket'
import type {
  ConnectionInstallOptions,
  ConnectionWebSocket,
} from '@deepseek-ai/dsh-client-connection/client'
import type { ISessions, SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { log } from '../log'

export type { ISessions, SessionEventLikeEntry }

export interface DshRuntimeOptions {
  readonly hostUrl: string
  readonly cookie?: string
}

export interface DshRuntime {
  readonly ctx: Context
  readonly sessions: ISessions
  readonly connection: { reconnect(): void }
  dispose(): void
}

type ApplyEntry = { apply: (ctx: Context) => void }

/** Compose the DSH client runtime: typert registry → connection → gateway → file upload → sessions. */
export function createDshRuntime(options: DshRuntimeOptions): DshRuntime {
  const hostUrl = options.hostUrl.replace(/\/+$/, '')
  const connectionClient = dshExports<
    { installConnection: (ctx: Context, options?: ConnectionInstallOptions) => void }
  >('@deepseek-ai/dsh-client-connection')
  const typertRegistryClient = dshExports<ApplyEntry>('@deepseek-ai/dsh-typert-registry')
  const gatewayClient = dshExports<ApplyEntry>('@deepseek-ai/dsh-api-gateway')
  const fileUploadClient = dshExports<ApplyEntry>('@deepseek-ai/dsh-client-file-upload')
  const sessionsClient = dshExports<ApplyEntry>('@deepseek-ai/dsh-api-session-controller')

  const ctx = new Context({})

  ctx.plugin({ name: 'typert-registry-client', apply: typertRegistryClient.apply, inject: [] })
  const typert = (ctx as unknown as {
    typert: { remotes: { register(contribution: unknown): unknown } }
  }).typert
  typert.remotes.register(SESSIONS_TYPERT)
  typert.remotes.register(COMMANDS_TYPERT)
  typert.remotes.register(SUBAGENTS_TYPERT)

  const transport: ConnectionInstallOptions = {
    interactions: 'answer',
    transport: {
      ownsHost: true,
      streamBaseUrl: hostUrl,
      fetch: (input: string | URL, init?: RequestInit) => {
        const route = String(input)
        const url = route.startsWith('/') ? `${hostUrl}${route}` : route
        const headers: Record<string, string> = {
          ...(init?.headers as Record<string, string> | undefined),
        }
        if (options.cookie !== undefined) headers.cookie = options.cookie
        return fetch(url, { ...init, headers })
      },
      createWebSocket: (url: string): ConnectionWebSocket => new RnWebSocketAdapter(url, options.cookie),
    },
  }
  connectionClient.installConnection(ctx, transport)

  ctx.plugin({ name: 'api-gateway-client', apply: gatewayClient.apply, inject: ['typert', 'connection'] })
  ctx.plugin({ name: 'file-upload-client', apply: fileUploadClient.apply, inject: ['remote'] })
  ctx.plugin({
    name: 'sessions-client',
    apply: sessionsClient.apply,
    inject: ['connection', 'fileUpload', 'typert', 'remote', 'remote.commands', 'remote.session', 'remote.subagents'],
  })

  const connection = (ctx as unknown as {
    connection: { reconnect(): void }
  }).connection
  if (connection === undefined) {
    log('runtime: connection service missing after install')
    throw new Error('dsh runtime: connection service was not installed')
  }
  const sessions = (ctx as unknown as { sessions: ISessions }).sessions
  if (sessions === undefined) {
    log('runtime: sessions service missing after install')
    throw new Error('dsh runtime: sessions service was not installed')
  }
  log('runtime: composed')

  return {
    ctx,
    sessions,
    connection,
    dispose(): void {
      void ctx.dispose()
    },
  }
}
