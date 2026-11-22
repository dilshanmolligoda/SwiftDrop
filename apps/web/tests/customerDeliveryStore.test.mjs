import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { createCustomerDeliveryStore } from '../src/features/customer/context/customerDeliveryStore.ts'
import {
  calculateDeliveryMetrics, CUSTOMER_DELIVERY_STATUSES,
} from '../src/features/customer/context/customerDeliveryModel.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const customer = id => ({ id, role: 'CUSTOMER', approvalStatus: 'APPROVED', isActive: true })
const parcel = (customerId = A, status = 'ASSIGNED') => ({
  id: `parcel-${customerId}`, customerId, trackingNumber: 'SD-0123456789ABCDEFFEDCBA9876543210',
  senderName: 'Sender', senderAddress: 'Pickup', recipientName: 'Recipient', recipientAddress: 'Destination',
  recipientPhone: '0770000000', packageSize: 'SMALL', weightKg: '1.25', costLkr: '350.10',
  status, deliveredAt: null, createdAt: '2026-11-20T00:00:00.000Z',
})
const summary = { activeDeliveries: 1, deliveredThisMonth: 0, needsAttention: 0, timeZone: 'UTC', reportingMonth: '2026-11' }
const settle = () => setImmediate()

function setup() {
  const calls = [], cleared = []
  const store = createCustomerDeliveryStore({
    apiBaseUrl: 'https://api.invalid/api/v1',
    fetch: (url, init) => new Promise((resolve, reject) => calls.push({ url, init, resolve, reject })),
    clearLegacyCache: () => cleared.push(true),
  })
  function respond(offset = 0, rows = [parcel()], metrics = summary) {
    calls[offset].resolve(Response.json(rows))
    calls[offset + 1].resolve(Response.json(metrics))
  }
  return { store, calls, cleared, respond }
}

async function loaded() {
  const result = setup()
  result.store.setVerifiedCustomer(customer(A))
  const read = result.store.refresh()
  await settle()
  result.respond()
  await read
  return result
}

test('does not read private data or restore an unverified cache before session verification', async () => {
  const { store, calls } = setup()
  await store.refresh()
  assert.equal(calls.length, 0)
  assert.equal(store.getSnapshot().customerId, null)
  assert.deepEqual(store.getSnapshot().deliveries, [])
})

for (const invalid of [customer(''), { ...customer(A), role: 'COURIER' },
  { ...customer(A), approvalStatus: 'PENDING' }, { ...customer(A), isActive: false }]) {
  test(`rejects an invalid verified-customer handoff ${JSON.stringify(invalid)}`, async () => {
    const { store, calls } = setup()
    store.setVerifiedCustomer(invalid)
    await store.refresh()
    assert.equal(calls.length, 0)
    assert.deepEqual(store.getSnapshot().deliveries, [])
  })
}

test('a normal authenticated load reads fresh owned parcels and the existing UTC summary API', async () => {
  const { store, calls } = await loaded()
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), ['/api/v1/parcels/me', '/api/v1/customer/deliveries/summary'])
  for (const { url, init } of calls) {
    assert.equal(init.method, 'GET')
    assert.equal(init.credentials, 'include')
    assert.equal(init.cache, 'no-store')
    assert.ok(init.signal instanceof AbortSignal)
    assert.ok(!url.includes(A))
  }
  assert.equal(store.getSnapshot().deliveries[0].status, 'ASSIGNED')
  assert.equal(store.getSnapshot().deliveries[0].costLkr, 350.1)
  assert.equal(store.getSnapshot().metrics.activeDeliveries, 1)
})

test('verified account changes clear private state and ignore old responses even if fetch ignores abort', async () => {
  const { store, calls, respond } = await loaded()
  const stale = store.refresh()
  await settle()
  const oldScope = store.getScope()
  store.setVerifiedCustomer(customer(B))
  assert.equal(calls[2].init.signal.aborted, true)
  assert.deepEqual(store.getSnapshot().deliveries, [])
  assert.equal(store.getSnapshot().metrics, null)
  const current = store.refresh()
  await settle()
  respond(4, [parcel(B, 'IN_TRANSIT')])
  await current
  respond(2, [parcel(A, 'PICKED_UP')])
  await stale
  assert.equal(store.getSnapshot().customerId, B)
  assert.equal(store.getSnapshot().deliveries[0].status, 'IN_TRANSIT')
  assert.equal(store.updateDeliveries(oldScope, () => [parcel(A)]), false)
})

