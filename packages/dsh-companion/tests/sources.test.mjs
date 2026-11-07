import test from 'node:test'
import assert from 'node:assert/strict'
import { HeldRegistry } from '../lib/hold.js'
import { registerSources } from '../lib/sources.js'

const CONFIG = {
  expoProjectId: '',
  expoAccessToken: '',
  companionToken: 'secret',
  contentMode: 'generic',
  holdUnanswered: true,
  holdTimeoutMs: 60_000,
  notifyQuestions: true,
  notifyApprovals: true,
  notifyTurnComplete: true,
}

function fakeContext() {
  const listeners = new Map()
  return {
    listeners,
    on: (name, listener) => {
      listeners.set(name, listener)
      return () => { listeners.delete(name) }
    },
  }
}

function fakeBus(notified) {
  return { notify: async (event) => { notified.push(event) } }
}

const QUESTION_REQUEST = {
  questions: [{
    id: 'q1',
    question: 'Which database should I use?',
    options: [{ label: 'Postgres' }, { label: 'SQLite' }],
  }],
}

test('question with no answerer is held, pushed, and answerable', async () => {
  const ctx = fakeContext()
  const notified = []
  const held = new HeldRegistry()
  registerSources(ctx, CONFIG, fakeBus(notified), held)

  const listener = ctx.listeners.get('user-questions/request')
  assert.notEqual(listener, undefined)
  const noProvider = Object.assign(new Error('no user-questions answerer accepted the request'), { code: 'NO_PROVIDER' })
  const pending = listener(QUESTION_REQUEST, () => Promise.reject(noProvider))

  await new Promise(resolve => setImmediate(resolve))
  assert.equal(held.size, 1)
  assert.equal(notified.length, 1)
  assert.equal(notified[0].kind, 'question')
  assert.equal(notified[0].pendingId, held.list()[0].pendingId)
  assert.deepEqual(notified[0].actions.map(a => a.id), ['Postgres', 'SQLite'])

  assert.equal(held.answer(held.list()[0].pendingId, 'SQLite'), 'answered')
  assert.deepEqual(await pending, { answers: [{ id: 'q1', selected: ['SQLite'] }] })
})

test('question answered by another answerer is not held', async () => {
  const ctx = fakeContext()
  const notified = []
  const held = new HeldRegistry()
  registerSources(ctx, CONFIG, fakeBus(notified), held)

  const listener = ctx.listeners.get('user-questions/request')
  const answered = { answers: [{ id: 'q1', selected: ['Postgres'] }] }
  const result = await listener(QUESTION_REQUEST, () => Promise.resolve(answered))
  assert.equal(result, answered)
  assert.equal(held.size, 0)
  assert.equal(notified.length, 0)
})

test('multi-question requests delegate untouched', async () => {
  const ctx = fakeContext()
  const notified = []
  const held = new HeldRegistry()
  registerSources(ctx, CONFIG, fakeBus(notified), held)

  const listener = ctx.listeners.get('user-questions/request')
  const noProvider = Object.assign(new Error('no user-questions answerer accepted the request'), { code: 'NO_PROVIDER' })
  const multi = { questions: [QUESTION_REQUEST.questions[0], QUESTION_REQUEST.questions[0]] }
  await assert.rejects(listener(multi, () => Promise.reject(noProvider)), /NO_PROVIDER|answerer/)
  assert.equal(held.size, 0)
})

test('approval failing closed is held and answerable from the phone', async () => {
  const ctx = fakeContext()
  const notified = []
  const held = new HeldRegistry()
  registerSources(ctx, CONFIG, fakeBus(notified), held)

  const listener = ctx.listeners.get('approval/request')
  assert.notEqual(listener, undefined)
  const pending = listener({ toolName: 'bash', reason: 'run tests' }, () => Promise.resolve('unavailable'))

  await new Promise(resolve => setImmediate(resolve))
  assert.equal(held.size, 1)
  assert.equal(notified.length, 1)
  assert.equal(notified[0].kind, 'approval')
  assert.deepEqual(notified[0].actions.map(a => a.id), ['approve', 'reject'])

  assert.equal(held.answer(held.list()[0].pendingId, 'approve'), 'answered')
  assert.equal(await pending, 'allowed-once')
})

test('approval answered elsewhere passes through', async () => {
  const ctx = fakeContext()
  const notified = []
  const held = new HeldRegistry()
  registerSources(ctx, CONFIG, fakeBus(notified), held)

  const listener = ctx.listeners.get('approval/request')
  const outcome = await listener({ toolName: 'bash' }, () => Promise.resolve('rejected'))
  assert.equal(outcome, 'rejected')
  assert.equal(held.size, 0)
  assert.equal(notified.length, 0)
})

test('turn/end pushes a turn-complete event', async () => {
  const ctx = fakeContext()
  const notified = []
  const held = new HeldRegistry()
  registerSources(ctx, CONFIG, fakeBus(notified), held)

  const listener = ctx.listeners.get('session/event')
  listener({ id: 'session-1' }, { type: 'turn/end' })
  listener({ id: 'session-1' }, { type: 'turn/start' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(notified.length, 1)
  assert.equal(notified[0].kind, 'turn-complete')
  assert.equal(notified[0].sessionLabel, 'session-1')
})
