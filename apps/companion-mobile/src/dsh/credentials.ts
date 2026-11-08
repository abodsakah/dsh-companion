import type { CompanionApiCredential } from '@dsh-companion/protocol'
import { log } from '../log'

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
