const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const test = require('node:test')
const { setImmediate: settle } = require('node:timers/promises')
const React = require('react')
const ts = createRequire(path.resolve(__dirname, '../../../package.json'))('typescript')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const customer = id => ({ id, role: 'CUSTOMER', approvalStatus: 'APPROVED', isActive: true })
const input = {
  senderName: 'Sender', senderAddress: 'Pickup', recipientName: 'Recipient',
  recipientAddress: 'Destination', recipientPhone: '0770000000', packageSize: 'SMALL',
  weightKg: 1, costLkr: 1, notes: 'Note',
}
const parcel = owner => ({
  ...input, id: 'persisted-parcel', customerId: owner, trackingNumber: 'SD-21011',
  status: 'PENDING', createdAt: '2026-11-20T00:00:00.000Z', costLkr: 350,
})
const summary = { activeDeliveries: 1, deliveredThisMonth: 0, needsAttention: 0, reportingMonth: '2026-11', timeZone: 'UTC' }

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage })

// Exercise the real Provider's commands with controlled hooks and deferred HTTP.
// These tests do not claim browser/effect lifecycle or actual authentication coverage.
function provider() {
  const calls = [], cacheReads = [], cacheWrites = [], cacheRemovals = [], slots = []
  let cursor = 0
  globalThis.fetch = (url, init) => new Promise((resolve, reject) => calls.push({ url, init, resolve, reject }))
  globalThis.localStorage = {
    getItem: key => { cacheReads.push(key); return JSON.stringify([parcel(B)]) },
    setItem: (...args) => cacheWrites.push(args), removeItem: key => cacheRemovals.push(key),
  }
  const hooks = {
    ...React,
    useMemo(factory) {
      const index = cursor++
      if (!(index in slots)) slots[index] = factory()
      return slots[index]
    },
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], value => { slots[index] = value }]
    },
    useCallback: callback => callback,
    useEffect() {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const sourcePath = path.resolve(__dirname, '../src/features/customer/context/CustomerDeliveryProvider.tsx')
  const sourceRequire = createRequire(sourcePath)
  const source = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
  }).outputText
  const load = name => {
    if (name === 'react') return hooks
    if (name.endsWith('/env')) return { env: { apiBaseUrl: 'https://api.invalid/api/v1' } }
    if (name.startsWith('./')) return sourceRequire(`${name}.ts`)
    return sourceRequire(name)
  }
  const output = { exports: {} }
  new Function('require', 'module', 'exports', source)(load, output, output.exports)
  return {
    calls, cacheReads, cacheWrites, cacheRemovals,
    render() { cursor = 0; return output.exports.CustomerDeliveryProvider({ children: null }).props.value },
  }
}

test('Provider never restores unscoped private cache or fetches before a verified session', async () => {
  const view = provider()
  await view.render().refreshDeliveries()
  assert.deepEqual(view.render().deliveries, [])
  assert.equal(view.calls.length, 0)
  assert.deepEqual(view.cacheReads, [])
  assert.deepEqual(view.cacheWrites, [])
  view.render().setVerifiedCustomer(customer(A))
  assert.deepEqual(view.cacheRemovals, ['swiftdrop_customer_deliveries_v5'])
})

test('successful creation keeps the POST contract and refreshes real statuses and summary', async () => {
  const view = provider()
  view.render().setVerifiedCustomer(customer(A))
  const created = view.render().createDelivery(input)
  const post = view.calls[0]
  assert.equal(post.url, 'https://api.invalid/api/v1/parcels')
  assert.equal(post.init.method, 'POST')
  assert.equal(post.init.credentials, 'include')
  assert.deepEqual(post.init.headers, { 'Content-Type': 'application/json' })
  const { senderName: _name, costLkr: _untrustedPrice, ...expectedBody } = input
  assert.deepEqual(JSON.parse(post.init.body), expectedBody)
  post.resolve(Response.json(parcel(A)))
  assert.equal((await created).costLkr, 350)
  await settle()
  assert.equal(view.calls.length, 3)
  assert.equal(view.render().deliveries.length, 1)
  view.calls[1].resolve(Response.json([{ ...parcel(A), status: 'ASSIGNED' }]))
  view.calls[2].resolve(Response.json(summary))
  await settle()
  assert.equal(view.render().deliveries.length, 1)
  assert.equal(view.render().deliveries[0].status, 'ASSIGNED')
  assert.deepEqual(view.cacheWrites, [])
})

test('a late creation cannot repopulate deliveries after a verified account change', async () => {
  const view = provider()
  view.render().setVerifiedCustomer(customer(A))
  const created = view.render().createDelivery(input)
  view.render().setVerifiedCustomer(customer(B))
  view.calls[0].resolve(Response.json(parcel(A)))
  await created
  assert.deepEqual(view.render().deliveries, [])
  assert.equal(view.render().authorizationFailed, false)
  assert.equal(view.calls.length, 1)
})

test('initial session verification preserves a requested Create Delivery modal; account switches close it', () => {
  const view = provider()
  view.render().openCreateModal()
  view.render().setVerifiedCustomer(customer(A))
  assert.equal(view.render().isCreateModalOpen, true)
  view.render().setVerifiedCustomer(customer(B))
  assert.equal(view.render().isCreateModalOpen, false)
})

test('logout clears the Provider and prevents a late creation from starting another refresh', async () => {
  const view = provider()
  view.render().setVerifiedCustomer(customer(A))
  const created = view.render().createDelivery(input)
  const refresh = view.render().refreshDeliveries
  view.render().clearDeliveries()
  view.calls[0].resolve(Response.json(parcel(A)))
  await created
  assert.equal(view.render().refreshDeliveries, refresh)
  assert.deepEqual(view.render().deliveries, [])
  assert.equal(view.calls.length, 1)
})

for (const status of [401, 403]) {
  test(`creation HTTP ${status} clears authorization without inserting the existing offline fallback`, async () => {
    const view = provider()
    view.render().setVerifiedCustomer(customer(A))
    const created = view.render().createDelivery(input)
    view.calls[0].resolve(Response.json({}, { status }))
    await created
    assert.deepEqual(view.render().deliveries, [])
    assert.equal(view.render().authorizationFailed, true)
    assert.deepEqual(view.cacheWrites, [])
  })
}

test('a creation response owned by a different customer never enters the Provider', async () => {
  const view = provider()
  view.render().setVerifiedCustomer(customer(A))
  const created = view.render().createDelivery(input)
  view.calls[0].resolve(Response.json(parcel(B)))
  await created
  assert.deepEqual(view.render().deliveries, [])
  assert.equal(view.render().authorizationFailed, true)
})
