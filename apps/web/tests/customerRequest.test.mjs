import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { createCustomerRequest } from '../src/features/customer/tracking/customerRequest.ts'

const failure = status => Object.assign(new Error(`HTTP ${status}`), { status })
const settle = () => setImmediate()

function setup(options = {}) {
  const calls = []
  const accessErrors = []
  const request = createCustomerRequest({
    load: signal => new Promise((resolve, reject) => calls.push({ signal, resolve, reject })),
    describeError: error => ({
      message: error.message,
      temporary: error.status === 0 || error.status === 429 || error.status >= 500,
      accessDenied: error.status === 401 || error.status === 403,
    }),
    onAccessError: error => { accessErrors.push(error); return false },
    keepPreviousDataOnRefresh: true,
    ...options,
  })
  return { request, calls, accessErrors }
}

async function loaded(options) {
  const result = setup(options)
  result.request.start()
  result.calls[0].resolve({ id: 'owned-parcel', status: 'ASSIGNED' })
  await settle()
  return result
}

test('starts once and exposes a stable refresh callback and cached snapshot', async () => {
  const { request, calls } = setup()
  const refresh = request.refresh
  const initial = request.getSnapshot()
  request.refresh()
  assert.equal(calls.length, 0)
  assert.equal(request.getSnapshot(), initial)
  request.start()
  request.start()
  assert.equal(calls.length, 1)
  calls[0].resolve({ id: 'owned' })
  await settle()
  assert.equal(request.refresh, refresh)
  assert.equal(request.getSnapshot().loading, false)
  request.stop()
})

test('a disabled scope cannot load data or expose a previous result', () => {
  const { request, calls } = setup({ enabled: false })
  request.start()
  request.refresh()
  assert.equal(calls.length, 0)
  assert.deepEqual(request.getSnapshot(), { data: null, error: '', loading: false })
  request.stop()
})

test('background refresh keeps the same parcel and replaces it only with a successful snapshot', async () => {
  const { request, calls } = await loaded()
  const previous = request.getSnapshot().data
  request.refresh()
  assert.equal(request.getSnapshot().data, previous)
  assert.equal(request.getSnapshot().loading, true)
  calls[1].resolve({ id: 'owned-parcel', status: 'IN_TRANSIT' })
  await settle()
  assert.equal(request.getSnapshot().data.status, 'IN_TRANSIT')
  assert.equal(request.getSnapshot().error, '')
  request.stop()
})

for (const status of [0, 429, 500, 503]) {
  test(`temporary background failure ${status} preserves data and supports retry`, async () => {
    const { request, calls } = await loaded()
    const previous = request.getSnapshot().data
    request.refresh()
    calls[1].reject(failure(status))
    await settle()
    assert.equal(request.getSnapshot().data, previous)
    assert.equal(request.getSnapshot().error, `HTTP ${status}`)
    assert.equal(request.getSnapshot().loading, false)
    request.refresh()
    calls[2].resolve({ id: 'owned-parcel', status: 'DELIVERED' })
    await settle()
    assert.equal(request.getSnapshot().data.status, 'DELIVERED')
    assert.equal(request.getSnapshot().error, '')
    request.stop()
  })
}

for (const status of [400, 404]) {
  test(`background failure ${status} removes a result that is no longer valid`, async () => {
    const { request, calls } = await loaded()
    request.refresh()
    calls[1].reject(failure(status))
    await settle()
    assert.equal(request.getSnapshot().data, null)
    assert.equal(request.getSnapshot().error, `HTTP ${status}`)
    request.refresh()
    assert.equal(calls.length, 3)
    request.stop()
  })
}

for (const status of [401, 403]) {
  test(`access failure ${status} clears private data before the handler and blocks queued refreshes`, async () => {
    let stateInHandler
    const result = await loaded({ onAccessError: () => {
      stateInHandler = result.request.getSnapshot()
      return false
    } })
    result.request.refresh()
    result.request.refresh()
    result.calls[1].reject(failure(status))
    await settle()
    assert.equal(stateInHandler.data, null)
    assert.equal(result.request.getSnapshot().data, null)
    result.request.refresh()
    assert.equal(result.calls.length, 2)
    result.request.stop()
  })
}

test('a handled access error clears the scope even if its status is not recognized', async () => {
  const { request, calls } = await loaded({ onAccessError: () => true })
  request.refresh()
  calls[1].reject(failure(500))
  await settle()
  assert.equal(request.getSnapshot().data, null)
  request.refresh()
  assert.equal(calls.length, 2)
  request.stop()
})

