const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'
const EXPO_BATCH_LIMIT = 100

export interface ExpoPushMessage {
  readonly title: string
  readonly body?: string
  readonly sound?: string
  readonly categoryId?: string
  readonly data?: Readonly<Record<string, unknown>>
}

export interface ExpoPushReport {
  readonly sent: number
  readonly failures: readonly string[]
}

/** Send one message to every token; Expo access token is optional for credential-based projects. */
export async function sendExpoPush(
  tokens: readonly string[],
  message: ExpoPushMessage,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExpoPushReport> {
  if (tokens.length === 0) return { sent: 0, failures: [] }
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (accessToken !== '') headers.authorization = `Bearer ${accessToken}`
  const failures: string[] = []
  let sent = 0
  for (let offset = 0; offset < tokens.length; offset += EXPO_BATCH_LIMIT) {
    const batch = tokens.slice(offset, offset + EXPO_BATCH_LIMIT)
    const response = await fetchImpl(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch.map(token => ({ to: token, ...message }))),
    })
    if (!response.ok) {
      failures.push(`expo push HTTP ${String(response.status)}`)
      continue
    }
    const payload: unknown = await response.json().catch(() => undefined)
    if (payload === undefined || typeof payload !== 'object' || payload === null) {
      failures.push('expo push returned an unreadable body')
      continue
    }
    const rows = (payload as { data?: unknown }).data
    if (!Array.isArray(rows) || rows.length !== batch.length) {
      failures.push('expo push returned a mismatched receipt batch')
      continue
    }
    for (const row of rows) {
      const status = typeof row === 'object' && row !== null ? (row as { status?: unknown }).status : undefined
      if (status === 'ok') {
        sent += 1
      } else {
        const detail = typeof row === 'object' && row !== null ? (row as { message?: unknown }).message : undefined
        failures.push(typeof detail === 'string' ? detail : 'expo push delivery error')
      }
    }
  }
  return { sent, failures }
}