test('refresh bursts are serialized with one trailing read and retain the current snapshot', async () => {
  const { store, calls, respond } = await loaded()
  const read = store.refresh()
  await settle()
  for (let index = 0; index < 40; index++) store.refresh()
  assert.equal(calls.length, 4)
  assert.equal(store.getSnapshot().deliveries[0].status, 'ASSIGNED')
  respond(2, [parcel(A, 'PICKED_UP')])
  await settle()
  assert.equal(calls.length, 6)
  respond(4, [parcel(A, 'IN_TRANSIT')])
  await read
  assert.equal(store.getSnapshot().deliveries[0].status, 'IN_TRANSIT')
  assert.equal(calls.length, 6)
})

for (const status of [401, 403]) {
  test(`HTTP ${status} immediately clears private state and pending refreshes`, async () => {
    const { store, calls, cleared } = await loaded()
    const oldScope = store.getScope()
    const read = store.refresh()
    await settle()
    store.refresh()
    calls[2].resolve(Response.json({}, { status }))
    await settle()
    assert.deepEqual(store.getSnapshot().deliveries, [])
    assert.equal(store.getSnapshot().metrics, null)
    assert.equal(store.getSnapshot().authorizationFailed, true)
    assert.equal(calls[3].init.signal.aborted, true)
    calls[3].resolve(Response.json(summary))
    await read
    await store.refresh()
    assert.equal(calls.length, 4)
    assert.equal(store.updateDeliveries(oldScope, () => [parcel()]), false)
    assert.ok(cleared.length > 0)
  })
}

test('a summary authorization failure also clears the parcel data', async () => {
  const { store, calls } = await loaded()
  const read = store.refresh()
  await settle()
  calls[2].resolve(Response.json([parcel()]))
  calls[3].resolve(Response.json({}, { status: 403 }))
  await read
  assert.deepEqual(store.getSnapshot().deliveries, [])
  assert.equal(store.getSnapshot().authorizationFailed, true)
})

test('logout clears memory, legacy cache and queued work; late responses cannot restore it', async () => {
  const { store, calls, respond, cleared } = await loaded()
  const read = store.refresh()
  await settle()
  store.refresh()
  store.clear()
  assert.equal(calls[2].init.signal.aborted, true)
  assert.equal(store.getSnapshot().customerId, null)
  assert.deepEqual(store.getSnapshot().deliveries, [])
  respond(2)
  await read
  assert.deepEqual(store.getSnapshot().deliveries, [])
  assert.equal(calls.length, 4)
  assert.ok(cleared.length > 0)
})

test('a late access failure from an old account cannot clear the new account', async () => {
  const { store, calls, respond } = await loaded()
  const old = store.refresh()
  await settle()
  store.setVerifiedCustomer(customer(B))
  const next = store.refresh()
  await settle()
  respond(4, [parcel(B)])
  await next
  calls[2].resolve(Response.json({}, { status: 401 }))
  calls[3].resolve(Response.json({}, { status: 403 }))
  await old
  assert.equal(store.getSnapshot().customerId, B)
  assert.equal(store.getSnapshot().authorizationFailed, false)
  assert.equal(store.getSnapshot().deliveries.length, 1)
})

test('mixed-owner API data fails closed instead of entering the current customer state', async () => {
  const { store, calls, respond } = await loaded()
  const read = store.refresh()
  await settle()
  respond(2, [parcel(A), parcel(B)])
  await read
  assert.deepEqual(store.getSnapshot().deliveries, [])
  assert.equal(store.getSnapshot().authorizationFailed, true)
  assert.equal(calls.length, 4)
})

test('temporary failures retain only the current verified customer snapshot', async () => {
  const { store, calls } = await loaded()
  const before = store.getSnapshot().deliveries
  const read = store.refresh()
  await settle()
  calls[2].reject(Error('offline'))
  calls[3].resolve(Response.json({}, { status: 503 }))
  await read
  assert.equal(store.getSnapshot().deliveries, before)
  assert.equal(store.getSnapshot().metrics.activeDeliveries, 1)
  assert.ok(store.getSnapshot().error)
  assert.equal(store.getSnapshot().authorizationFailed, false)
})