test('a failing access handler cannot retain private data or cause an unhandled rejection', async () => {
  const { request, calls } = await loaded({ onAccessError: () => { throw Error('handler failed') } })
  request.refresh()
  calls[1].reject(failure(401))
  await settle()
  assert.equal(request.getSnapshot().data, null)
  request.refresh()
  assert.equal(calls.length, 2)
  request.stop()
})

test('bursts coalesce into one trailing read without aborting or overlapping the active read', async () => {
  const { request, calls } = setup()
  request.start()
  for (let index = 0; index < 50; index++) request.refresh()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].signal.aborted, false)
  calls[0].resolve({ status: 'PICKED_UP' })
  await settle()
  assert.equal(calls.length, 2)
  assert.equal(request.getSnapshot().data.status, 'PICKED_UP')
  assert.equal(request.getSnapshot().loading, true)
  calls[1].resolve({ status: 'IN_TRANSIT' })
  await settle()
  assert.equal(calls.length, 2)
  assert.equal(request.getSnapshot().data.status, 'IN_TRANSIT')
  request.stop()
})

test('an initial failure has no fabricated snapshot and can be retried', async () => {
  const { request, calls } = setup()
  request.start()
  calls[0].reject(failure(503))
  await settle()
  assert.deepEqual(request.getSnapshot(), { data: null, error: 'HTTP 503', loading: false })
  request.refresh()
  calls[1].resolve({ id: 'real-response' })
  await settle()
  assert.equal(request.getSnapshot().data.id, 'real-response')
  request.stop()
})

test('stopping aborts a request, clears its queue and ignores a transport that resolves after abort', async () => {
  const { request, calls } = setup()
  request.start()
  request.refresh()
  request.stop()
  assert.equal(calls[0].signal.aborted, true)
  calls[0].resolve({ id: 'stale-private-parcel' })
  await settle()
  assert.equal(request.getSnapshot().data, null)
  assert.equal(calls.length, 1)
})

test('a lifecycle restart ignores old success and preserves the new active request', async () => {
  const { request, calls } = setup()
  request.start()
  request.stop()
  request.start()
  calls[0].resolve({ id: 'old-session' })
  await settle()
  assert.equal(request.getSnapshot().data, null)
  assert.equal(request.getSnapshot().loading, true)
  calls[1].resolve({ id: 'new-session' })
  await settle()
  assert.equal(request.getSnapshot().data.id, 'new-session')
  request.stop()
})

test('a stale access failure cannot log out the new request scope', async () => {
  const { request, calls, accessErrors } = setup()
  request.start()
  request.stop()
  request.start()
  calls[0].reject(failure(401))
  await settle()
  assert.equal(accessErrors.length, 0)
  calls[1].resolve({ id: 'new-session' })
  await settle()
  assert.equal(request.getSnapshot().data.id, 'new-session')
  request.stop()
})

test('switching parcel/customer scopes never reuses the previous private result', async () => {
  const old = await loaded()
  old.request.refresh()
  old.request.stop()
  const next = setup()
  next.request.start()
  assert.equal(next.request.getSnapshot().data, null)
  old.calls[1].resolve({ id: 'another-customers-private-parcel' })
  await settle()
  assert.equal(old.request.getSnapshot().data, null)
  assert.equal(next.request.getSnapshot().data, null)
  next.calls[0].resolve({ id: 'selected-owned-parcel' })
  await settle()
  assert.equal(next.request.getSnapshot().data.id, 'selected-owned-parcel')
  next.request.stop()
})

test('default retention remains off for existing Delivery History consumers', async () => {
  const { request, calls } = await loaded({ keepPreviousDataOnRefresh: false })
  request.refresh()
  assert.equal(request.getSnapshot().data, null)
  calls[1].reject(failure(500))
  await settle()
  assert.equal(request.getSnapshot().data, null)
  request.stop()
})

test('request subscribers can unsubscribe cleanly', async () => {
  const { request, calls } = setup()
  let notifications = 0
  const unsubscribe = request.subscribe(() => { notifications++ })
  request.start()
  assert.equal(notifications, 1)
  unsubscribe()
  calls[0].resolve({ id: 'owned' })
  await settle()
  assert.equal(notifications, 1)
  request.stop()
})
