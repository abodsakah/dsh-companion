import * as SecureStore from 'expo-secure-store'

export interface CompanionSettings {
  readonly hostUrl: string
  readonly companionToken: string
  readonly expoProjectId: string
  readonly launchToken: string
}

const KEYS = {
  hostUrl: 'dsh-companion.hostUrl',
  companionToken: 'dsh-companion.companionToken',
  expoProjectId: 'dsh-companion.expoProjectId',
  launchToken: 'dsh-companion.launchToken',
  deviceId: 'dsh-companion.deviceId',
} as const

export async function loadSettings(): Promise<CompanionSettings | undefined> {
  const [hostUrl, companionToken, expoProjectId, launchToken] = await Promise.all([
    SecureStore.getItemAsync(KEYS.hostUrl),
    SecureStore.getItemAsync(KEYS.companionToken),
    SecureStore.getItemAsync(KEYS.expoProjectId),
    SecureStore.getItemAsync(KEYS.launchToken),
  ])
  if (hostUrl === null || hostUrl === '') return undefined
  return {
    hostUrl,
    companionToken: companionToken ?? '',
    expoProjectId: expoProjectId ?? '',
    launchToken: launchToken ?? '',
  }
}

export async function saveSettings(settings: CompanionSettings): Promise<void> {
  await SecureStore.setItemAsync(KEYS.hostUrl, settings.hostUrl)
  await SecureStore.setItemAsync(KEYS.companionToken, settings.companionToken)
  await SecureStore.setItemAsync(KEYS.expoProjectId, settings.expoProjectId)
  await SecureStore.setItemAsync(KEYS.launchToken, settings.launchToken)
}

export async function loadDeviceId(): Promise<string | undefined> {
  return (await SecureStore.getItemAsync(KEYS.deviceId)) ?? undefined
}

export async function saveDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.deviceId, deviceId)
}
