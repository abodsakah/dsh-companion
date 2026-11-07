import test from 'node:test'
import assert from 'node:assert/strict'
import { HeldRegistry, TEXT_ACTION_ID } from '../lib/hold.js'

test('held question resolves with the chosen option answer', async () => {
  const held = new HeldRegistry()
  const answerOf = (actionId) => ({ answers: [{ id: 'q1', selected: [actionId] }] })
  const { pendingId, promise } = held.hold(
    { kind: 'question', title: 'Proceed?', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
    answerOf,
    60_000,
  )
  assert.equal(held.size, 1)
  assert.equal(held.answer(pendingId, 'bogus'), 'invalid-action')
  assert.equal(held.answer(pendingId, 'yes'), 'answered')
  assert.deepEqual(await promise, { answers: [{ id: 'q1', selected: ['yes'] }] })
  assert.equal(held.size, 0)
  assert.equal(held.answer(pendingId, 'yes'), 'gone')
})

test('held approval resolves approve to allowed-once', async () => {
  const held = new HeldRegistry()
  const answerOf = (actionId) => actionId === 'approve' ? 'allowed-once' : 'rejected'
  const { pendingId, promise } = held.hold(
    { kind: 'approval', title: 'Permission: bash', options: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }] },
    answerOf,
    60_000,
  )
  assert.equal(held.answer(pendingId, 'reject'), 'answered')
  assert.equal(await promise, 'rejected')
})

test('text action requires text', async () => {
  const held = new HeldRegistry()
  const { pendingId } = held.hold(
    { kind: 'question', title: 'Name it', options: [{ id: TEXT_ACTION_ID, label: 'Answer with text' }] },
    (actionId, text) => ({ answers: [{ id: 'q1', selected: [], custom: text ?? '' }] }),
    60_000,
  )
  assert.equal(held.answer(pendingId, TEXT_ACTION_ID), 'invalid-action')
  assert.equal(held.answer(pendingId, TEXT_ACTION_ID, 'hello'), 'answered')
})

test('held request times out and fails its waiter', async () => {
  const held = new HeldRegistry()
  const { promise } = held.hold(
    { kind: 'approval', title: 'x', options: [{ id: 'approve', label: 'Approve' }] },
    () => 'allowed-once',
    5,
  )
  await assert.rejects(promise, /timed out/)
})

test('cancel fails the waiter and clears the entry', async () => {
  const held = new HeldRegistry()
  const { pendingId, promise } = held.hold(
    { kind: 'approval', title: 'x', options: [{ id: 'approve', label: 'Approve' }] },
    () => 'allowed-once',
    60_000,
  )
  assert.equal(held.cancel(pendingId, new Error('aborted')), true)
  await assert.rejects(promise, /aborted/)
  assert.equal(held.size, 0)
})
