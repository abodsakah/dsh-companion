import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { CompanionApi } from './api'
import { log } from './log'
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
    log('app: boot')
    void loadSettings().then((loaded) => {
      log(loaded === undefined ? 'app: no saved settings' : `app: loaded settings hostUrl=${JSON.stringify(loaded.hostUrl)}`)
      setSettings(loaded)
      if (loaded !== undefined) setApi(new CompanionApi(loaded.hostUrl, loaded.companionToken))
      setBooted(true)
    })
  }, [])

  const registerPushToken = useCallback(async (pushToken: string, platform: 'ios' | 'android'): Promise<void> => {
    log(`push: token received (${platform}) ${pushToken.slice(0, 24)}…`)
    const current = apiRef.current
    if (current === undefined) {
      log('push: no api yet; token will register after connect')
      return
    }
    try {
      const receipt = await current.registerDevice(pushToken, platform, `${platform} companion`)
      await saveDeviceId(receipt.deviceId)
      log(`push: device registered id=${receipt.deviceId}`)
    } catch (cause) {
      log(`push: registration failed ${String(cause)}`)
    }
  }, [])

  const answerFromNotification = useCallback(async (pendingId: string, actionId: string, text?: string): Promise<void> => {
    log(`notify: answer action=${actionId} pendingId=${pendingId}${text === undefined ? '' : ` text=${JSON.stringify(text)}`}`)
    try {
      await apiRef.current?.answer(pendingId, actionId, text)
      log('notify: answer accepted')
    } catch (cause) {
      log(`notify: answer failed ${String(cause)}`)
    }
  }, [])

  const openPending = useCallback((pendingId: string): void => {
    log(`notify: opened for pendingId=${pendingId}`)
  }, [])

  useEffect(() => {
    if (api === undefined) return
    apiRef.current = api
    const cleanup = setupPush({ registerPushToken, answerFromNotification, openPending })
    const platform = Platform.OS === 'ios' ? 'ios' as const : 'android' as const
    void acquirePushToken(settings?.expoProjectId ?? '').then((token) => {
      if (token === undefined) {
        log('push: no token — permission denied or project id missing')
      } else {
        void registerPushToken(token, platform)
      }
    }).catch((cause) => { log(`push: token acquisition failed ${String(cause)}`) })
    return cleanup
  }, [api, registerPushToken, answerFromNotification, openPending, settings?.expoProjectId])

  const connect = async (next: CompanionSettings): Promise<string | undefined> => {
    const candidate = new CompanionApi(next.hostUrl, next.companionToken)
    try {
      const health = await candidate.health()
      log(`connect: health ok — devices=${String(health.deviceCount)} held=${String(health.heldCount)} expo=${String(health.expoConfigured)}`)
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
