import { useEffect, useState } from 'react'

export interface LogEntry {
  readonly id: number
  readonly time: string
  readonly message: string
}

const MAX_ENTRIES = 200
const entries: LogEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

export function log(message: string): void {
  const entry: LogEntry = {
    id: nextId++,
    time: new Date().toLocaleTimeString([], { hour12: false }),
    message,
  }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.shift()
  console.log(`[dsh-companion] ${entry.time} ${message}`)
  for (const listener of listeners) listener()
}

/** React hook returning the current log buffer; re-renders on new entries. */
export function useLogs(): readonly LogEntry[] {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = (): void => { setVersion(v => v + 1) }
    listeners.add(bump)
    return () => { listeners.delete(bump) }
  }, [])
  return version === -1 ? [] : [...entries]
}

export function clearLogs(): void {
  entries.length = 0
  for (const listener of listeners) listener()
}
