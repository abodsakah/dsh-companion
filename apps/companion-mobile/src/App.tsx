import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import { CompanionApi } from './api'
import { ConnectScreen } from './screens/ConnectScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SessionsScreen } from './screens/SessionsScreen'
import { ChatScreen } from './screens/ChatScreen'
import { acquirePushToken, setupPush } from './push'
import type { DshRuntime } from './dsh/runtime'
import { fetchApiCredential } from './dsh/credentials'
import {
  loadDeviceId,
  loadSettings,
  saveDeviceId,
  saveSettings,
  type CompanionSettings,
} from './settings'
import { log } from './log'

type View =
  | { readonly name: 'sessions' }
  | { readonly name: 'chat'; readonly sessionId: string }
  | { readonly name: 'companion' }

export default function App(): React.ReactElement {
  const [settings, setSettings] = useState<CompanionSettings | undefined>(undefined)
  const [booted, setBooted] = useState(false)
  const [runtime, setRuntime] = useState<DshRuntime | undefined>(undefined)
  const [view, setView] = useState<View>({ name: 'sessions' })
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
    setView({ name: 'companion' })
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

  const bootRuntime = async (candidate: CompanionApi, companionToken: string): Promise<DshRuntime> => {
    const credential = await fetchApiCredential(fetch, candidate.hostUrl, companionToken)
    log('runtime: loading DSH client modules')
    const { createDshRuntime } = await import('./dsh/runtime')
    log('runtime: DSH client modules loaded')
    const next = createDshRuntime({ hostUrl: credential.baseUrl, cookie: credential.cookie })
    return next
  }

  const connect = async (next: CompanionSettings): Promise<string | undefined> => {
    const candidate = new CompanionApi(next.hostUrl, next.companionToken)
    try {
      const health = await candidate.health()
      log(`connect: health ok — devices=${String(health.deviceCount)} held=${String(health.heldCount)} expo=${String(health.expoConfigured)}`)
    } catch (cause) {
      return `Could not reach the host: ${String(cause)}`
    }
    let nextRuntime: DshRuntime | undefined
    try {
      nextRuntime = await bootRuntime(candidate, next.companionToken)
    } catch (cause) {
      log(`connect: dsh runtime boot failed ${String(cause)}`)
      return `Companion connected, but the chat runtime failed: ${String(cause)}`
    }
    await saveSettings(next)
    apiRef.current = candidate
    setApi(candidate)
    setSettings(next)
    runtime?.dispose()
    setRuntime(nextRuntime)
    setView({ name: 'sessions' })
    return undefined
  }

  const disconnect = async (): Promise<void> => {
    runtime?.dispose()
    setRuntime(undefined)
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
      {runtime !== undefined && view.name === 'sessions'
        ? <SessionsScreen
            sessions={runtime.sessions}
            onOpen={sessionId => { setView({ name: 'chat', sessionId }) }}
            onCompanion={() => { setView({ name: 'companion' }) }}
          />
        : undefined}
      {runtime !== undefined && view.name === 'chat'
        ? <ChatScreen
            sessions={runtime.sessions}
            sessionId={view.sessionId}
            onBack={() => { setView({ name: 'sessions' }) }}
          />
        : undefined}
      {view.name === 'companion' || runtime === undefined
        ? <HomeScreen api={api} onDisconnect={() => { void disconnect() }} />
        : undefined}
    </>
  )
}
