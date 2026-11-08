import type { CompanionApiCredential } from '@dsh-companion/protocol'
import { log } from '../log'

/**
 * Exchange a pasted launch token on /connect, relying on React Native's shared
 * cookie jar to capture the Set-Cookie the 302 carries; native fetch and
 * WebSocket attach it automatically afterwards.
 */
export async function exchangeLaunchTokenViaCookieJar(
  fetchImpl: typeof fetch,
  hostUrl: string,
  launchToken: string,
): Promise<void> {
  const url = `${hostUrl.replace(/\/+$/, '')}/connect?token=${encodeURIComponent(launchToken)}&interactions=answer`
  const response = await fetchImpl(url)
  log(`auth: /connect via cookie jar → HTTP ${String(response.status)}`)
  if (response.status !== 302 && response.status !== 200 && response.status !== 204) {
    throw new Error(`/connect exchange failed: HTTP ${String(response.status)}`)
  }
}

/** Fetch the signed API cookie minted in-process by the companion plugin. */
export async function fetchApiCredential(
  fetchImpl: typeof fetch,
  hostUrl: string,
  companionToken: string,
): Promise<CompanionApiCredential> {
  const url = `${hostUrl.replace(/\/+$/, '')}/dsh-companion/api-credential`
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${companionToken}` },
  })
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok || typeof body !== 'object' || body === null) {
    log(`auth: api-credential failed HTTP ${String(response.status)}`)
    throw new Error(`api-credential exchange failed: HTTP ${String(response.status)}`)
  }
  const credential = body as Partial<CompanionApiCredential>
  if (typeof credential.cookie !== 'string' || credential.cookie === '' || typeof credential.baseUrl !== 'string') {
    throw new Error('api-credential response was malformed')
  }
  log('auth: api-credential minted')
  return { cookie: credential.cookie, baseUrl: credential.baseUrl }
}
