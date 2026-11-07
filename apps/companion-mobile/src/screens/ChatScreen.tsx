import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import type { ISessions, SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { PressSpring } from '../ui'
import { log } from '../log'

interface ChatRow {
  readonly key: string
  readonly role: 'user' | 'assistant'
  readonly text: string
}

function textOf(event: { readonly type?: unknown; readonly data?: unknown }): string | undefined {
  const data = event.data
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  for (const key of ['text', 'content', 'message']) {
    const value = record[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

function rowsOf(entries: readonly SessionEventLikeEntry[]): ChatRow[] {
  const rows: ChatRow[] = []
  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const event = entry.event as { readonly type?: unknown; readonly data?: unknown; readonly seq?: unknown }
    if (event.type === 'user/message') {
      const text = textOf(event)
      if (text !== undefined) rows.push({ key: `u-${String(event.seq)}`, role: 'user', text })
    } else if (event.type === 'assistant/message') {
      const text = textOf(event)
      if (text !== undefined) rows.push({ key: `a-${String(event.seq)}`, role: 'assistant', text })
    }
  }
  return rows
}

export function ChatScreen(
  { sessions, sessionId, onBack }: { sessions: ISessions; sessionId: string; onBack: () => void },
): React.ReactElement {
  const [rows, setRows] = useState<ChatRow[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const releaseRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    const reference = sessions.retain(sessionId, { source: 'gateway' })
    releaseRef.current = () => { reference.release() }
    void reference.ready.then((binding) => {
      if (disposed) return
      const source = binding.eventSource
      const update = (): void => { setRows(rowsOf(source.getSnapshot()?.entries ?? [])) }
      const unsubscribe = source.subscribe(update)
      update()
      releaseRef.current = () => {
        unsubscribe()
        reference.release()
      }
    }).catch((cause: unknown) => {
      log(`chat: session open failed ${String(cause)}`)
    })
    return () => {
      disposed = true
      releaseRef.current?.()
    }
  }, [sessions, sessionId])

  const send = useCallback(async (): Promise<void> => {
    if (draft === '' || sending) return
    setSending(true)
    const text = draft
    setDraft('')
    try {
      await sessions.using(sessionId, { source: 'gateway' }, async (reference) => {
        const session = reference.binding.session
        const submission = session.beginSubmission({ mode: 'queue', text })
        await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
      })
      log('chat: prompt accepted')
    } catch (cause) {
      log(`chat: prompt failed ${String(cause)}`)
    } finally {
      setSending(false)
    }
  }, [draft, sending, sessions, sessionId])

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <View style={styles.header}>
            <PressSpring>
              <Text style={styles.back} onPress={onBack}>‹ Chats</Text>
            </PressSpring>
            <Text style={styles.headerId} numberOfLines={1}>{sessionId.slice(0, 12)}</Text>
          </View>
          <FlatListWrapper rows={rows} />
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="Message DSH…"
              placeholderTextColor="#4a5164"
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <PressSpring>
              <Pressable
                accessibilityRole="button"
                disabled={sending || draft === ''}
                onPress={() => { void send() }}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <View style={[styles.send, sending || draft === '' ? styles.sendMuted : undefined]}>
                  <Text style={styles.sendLabel}>↑</Text>
                </View>
              </Pressable>
            </PressSpring>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
function FlatListWrapper({ rows }: { rows: ChatRow[] }): React.ReactElement {
  return (
    <FlatList
      data={rows}
      keyExtractor={row => row.key}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyBody}>Send a message to start the session.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={styles.bubbleText}>{item.text}</Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0d12' },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 12 },
  back: { color: '#4f6bff', fontSize: 16, fontWeight: '600' },
  headerId: { color: '#66708a', fontSize: 12, flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 12 },
  empty: { alignItems: 'center', marginTop: 96 },
  emptyBody: { color: '#66708a', fontSize: 14 },
  bubble: { borderRadius: 16, padding: 12, marginBottom: 10, maxWidth: '85%' },
  bubbleUser: { backgroundColor: '#4f6bff', alignSelf: 'flex-end' },
  bubbleAssistant: { backgroundColor: '#141824', borderWidth: 1, borderColor: '#232940', alignSelf: 'flex-start' },
  bubbleText: { color: '#ffffff', fontSize: 15, lineHeight: 21 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#141824',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232940',
    color: '#ffffff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
  },
  send: { backgroundColor: '#4f6bff', borderRadius: 14, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendMuted: { opacity: 0.4 },
  sendLabel: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
})
