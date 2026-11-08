import { createHash, timingSafeEqual } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import {
  ANSWER_PATH,
  API_CREDENTIAL_PATH,
  COMPANION_PROTOCOL_VERSION,
  DEVICES_PATH,
  DEVICE_UNREGISTER_PATH,
  HEALTH_PATH,
  PENDING_PATH,
  TEST_PATH,
  parseAnswerRequest,
  parseDeviceRegistration,
  parseUnregisterRequest,
  type CompanionApiCredential,
  type CompanionHealth,
} from '@dsh-companion/protocol'
import type { DeviceRegistry } from './devices.js'
import type { HeldRegistry } from './hold.js'
import type { ResolvedConfig } from './config.js'
import type { CompanionBus } from './bus.js'

const BODY_LIMIT_BYTES = 64 * 1024

interface ConnectionLike {
  requestRejection?: (request: IncomingMessage) => 401 | 403 | undefined
  authenticatedUrl?: (baseUrl: string) => string
}

interface WebServerLike {
  register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(payload)
}

function sendMethodNotAllowed(res: ServerResponse, method: string): void {
  res.writeHead(405, { allow: method })
  res.end()
}

async function readJsonBody(req: IncomingMessage): Promise<unknown | 'invalid'> {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.includes('application/json')) return 'invalid'
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.byteLength
    if (size > BODY_LIMIT_BYTES) return 'invalid'
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return 'invalid'
  }
}

