import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import type { CompanionHealth, CompanionPendingItem } from '@dsh-companion/protocol'
import { ActionButton, PressSpring, StatusDot } from '../ui'
import { LogPanel } from '../LogPanel'
import { log } from '../log'
import type { CompanionApi } from '../api'

const POLL_INTERVAL_MS = 30_000

function relativeAge(from: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - from) / 1000))
  if (seconds < 60) return `${String(seconds)}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ago`
  return `${String(Math.round(minutes / 60))}h ago`
}

export function HomeScreen(
  { api, onDisconnect }: { api: CompanionApi; onDisconnect: () => void },
): React.ReactElement {
  const [health, setHealth] = useState<CompanionHealth | undefined>(undefined)
  const [items, setItems] = useState<CompanionPendingItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const appState = useRef(AppState.currentState)

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      const [nextHealth, nextPending] = await Promise.all([api.health(), api.pending()])
      setHealth(nextHealth)
      setItems(nextPending.items)
      setError(undefined)
    } catch (cause) {
      log(`refresh failed: ${String(cause)}`)
      setError(String(cause))
    } finally {
      setRefreshing(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => { void refresh() }, POLL_INTERVAL_MS)
    const subscription = AppState.addEventListener('change', (state) => {
      const wasActive = appState.current === 'active'
      appState.current = state
      if (state === 'active' && !wasActive) void refresh()
    })
    return () => {
      clearInterval(interval)
      subscription.remove()
    }
  }, [refresh])

  const answer = async (pendingId: string, actionId: string, text?: string): Promise<void> => {
    try {
      await api.answer(pendingId, actionId, text)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (cause) {
      setError(String(cause))
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
    await refresh()
  }

  const pendingCount = items.length
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <StatusDot state={health === undefined ? 'checking' : 'ok'} />
            <Text style={styles.headerTitle}>DSH Companion</Text>
          </View>
          <PressSpring>
            <Text style={styles.disconnect} onPress={onDisconnect}>Disconnect</Text>
          </PressSpring>
        </View>
        <View style={styles.statusCard}>
          <Text style={styles.statusLine}>
            {health === undefined
              ? 'Checking host…'
              : `${String(health.deviceCount)} device${health.deviceCount === 1 ? '' : 's'} · ${String(health.heldCount)} held · push ${health.expoConfigured ? 'ready' : 'unconfigured'}`}
          </Text>
          {error !== undefined ? <Text style={styles.error}>{error}</Text> : undefined}
        </View>
        <FlatList
          data={items}
          keyExtractor={item => item.pendingId}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor="#4f6bff" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptyBody}>
                {pendingCount === 0
                  ? 'Questions and permission requests will land here and as push notifications.'
                  : ''}
              </Text>
            </View>
          }
          ListFooterComponent={<LogPanel />}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.itemKind}>{item.kind === 'approval' ? 'PERMISSION' : 'QUESTION'}</Text>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.detail !== undefined ? <Text style={styles.itemDetail}>{item.detail}</Text> : undefined}
              {item.expiresAt !== undefined
                ? <Text style={styles.itemMeta}>expires in {relativeAge(item.expiresAt)}</Text>
                : undefined}
              {item.options.map(option => (
                <ActionButton
                  key={option.id}
                  action={option}
                  busy={refreshing}
                  onPress={() => { void answer(item.pendingId, option.id) }}
                />
              ))}
            </View>
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
  disconnect: { color: '#8b93a7', fontSize: 14 },
  statusCard: { paddingHorizontal: 20, paddingBottom: 12 },
  statusLine: { color: '#8b93a7', fontSize: 13 },
  error: { color: '#ff6b6b', fontSize: 13, marginTop: 6 },
  list: { padding: 20, paddingTop: 8 },
  empty: { alignItems: 'center', marginTop: 96 },
  emptyTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyBody: { color: '#66708a', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  item: {
    backgroundColor: '#141824',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#232940',
    padding: 18,
    marginBottom: 14,
  },
  itemKind: { color: '#4f6bff', fontSize: 11, letterSpacing: 1.4, marginBottom: 6, fontWeight: '700' },
  itemTitle: { color: '#ffffff', fontSize: 17, fontWeight: '600', marginBottom: 4 },
  itemDetail: { color: '#8b93a7', fontSize: 14, marginBottom: 12 },
  itemMeta: { color: '#66708a', fontSize: 12, marginBottom: 12 },
})
