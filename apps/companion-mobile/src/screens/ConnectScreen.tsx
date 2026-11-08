import React, { useState } from 'react'
import {
  KeyboardAvoidingView,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { PressSpring } from '../ui'
import { LogPanel } from '../LogPanel'
import { log } from '../log'
import type { CompanionSettings } from '../settings'

export function ConnectScreen(
  { initial, onConnect }: { initial?: CompanionSettings; onConnect: (settings: CompanionSettings) => Promise<string | undefined> },
): React.ReactElement {
  const [hostUrl, setHostUrl] = useState(initial?.hostUrl ?? '')
  const [companionToken, setCompanionToken] = useState(initial?.companionToken ?? '')
  const [expoProjectId, setExpoProjectId] = useState(initial?.expoProjectId ?? '')
  const [launchToken, setLaunchToken] = useState(initial?.launchToken ?? '')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const connect = async (): Promise<void> => {
    if (hostUrl === '' || companionToken === '') {
      setError('Host URL and companion token are required')
      return
    }
    log(`connect: hostUrl=${JSON.stringify(hostUrl)} tokenLength=${String(companionToken.length)} expoProjectId=${JSON.stringify(expoProjectId)}`)
    setBusy(true)
    setError(undefined)
    const failure = await onConnect({ hostUrl, companionToken, expoProjectId, launchToken })
    setBusy(false)
    if (failure !== undefined) {
      log(`connect: failed — ${failure}`)
      setError(failure)
    } else {
      log('connect: success')
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>DSH Companion</Text>
            <Text style={styles.subtitle}>Connect to your DeepSeek Harness host</Text>
            <View style={styles.card}>
              <Text style={styles.label}>HOST URL</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://tail-scale-host:3477"
                placeholderTextColor="#4a5164"
                value={hostUrl}
                onChangeText={setHostUrl}
              />
              <Text style={styles.label}>COMPANION TOKEN</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="the dsh-companion companionToken"
                placeholderTextColor="#4a5164"
                value={companionToken}
                onChangeText={setCompanionToken}
              />
              <Text style={styles.label}>DSH LAUNCH TOKEN (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="the ?token=… from the dsh web URL"
                placeholderTextColor="#4a5164"
                value={launchToken}
                onChangeText={setLaunchToken}
              />
              <Text style={styles.label}>EXPO PROJECT ID</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="from your Expo project (optional)"
                placeholderTextColor="#4a5164"
                value={expoProjectId}
                onChangeText={setExpoProjectId}
              />
            </View>
            <PressSpring>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => { void connect() }}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <View style={[styles.button, busy ? styles.buttonMuted : undefined]}>
                  <Text style={styles.buttonLabel}>{busy ? 'Connecting…' : 'Connect'}</Text>
                </View>
              </Pressable>
            </PressSpring>
            {error !== undefined ? <Text style={styles.error}>{error}</Text> : undefined}
            <LogPanel expanded />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0d12' },
  fill: { flex: 1 },
  container: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  title: { color: '#ffffff', fontSize: 32, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#8b93a7', fontSize: 15, marginBottom: 28 },
  card: {
    backgroundColor: '#141824',
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#232940',
  },
  label: { color: '#66708a', fontSize: 11, letterSpacing: 1.2, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#0f1320',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: '#232940',
  },
  button: { backgroundColor: '#4f6bff', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonMuted: { opacity: 0.6 },
  buttonLabel: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff6b6b', marginTop: 14, textAlign: 'center' },
})