/** Register every companion route on the composition's webServer. */
export function registerRoutes(
  ctx: Context,
  config: ResolvedConfig,
  devices: DeviceRegistry,
  held: HeldRegistry,
  bus: CompanionBus,
): void {
  const connection = (ctx as unknown as { connection?: ConnectionLike }).connection
  const webServer = (ctx as unknown as { webServer?: WebServerLike }).webServer
  if (webServer === undefined) {
    ctx.logger('dsh-companion').error('webServer service is not composed; companion routes were not registered')
    return
  }
  const bearerActive = config.companionToken !== ''

  const bearerAccepted = (req: IncomingMessage): boolean => {
    if (!bearerActive) return false
    const header = req.headers.authorization
    if (typeof header !== 'string') return false
    const match = /^Bearer (.+)$/.exec(header)
    if (match === null) return false
    const offered = createHash('sha256').update(match[1] ?? '').digest()
    const expected = createHash('sha256').update(config.companionToken).digest()
    return timingSafeEqual(offered, expected)
  }

  const rejected = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (bearerAccepted(req)) return false
    const rejection = connection?.requestRejection?.(req)
    if (rejection === undefined) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): void => {
    ctx.effect(() => webServer.register({ kind: 'exact', path, handler }), `dsh-companion: ${path}`)
  }

  route(DEVICES_PATH, async (req, res) => {
    if (rejected(req, res)) return
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }
    const body = await readJsonBody(req)
    const registration = body === 'invalid' ? 'invalid registration body' : parseDeviceRegistration(body)
    if (typeof registration === 'string') {
      sendJson(res, 400, { error: registration })
      return
    }
    const device = await devices.register(registration.token, registration.platform, registration.name)
    sendJson(res, 200, { deviceId: device.id, protocolVersion: COMPANION_PROTOCOL_VERSION })
  })

  route(DEVICE_UNREGISTER_PATH, async (req, res) => {
    if (rejected(req, res)) return
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }
    const body = await readJsonBody(req)
    const request = body === 'invalid' ? 'invalid unregister body' : parseUnregisterRequest(body)
    if (typeof request === 'string') {
      sendJson(res, 400, { error: request })
      return
    }
    sendJson(res, 200, { ok: await devices.unregister(request.deviceId) })
  })

  route(HEALTH_PATH, async (req, res) => {
    if (rejected(req, res)) return
    if (req.method !== 'GET') {
      sendMethodNotAllowed(res, 'GET')
      return
    }
    const health: CompanionHealth = {
      ok: true,
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      expoConfigured: config.expoAccessToken !== '' || config.expoProjectId !== '',
      deviceCount: (await devices.list()).length,
      heldCount: held.size,
    }
    sendJson(res, 200, health)
  })

  route(PENDING_PATH, async (req, res) => {
    if (rejected(req, res)) return
    if (req.method !== 'GET') {
      sendMethodNotAllowed(res, 'GET')
      return
    }
    sendJson(res, 200, { items: held.list() })
  })

  route(ANSWER_PATH, async (req, res) => {
    if (rejected(req, res)) return
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }
    const body = await readJsonBody(req)
    const request = body === 'invalid' ? 'invalid answer body' : parseAnswerRequest(body)
    if (typeof request === 'string') {
      sendJson(res, 400, { error: request })
      return
    }
    const outcome = held.answer(request.pendingId, request.actionId, request.text)
    if (outcome === 'invalid-action') {
      sendJson(res, 400, { error: 'unknown action for this request' })
      return
    }
    sendJson(res, 200, { ok: outcome === 'answered', outcome })
  })

  route(API_CREDENTIAL_PATH, async (req, res) => {
    if (rejected(req, res)) return
    if (req.method !== 'GET') {
      sendMethodNotAllowed(res, 'GET')
      return
    }
    const host = typeof req.headers.host === 'string' ? req.headers.host : ''
    if (host === '' || connection?.authenticatedUrl === undefined) {
      sendJson(res, 503, { error: 'host connection is not available for credential exchange' })
      return
    }
    const protocol = (ctx as unknown as { webServer?: { protocol?: string } }).webServer?.protocol ?? 'http:'
    const launchUrl = new URL(connection.authenticatedUrl(`${protocol}//${host}/`))
    const launchToken = launchUrl.searchParams.get('token')
    const address = req.socket.localAddress ?? host
    const port = req.socket.localPort
    if (launchToken === null || port === 0) {
      sendJson(res, 503, { error: 'launch token or listener port unavailable' })
      return
    }
    const path = `/connect?token=${encodeURIComponent(launchToken)}&interactions=answer`
    const send = protocol === 'https:' ? httpsRequest : httpRequest
    const exchange = await new Promise<{ readonly status: number; readonly setCookie?: readonly string[] }>((resolve) => {
      const outgoing = send({
        host: address,
        port,
        method: 'GET',
        path,
        headers: { host },
        timeout: 10_000,
      }, (incoming: IncomingMessage) => {
        const raw = incoming.headers['set-cookie']
        resolve({
          status: incoming.statusCode ?? 0,
          ...(Array.isArray(raw) ? { setCookie: raw } : raw === undefined ? {} : { setCookie: [raw] }),
        })
        incoming.resume()
      })
      outgoing.on('timeout', () => { outgoing.destroy(); resolve({ status: 0 }) })
      outgoing.on('error', () => { resolve({ status: 0 }) })
      outgoing.end()
    })
    if (exchange.status !== 302 || exchange.setCookie === undefined || exchange.setCookie.length === 0) {
      sendJson(res, 502, { error: `credential exchange failed: HTTP ${String(exchange.status)}` })
      return
    }
    const cookie = exchange.setCookie[0]?.split(';')[0] ?? ''
    if (cookie === '') {
      sendJson(res, 502, { error: 'credential exchange returned no cookie value' })
      return
    }
    const credential: CompanionApiCredential = { cookie, baseUrl: `${protocol}//${host}` }
    sendJson(res, 200, credential)
  })

  route(TEST_PATH, async (req, res) => {
    if (rejected(req, res)) return
    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }
    const report = await bus.notify({
      kind: 'custom',
      title: 'Companion test',
      body: 'If you can read this, dsh-companion is wired up.',
    })
    sendJson(res, 200, { ok: report.failures.length === 0, sent: report.sent })
  })
}
