import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceRegistry } from '../lib/devices.js'

test('register upserts by token and persists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-companion-'))
  const registry = new DeviceRegistry(dir)
  const first = await registry.register('token-a', 'ios', 'iPhone')
  const second = await registry.register('token-a', 'ios', 'iPhone')
  assert.equal(first.id, second.id)
  const other = await registry.register('token-b', 'android', undefined)
  assert.notEqual(other.id, first.id)
  assert.equal(other.platform, 'android')
  assert.equal((await registry.list()).length, 2)
  const raw = JSON.parse(await readFile(join(dir, 'devices.json'), 'utf8'))
  assert.equal(Array.isArray(raw), true)
  assert.equal(raw.length, 2)
})

test('unregister removes only the named device', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-companion-'))
  const registry = new DeviceRegistry(dir)
  const a = await registry.register('token-a', 'ios', undefined)
  await registry.register('token-b', 'android', undefined)
  assert.equal(await registry.unregister(a.id), true)
  assert.equal(await registry.unregister('missing'), false)
  assert.equal((await registry.list()).length, 1)
})

test('corrupt registry files fall back to empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-companion-'))
  const registry = new DeviceRegistry(dir)
  await import('node:fs/promises').then(fs => fs.writeFile(join(dir, 'devices.json'), 'not json', 'utf8'))
  assert.deepEqual(await registry.list(), [])
})
