import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface CompanionDevice {
  readonly id: string
  readonly token: string
  readonly platform: 'ios' | 'android'
  readonly name: string
  readonly createdAt: number
  lastSeenAt: number
}

/** Persisted push-token registry, one JSON file per profile. */
export class DeviceRegistry {
  private readonly path: string
  private devices: CompanionDevice[] | undefined
  private writing: Promise<void> = Promise.resolve()

  constructor(storeDir: string) {
    this.path = join(storeDir, 'devices.json')
  }

  private async load(): Promise<CompanionDevice[]> {
    if (this.devices !== undefined) return this.devices
    try {
      const raw = await readFile(this.path, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('registry is not an array')
      this.devices = parsed.filter((entry): entry is CompanionDevice =>
        typeof entry === 'object' && entry !== null
        && typeof (entry as CompanionDevice).token === 'string'
        && typeof (entry as CompanionDevice).id === 'string')
    } catch {
      this.devices = []
    }
    return this.devices
  }

  private async persist(): Promise<void> {
    const devices = await this.load()
    const snapshot = JSON.stringify(devices, undefined, 2)
    const tmp = `${this.path}.tmp-${String(Math.random().toString(36).slice(2, 10))}`
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, this.path)
    })
    await this.writing
  }

  async register(token: string, platform: 'ios' | 'android', name: string | undefined): Promise<CompanionDevice> {
    const devices = await this.load()
    const now = Date.now()
    const existing = devices.find(device => device.token === token)
    if (existing !== undefined) {
      existing.lastSeenAt = now
      await this.persist()
      return existing
    }
    const device: CompanionDevice = {
      id: randomUUID(),
      token,
      platform,
      name: name ?? `${platform} device`,
      createdAt: now,
      lastSeenAt: now,
    }
    devices.push(device)
    await this.persist()
    return device
  }

  async unregister(deviceId: string): Promise<boolean> {
    const devices = await this.load()
    const index = devices.findIndex(device => device.id === deviceId)
    if (index < 0) return false
    devices.splice(index, 1)
    await this.persist()
    return true
  }

  async list(): Promise<readonly CompanionDevice[]> {
    return await this.load()
  }
}
