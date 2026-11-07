import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLogs, clearLogs } from './log'

export function LogPanel({ expanded }: { expanded?: boolean }): React.ReactElement {
  const logs = useLogs()
  const [open, setOpen] = useState(expanded === true)
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Text style={styles.toggle} onPress={() => { setOpen(!open) }}>
          {open ? 'Hide logs' : `Logs (${String(logs.length)})`}
        </Text>
        {open ? <Text style={styles.clear} onPress={() => { clearLogs() }}>Clear</Text> : undefined}
      </View>
      {open ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {logs.length === 0
            ? <Text style={styles.line}>no entries yet</Text>
            : logs.map(entry => (
              <Text key={entry.id} style={styles.line}>
                {entry.time}  {entry.message}
              </Text>
            ))}
        </ScrollView>
      ) : undefined}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  toggle: { color: '#4f6bff', fontSize: 13, fontWeight: '600' },
  clear: { color: '#8b93a7', fontSize: 13 },
  scroll: { backgroundColor: '#0f1320', borderRadius: 12, borderWidth: 1, borderColor: '#232940', maxHeight: 220 },
  content: { padding: 10 },
  line: { color: '#9fb0c8', fontSize: 11, fontFamily: 'monospace' },
})
