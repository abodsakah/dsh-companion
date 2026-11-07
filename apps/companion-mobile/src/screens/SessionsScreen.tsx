import React, { useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { PressSpring, StatusDot } from '../ui'
import { log } from '../log'

interface SessionRow {
  readonly id: string
  readonly title: string
  readonly cwd: string | undefined
  readonly updatedAt: number | undefined
}

function rowsOf(sessions: ISessions): SessionRow[] {
  const snapshot = sessions.list.getSnapshot()
  if (snapshot === undefined) return []
  const { ids, byId } = snapshot as {
    ids: readonly string[]
    byId: Readonly<Record<string, { title?: string; cwd?: string; updatedAt?: number }>>
  }
  return ids.flatMap(id => {
    const row = byId[id]
    if (row === undefined) return []
    return [{
      id,
      title: row.title ?? row.cwd?.split('/').pop() ?? id.slice(0, 8),
      cwd: row.cwd,
      updatedAt: row.updatedAt,
    }]
  })
}

export function SessionsScreen(
  { sessions, onOpen, onCompanion }: { sessions: ISessions; onOpen: (sessionId: string) => void; onCompanion: () => void },
): React.ReactElement {
  const [rows, setRows] = useState<SessionRow[]>([])
  const [ready, setReady] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const unsubscribe = sessions.list.subscribe(() => { setRows(rowsOf(sessions)) })
    setRows(rowsOf(sessions))
    void sessions.refresh().then(() => {
      setReady(true)
      setRows(rowsOf(sessions))
    }).catch((cause: unknown) => { log(`sessions: refresh failed ${String(cause)}`) })
    return unsubscribe
  }, [sessions])

  const create = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const sessionId = await sessions.create({})
      log(`sessions: created ${sessionId}`)
      onOpen(sessionId)
    } catch (cause) {
      log(`sessions: create failed ${String(cause)}`)
    } finally {
      setCreating(false)
    }
  }

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await sessions.refresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <StatusDot state={ready ? 'ok' : 'checking'} />
            <Text style={styles.headerTitle}>Chats</Text>
          </View>
          <PressSpring>
            <Text style={styles.companionLink} onPress={onCompanion}>Companion</Text>
          </PressSpring>
        </View>
        <View style={styles.toolbar}>
          <PressSpring>
            <Pressable
              accessibilityRole="button"
              disabled={creating}
              onPress={() => { void create() }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <View style={[styles.newChat, creating ? styles.newChatMuted : undefined]}>
                <Text style={styles.newChatLabel}>{creating ? 'Creating…' : '+  New chat'}</Text>
              </View>
            </Pressable>
          </PressSpring>
        </View>
        <FlatList
          data={rows}
          keyExtractor={row => row.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor="#4f6bff" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyBody}>Tap “New chat” to start a session on your host.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <PressSpring style={styles.itemWrap}>
              <Pressable accessibilityRole="button" onPress={() => { onOpen(item.id) }}>
                <View style={styles.item}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                  {item.cwd !== undefined ? <Text style={styles.itemCwd} numberOfLines={1}>{item.cwd}</Text> : undefined}
                </View>
              </Pressable>
            </PressSpring>
          )}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0d12' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  companionLink: { color: '#8b93a7', fontSize: 14 },
  toolbar: { paddingHorizontal: 20, paddingBottom: 8 },
  newChat: { backgroundColor: '#4f6bff', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  newChatMuted: { opacity: 0.6 },
  newChatLabel: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  list: { padding: 20, paddingTop: 12 },
  empty: { alignItems: 'center', marginTop: 96 },
  emptyTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyBody: { color: '#66708a', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  itemWrap: { marginBottom: 10 },
  item: { backgroundColor: '#141824', borderRadius: 16, borderWidth: 1, borderColor: '#232940', padding: 16 },
  itemTitle: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  itemCwd: { color: '#66708a', fontSize: 12, marginTop: 4 },
})
