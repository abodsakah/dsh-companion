import { Context } from '@deepseek-ai/cordis'
import { installConnection } from '@deepseek-ai/dsh-client-connection/client'
import { apply as typertRegistryClient } from '@deepseek-ai/dsh-typert-registry/client'
import { apply as gatewayClient } from '@deepseek-ai/dsh-api-gateway/client'
import { apply as fileUploadClient } from '@deepseek-ai/dsh-client-file-upload/client'
import { apply as sessionsClient, type ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { TYPERT as SESSIONS_TYPERT } from '@deepseek-ai/dsh-api-session-controller/typert'
import { TYPERT as COMMANDS_TYPERT } from '@deepseek-ai/dsh-commands/typert'
import { TYPERT as SUBAGENTS_TYPERT } from '@deepseek-ai/dsh-subagent/typert'
import { RnWebSocketAdapter } from './socket'
import { log } from '../log'

export interface DshRuntimeOptions {
  readonly hostUrl: string
  readonly cookie: string
}

export interface DshRuntime {
  readonly ctx: Context
  readonly sessions: ISessions
  readonly connection: { reconnect(): void }
  dispose(): void
}

/** Compose the DSH client runtime: typert registry → connection → gateway → file upload → sessions. */
export function createDshRuntime(options: DshRuntimeOptions): DshRuntime {
  const hostUrl = options.hostUrl.replace(/\/+$/, '')
  const ctx = new Context({})

  ctx.plugin({ name: 'typert-registry-client', apply: typertRegistryClient, inject: [] })
  const typert = (ctx as unknown as {
    typert: { remotes: { register(contribution: unknown): unknown } }
  }).typert
  typert.remotes.register(SESSIONS_TYPERT)
  typert.remotes.register(COMMANDS_TYPERT)
  typert.remotes.register(SUBAGENTS_TYPERT)

  installConnection(ctx, {
    interactions: 'answer',
    transport: {
      ownsHost: true,
      streamBaseUrl: hostUrl,
      fetch: (input: string | URL, init?: RequestInit) => {
        const route = String(input)
        const url = route.startsWith('/') ? `${hostUrl}${route}` : route
        return fetch(url, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            cookie: options.cookie,
          },
        })
      },
      createWebSocket: (url: string) => new RnWebSocketAdapter(url, options.cookie),
    },
  })

  ctx.plugin({
    name: 'api-gateway-client',
    apply: gatewayClient,
    inject: ['typert', 'connection'],
  })
  ctx.plugin({
    name: 'file-upload-client',
    apply: fileUploadClient,
    inject: ['remote'],
  })
  ctx.plugin({
    name: 'sessions-client',
    apply: sessionsClient,
    inject: ['connection', 'fileUpload', 'typert', 'remote', 'remote.commands', 'remote.session', 'remote.subagents'],
  })

  const connection = (ctx as unknown as {
    connection: { reconnect(): void; generation: { getSnapshot(): unknown } }
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