test('all nine persisted statuses are accepted, with UTC metrics and no inferred delivery date', async () => {
  const { store, respond } = setup()
  store.setVerifiedCustomer(customer(A))
  const read = store.refresh()
  await settle()
  respond(0, CUSTOMER_DELIVERY_STATUSES.map((status, index) => ({ ...parcel(A, status), id: `parcel-${index}` })))
  await read
  assert.deepEqual(store.getSnapshot().deliveries.map(item => item.status), CUSTOMER_DELIVERY_STATUSES)
  const rows = store.getSnapshot().deliveries
  assert.deepEqual(calculateDeliveryMetrics(rows, new Date('2026-11-30T23:59:59Z')), {
    activeDeliveries: 6, deliveredThisMonth: 0, needsAttention: 2,
  })
  // Booking dates and terminal statuses alone must not invent a completion timestamp.
  const completions = [
    { ...rows[6], deliveredAt: '2026-12-01T00:30:00+01:00' }, // Still November UTC.
    { ...rows[6], deliveredAt: '2026-11-30T23:30:00-01:00' }, // December UTC.
    { ...rows[6], deliveredAt: 'invalid' },
    { ...rows[8], deliveredAt: '2026-11-20T00:00:00Z' }, // Returned, not delivered.
  ]
  assert.equal(calculateDeliveryMetrics(completions, new Date('2026-11-20Z')).deliveredThisMonth, 1)
  assert.equal(calculateDeliveryMetrics(completions, new Date('2026-12-20Z')).deliveredThisMonth, 1)
})

test('a reload starts empty and fetches current server statuses instead of restoring private cache', async () => {
  const { store, respond, calls } = setup()
  store.setVerifiedCustomer(customer(A))
  const read = store.refresh()
  await settle()
  respond(0, [parcel(A, 'OUT_FOR_DELIVERY')])
  await read
  store.setVerifiedCustomer(customer(A))
  assert.equal(store.getSnapshot().deliveries[0].status, 'OUT_FOR_DELIVERY')
  assert.equal(calls.length, 2)
})

test('the same customer signing in again cannot be repopulated by a previous session write', async () => {
  const { store } = await loaded()
  const previous = store.getScope()
  store.clear()
  store.setVerifiedCustomer(customer(A))
  assert.equal(store.updateDeliveries(previous, () => [parcel()]), false)
  assert.deepEqual(store.getSnapshot().deliveries, [])
})

test('invalid API fields retain the last owned snapshot and report a refresh failure', async () => {
  const { store, calls } = await loaded()
  const before = store.getSnapshot().deliveries
  for (const patch of [{ status: 'ACCEPTED' }, { costLkr: null }, { createdAt: 'invalid' }]) {
    const offset = calls.length
    const read = store.refresh()
    await settle()
    calls[offset].resolve(Response.json([{ ...parcel(), ...patch }]))
    calls[offset + 1].resolve(Response.json(summary))
    await read
    assert.equal(store.getSnapshot().deliveries, before)
    assert.ok(store.getSnapshot().error)
  }
})

test('a statistics failure does not block a successful fresh parcel status', async () => {
  const { store, calls } = await loaded()
  const read = store.refresh()
  await settle()
  calls[2].resolve(Response.json([parcel(A, 'IN_TRANSIT')]))
  calls[3].resolve(Response.json({}, { status: 503 }))
  await read
  assert.equal(store.getSnapshot().deliveries[0].status, 'IN_TRANSIT')
  assert.ok(store.getSnapshot().error)
})

test('a read started before a creation/local update cannot overwrite that newer state', async () => {
  const { store, calls, respond } = await loaded()
  const read = store.refresh()
  await settle()
  const scope = store.getScope()
  store.updateDeliveries(scope, records => [{ ...records[0], status: 'PICKED_UP' }])
  respond(2)
  await settle()
  assert.equal(store.getSnapshot().deliveries[0].status, 'PICKED_UP')
  assert.equal(calls.length, 6)
  respond(4, [parcel(A, 'PICKED_UP')])
  await read
  assert.equal(store.getSnapshot().deliveries[0].status, 'PICKED_UP')
})
