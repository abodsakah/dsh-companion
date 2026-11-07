import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import type { CompanionEvent } from '@dsh-companion/protocol'

export const PENDING_CATEGORY = 'companion.pending'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export interface CompanionPushDelegate {
  registerPushToken: (pushToken: string, platform: 'ios' | 'android') => Promise<void>
  answerFromNotification: (pendingId: string, actionId: string, text?: string) => Promise<void>
  openPending: (pendingId: string) => void
}

function eventOf(notification: Notifications.Notification): CompanionEvent | undefined {
  return notification.request.content.data?.dshCompanion as CompanionEvent | undefined
}

/** Wire push registration, categories, and notification actions; returns the cleanup disposer. */
export function setupPush(delegate: CompanionPushDelegate): () => void {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android'

  void Notifications.setNotificationCategoryAsync(PENDING_CATEGORY, [
    { identifier: 'approve', buttonTitle: 'Approve', options: { opensAppToForeground: false } },
    { identifier: 'reject', buttonTitle: 'Reject', options: { opensAppToForeground: false } },
    {
      identifier: 'text',
      buttonTitle: 'Reply',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Type your answer…' },
      options: { opensAppToForeground: false },
    },
  ])

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const event = eventOf(response.notification)
    if (event?.pendingId === undefined) return
    const action = response.actionIdentifier
    if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      delegate.openPending(event.pendingId)
      return
    }
    const text = typeof response.userText === 'string' ? response.userText : undefined
    void delegate.answerFromNotification(event.pendingId, action, text)
  })

  const tokenListener = (event: { readonly data: string }): void => {
    void delegate.registerPushToken(event.data, platform)
  }
  const tokenSubscription = Notifications.addPushTokenListener(tokenListener)

  return () => {
    responseSubscription.remove()
    tokenSubscription.remove()
  }
}

/** Request permissions and fetch the Expo push token for the configured project. */
export async function acquirePushToken(expoProjectId: string): Promise<string | undefined> {
  const permission = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  })
  if (!permission.granted) return undefined
  const token = await Notifications.getExpoPushTokenAsync({
    ...(expoProjectId === '' ? {} : { projectId: expoProjectId }),
  })
  return token.data
}
