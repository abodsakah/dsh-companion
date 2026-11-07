import test from 'node:test'
import assert from 'node:assert/strict'
import { sendExpoPush } from '../lib/expo.js'

function fakeFetch(status, body) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return new Response(typeof body === 'function' ? body(JSON.parse(init.body)) : body, { status })
  }
  return { impl, calls }
}

test('sends one message per token with bearer auth', async () => {
  const { impl, calls } = fakeFetch(200, JSON.stringify({ data: [{ status: 'ok' }, { status: 'ok' }] }))
  const report = await sendExpoPush(['t1', 't2'], { title: 'hi', data: { x: 1 } }, 'secret', impl)
  assert.equal(report.sent, 2)
  assert.deepEqual(report.failures, [])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret')
  const rows = JSON.parse(calls[0].init.body)
  assert.deepEqual(rows, [{ to: 't1', title: 'hi', data: { x: 1 } }, { to: 't2', title: 'hi', data: { x: 1 } }])
})

test('reports per-token failures', async () => {
  const { impl } = fakeFetch(200, JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', message: 'DeviceNotRegistered' }] }))
  const report = await sendExpoPush(['t1', 't2'], { title: 'hi' }, '', impl)
  assert.equal(report.sent, 1)
  assert.deepEqual(report.failures, ['DeviceNotRegistered'])
})

test('surfaces HTTP failures without throwing', async () => {
  const { impl } = fakeFetch(503, 'overloaded')
  const report = await sendExpoPush(['t1'], { title: 'hi' }, '', impl)
  assert.equal(report.sent, 0)
  assert.equal(report.failures.length, 1)
})

test('empty token list is a no-op', async () => {
  const report = await sendExpoPush([], { title: 'hi' }, '', async () => {
    throw new Error('must not be called')
  })
  assert.deepEqual(report, { sent: 0, failures: [] })
})
