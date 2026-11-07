import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { CompanionApi } from './api'
import { ConnectScreen } from './screens/ConnectScreen'
import { HomeScreen } from './screens/HomeScreen'
import { acquirePushToken, setupPush } from './push'
import {
  loadDeviceId,
  loadSettings,
  saveDeviceId,
  saveSettings,
  type CompanionSettings,
} from './settings'

export default function App(): React.ReactElement {
  const [settings, setSettings] = useState<CompanionSettings | undefined>(undefined)
  const [booted, setBooted] = useState(false)
  const apiRef = useRef<CompanionApi | undefined>(undefined)
  const [api, setApi] = useState<CompanionApi | undefined>(undefined)

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded)
      if (loaded !== undefined) setApi(new CompanionApi(loaded.hostUrl, loaded.companionToken))
      setBooted(true)
    })
  }, [])

  const registerPushToken = useCallback(async (pushToken: string, platform: 'ios' | 'android'): Promise<void> => {
    const current = apiRef.current
    if (current === undefined) return
    const receipt = await current.registerDevice(pushToken, platform, `${platform} companion`)
    await saveDeviceId(receipt.deviceId)
  }, [])

  const answerFromNotification = useCallback(async (pendingId: string, actionId: string, text?: string): Promise<void> => {
    await apiRef.current?.answer(pendingId, actionId, text)
  }, [])

  const openPending = useCallback((_pendingId: string): void => {}, [])

  useEffect(() => {
    if (api === undefined) return
    apiRef.current = api
    const cleanup = setupPush({ registerPushToken, answerFromNotification, openPending })
    const platform = Platform.OS === 'ios' ? 'ios' as const : 'android' as const
    void acquirePushToken(settings?.expoProjectId ?? '').then((token) => {
      if (token !== undefined) void registerPushToken(token, platform)
    }).catch(() => {})
    return cleanup
  }, [api, registerPushToken, answerFromNotification, openPending, settings?.expoProjectId])

  const connect = async (next: CompanionSettings): Promise<string | undefined> => {
    const candidate = new CompanionApi(next.hostUrl, next.companionToken)
    try {
      await candidate.health()
    } catch (cause) {
      return `Could not reach the host: ${String(cause)}`
    }
    await saveSettings(next)
    apiRef.current = candidate
    setApi(candidate)
    setSettings(next)
    return undefined
  }

  const disconnect = async (): Promise<void> => {
    await saveSettings({ hostUrl: '', companionToken: '', expoProjectId: '' })
    apiRef.current = undefined
    setApi(undefined)
    setSettings(undefined)
  }

  if (!booted) return <></>
  if (settings === undefined || api === undefined) {
    return <ConnectScreen initial={settings} onConnect={connect} />
  }
  return (
    <>
      <StatusBar style="light" />
      <HomeScreen api={api} onDisconnect={() => { void disconnect() }} />
    </>
  )
}
