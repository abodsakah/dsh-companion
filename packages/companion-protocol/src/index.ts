/** Shared wire protocol between the dsh-companion host plugin and the companion mobile app. */

export const COMPANION_API_PREFIX = '/dsh-companion'

export const DEVICES_PATH = `${COMPANION_API_PREFIX}/devices`
export const DEVICE_UNREGISTER_PATH = `${COMPANION_API_PREFIX}/devices/unregister`
export const HEALTH_PATH = `${COMPANION_API_PREFIX}/health`
export const PENDING_PATH = `${COMPANION_API_PREFIX}/pending`
export const ANSWER_PATH = `${COMPANION_API_PREFIX}/answer`
export const TEST_PATH = `${COMPANION_API_PREFIX}/test`
export const CREDENTIALS_PATH = `${COMPANION_API_PREFIX}/credentials`
export const API_CREDENTIAL_PATH = `${COMPANION_API_PREFIX}/api-credential`

export const COMPANION_PROTOCOL_VERSION = 1

/** Notification kinds the bus dispatches; `custom` is the extension point for future sources. */
export type CompanionNotificationKind =
  | 'question'
  | 'approval'
  | 'turn-complete'
  | 'custom'

export type CompanionActionStyle = 'default' | 'approve' | 'reject' | 'text'

/** One tappable action attached to a notification or pending item. */
export interface CompanionAction {
  readonly id: string
  readonly label: string
  readonly style?: CompanionActionStyle
  readonly description?: string
}

/** One event travelling the companion bus, from any registered source. */
export interface CompanionEvent {
  readonly kind: CompanionNotificationKind
  readonly title: string
  readonly body?: string
  readonly sessionLabel?: string
  readonly actions?: readonly CompanionAction[]
  /** Source-defined payload; the app treats unknown kinds as generic cards. */
  readonly data?: Readonly<Record<string, unknown>>
  /** When set, the event is answerable while held by the host. */
  readonly pendingId?: string
}

/** An answerable request the host is holding on behalf of a connected client. */
export interface CompanionPendingItem {
  readonly pendingId: string
  readonly kind: 'question' | 'approval'
  readonly title: string
  readonly detail?: string
  readonly options: readonly CompanionAction[]
  readonly sessionLabel?: string
  readonly createdAt: number
  /** Epoch ms after which the host stops holding the request; omitted = no deadline. */
  readonly expiresAt?: number
}

export interface CompanionDeviceRegistration {
  readonly token: string
  readonly platform: 'ios' | 'android'
  readonly name?: string
}

export interface CompanionDeviceReceipt {
  readonly deviceId: string
  readonly protocolVersion: number
}

export interface CompanionHealth {
  readonly ok: true
  readonly protocolVersion: number
  readonly expoConfigured: boolean
  readonly deviceCount: number
  readonly heldCount: number
}

export interface CompanionAnswerRequest {
  readonly pendingId: string
  readonly actionId: string
  readonly text?: string
}

export interface CompanionAnswerReceipt {
  readonly ok: boolean
  /** `answered` when the action resolved the held request, `gone` when it was no longer held. */
  readonly outcome: 'answered' | 'gone'
}

export interface CompanionTestReceipt {
  readonly ok: boolean
  readonly sent: number
}

/** Launch URL minted by the host for the API credential exchange. */
export interface CompanionCredentials {
  readonly launchUrl: string
}

/** Signed API cookie minted in-process against the caller's authority. */
export interface CompanionApiCredential {
  readonly cookie: string
  readonly baseUrl: string
}

export interface CompanionError {
  readonly error: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Validate an untrusted device registration body; returns a descriptive error string when invalid. */
export function parseDeviceRegistration(value: unknown): CompanionDeviceRegistration | string {
  if (!isRecord(value)) return 'registration must be a JSON object'
  const token = value.token
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    return 'registration requires a non-empty string token'
  }
  const platform = value.platform
  if (platform !== 'ios' && platform !== 'android') return 'registration platform must be ios or android'
  const name = optionalString(value.name)
  if (name !== undefined && name.length > 256) return 'registration name is too long'
  return { token, platform, ...(name === undefined ? {} : { name }) }
}

/** Validate an untrusted answer body; returns a descriptive error string when invalid. */
export function parseAnswerRequest(value: unknown): CompanionAnswerRequest | string {
  if (!isRecord(value)) return 'answer must be a JSON object'
  const pendingId = value.pendingId
  if (typeof pendingId !== 'string' || pendingId.length === 0 || pendingId.length > 128) {
    return 'answer requires a pendingId'
  }
  const actionId = value.actionId
  if (typeof actionId !== 'string' || actionId.length === 0 || actionId.length > 4096) {
    return 'answer requires an actionId'
  }
  const text = optionalString(value.text)
  if (text !== undefined && text.length > 65536) return 'answer text is too long'
  return { pendingId, actionId, ...(text === undefined ? {} : { text }) }
}

/** Validate an untrusted unregister body; returns a descriptive error string when invalid. */
export function parseUnregisterRequest(value: unknown): { deviceId: string } | string {
  if (!isRecord(value)) return 'unregister must be a JSON object'
  const deviceId = value.deviceId
  if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 128) {
    return 'unregister requires a deviceId'
  }
  return { deviceId }
}
