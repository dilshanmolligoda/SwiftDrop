import assert from 'node:assert/strict'
import test from 'node:test'
import { subscribeToCustomerTrackingUpdates } from '../src/features/customer/tracking/customerTrackingUpdates.ts'

// Test-only source. Production does not register a transport or emit notifications.
function source() {
  const subscriptions = []
  return {
    subscriptions,
    subscribe(parcelId, listener) {
      const subscription = { parcelId, listener, stopped: 0 }
      subscriptions.push(subscription)
      return () => { subscription.stopped++ }
    },
  }
}

test('subscribes to the loaded parcel and refreshes only for its notifications', () => {
  const updates = source()
  let refreshes = 0
  const stop = subscribeToCustomerTrackingUpdates(updates, 'owned', () => { refreshes++ })
  const subscription = updates.subscriptions[0]
  assert.equal(subscription.parcelId, 'owned')
  subscription.listener({ parcelId: 'other' })
  assert.equal(refreshes, 0)
  subscription.listener({ parcelId: 'owned' })
  assert.equal(refreshes, 1)
  stop()
})

test('known duplicate identities are ignored while distinct notifications still refresh', () => {
  const updates = source()
  let refreshes = 0
  const stop = subscribeToCustomerTrackingUpdates(updates, 'owned', () => { refreshes++ })
  const { listener } = updates.subscriptions[0]
  listener({ parcelId: 'owned', notificationId: 'one' })
  listener({ parcelId: 'owned', notificationId: 'one' })
  listener({ parcelId: 'owned', notificationId: 'two' })
  listener({ parcelId: 'owned' })
  assert.equal(refreshes, 3)
  stop()
})

test('cleanup is idempotent and late callbacks after unmount cannot refresh', () => {
  const updates = source()
  let refreshes = 0
  const stop = subscribeToCustomerTrackingUpdates(updates, 'owned', () => { refreshes++ })
  stop()
  stop()
  updates.subscriptions[0].listener({ parcelId: 'owned' })
  assert.equal(updates.subscriptions[0].stopped, 1)
  assert.equal(refreshes, 0)
})

test('switching parcels releases the old listener and resets duplicate identity scope', () => {
  const updates = source()
  const refreshed = []
  const stopOld = subscribeToCustomerTrackingUpdates(updates, 'old', () => refreshed.push('old'))
  updates.subscriptions[0].listener({ parcelId: 'old', notificationId: 'one' })
  stopOld()
  const stopNew = subscribeToCustomerTrackingUpdates(updates, 'new', () => refreshed.push('new'))
  updates.subscriptions[0].listener({ parcelId: 'old', notificationId: 'late' })
  updates.subscriptions[1].listener({ parcelId: 'new', notificationId: 'one' })
  assert.deepEqual(refreshed, ['old', 'new'])
  stopNew()
})

test('malformed notifications cannot refresh or become parcel data', () => {
  const updates = source()
  let refreshes = 0
  const stop = subscribeToCustomerTrackingUpdates(updates, 'owned', () => { refreshes++ })
  const { listener } = updates.subscriptions[0]
  for (const notification of [null, undefined, {}, 'owned', { parcelId: 'owned', notificationId: 1 },
    { parcelId: 'owned', notificationId: '' }, { parcelId: 'owned', notificationId: 'a'.repeat(257) }]) {
    listener(notification)
  }
  assert.equal(refreshes, 0)
  stop()
})

test('duplicate detection has a bounded history and releases it on cleanup', () => {
  const updates = source()
  let refreshes = 0
  const stop = subscribeToCustomerTrackingUpdates(updates, 'owned', () => { refreshes++ })
  const { listener } = updates.subscriptions[0]
  for (let id = 0; id <= 100; id++) listener({ parcelId: 'owned', notificationId: String(id) })
  listener({ parcelId: 'owned', notificationId: '100' })
  assert.equal(refreshes, 101)
  listener({ parcelId: 'owned', notificationId: '0' })
  assert.equal(refreshes, 102)
  stop()
})
