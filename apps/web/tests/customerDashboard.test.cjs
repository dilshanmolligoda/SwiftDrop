const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
// Use the existing monorepo compiler API; web's native TS 7 package exposes only its CLI.
const ts = require('node:module').createRequire(path.resolve(__dirname, '../../../package.json'))('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')

// Controlled state/context inputs plus real server rendering; no browser or transport.
function dashboard(deliveries) {
  const slots = []
  let cursor = 0, refreshes = 0
  let context = {
    deliveries, metrics: { activeDeliveries: 1, deliveredThisMonth: 0, needsAttention: 0 },
    isLoading: false, error: null, openCreateModal() {},
    refreshDeliveries: async () => { refreshes++ },
  }
  const hooks = { ...React, useState(initial) {
    const i = cursor++
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }]
  } }
  const sourcePath = path.resolve(__dirname, '../src/features/customer/pages/CustomerDashboard.tsx')
  const source = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
  }).outputText
  const output = { exports: {} }
  const sourceRequire = require('node:module').createRequire(sourcePath)
  const load = name => {
    if (name === 'react') return hooks
    if (name.endsWith('useCustomerDeliveries')) return { useCustomerDeliveries: () => context }
    if (name.endsWith('customerDeliveryModel')) return sourceRequire('../context/customerDeliveryModel.ts')
    if (name.endsWith('.css')) return {}
    return sourceRequire(name)
  }
  new Function('require', 'module', 'exports', source)(load, output, output.exports)
  const view = {
    tree: null,
    render(next = {}) {
      context = { ...context, ...next }
      cursor = 0
      this.tree = output.exports.CustomerDashboard()
      return this
    },
    html() { return renderToStaticMarkup(React.createElement(MemoryRouter, null, this.tree)) },
    get refreshes() { return refreshes },
  }
  return view.render()
}

const parcel = (status = 'PENDING') => ({
  id: 'parcel-id', trackingNumber: 'SD-0123456789ABCDEFFEDCBA9876543210', status,
  senderName: 'Sender', senderAddress: 'Pickup, Colombo', recipientName: 'Recipient',
  recipientAddress: 'Destination, Kandy', recipientPhone: '0770000000', packageSize: 'SMALL',
  weightKg: 1, costLkr: 350, createdAt: '2026-11-20T00:00:00.000Z',
})
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''
const clickDetails = view => {
  const button = nodes(view.tree).find(node => node.type === 'button' && text(node).includes('View details'))
  assert.ok(button, 'An active delivery must have a details action')
  button.props.onClick()
  view.render()
}

for (const [status, label] of [['CREATED', 'Created'], ['ASSIGNED', 'Assigned'], ['PENDING', 'Pending pickup']]) {
  test(`${status} stays visible without falsely confirming pickup`, () => {
    const view = dashboard([parcel(status)])
    assert.match(view.html(), /class="delivery-card"/)
    assert.ok(view.html().includes(label))
    assert.doesNotMatch(view.html(), />Confirmed</)
    assert.doesNotMatch(view.html(), /This page updates automatically|>Live</)
  })
}

for (const status of ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']) {
  test(`${status} can confirm pickup from the real persisted status`, () => {
    assert.match(dashboard([parcel(status)]).html(), />Confirmed</)
  })
}

for (const [status, label] of [['FAILED', 'Failed'], ['RETURNED', 'Returned']]) {
  test(`${status} shows its actual recorded status without invented courier reasons`, () => {
    const html = dashboard([parcel(status)]).html()
    assert.match(html, new RegExp(`attention-card__issue-title">${label}<`))
    assert.doesNotMatch(html, /Our driver could not reach|Courier will retry|>Confirmed</)
  })
}

test('an open details modal follows the current provider record', () => {
  const view = dashboard([parcel('PICKED_UP')])
  clickDetails(view)
  assert.match(view.html(), /PICKED UP/)
  view.render({ deliveries: [{ ...parcel('IN_TRANSIT'), recipientName: 'Updated Recipient' }] })
  assert.match(view.html(), /IN TRANSIT/)
  assert.match(view.html(), /Updated Recipient/)
  assert.doesNotMatch(view.html(), /PICKED UP/)
})

test('clearing deliveries removes an open private modal', () => {
  const view = dashboard([parcel()])
  clickDetails(view)
  view.render({ deliveries: [] })
  assert.doesNotMatch(view.html(), /role="dialog"|0770000000|Destination, Kandy/)
})

test('the details modal follows a delivery that has left the active list', () => {
  const view = dashboard([parcel('OUT_FOR_DELIVERY')])
  clickDetails(view)
  view.render({ deliveries: [parcel('DELIVERED')] })
  assert.match(view.html(), /DELIVERED/)
  assert.match(view.html(), /role="dialog"/)
  assert.doesNotMatch(view.html(), /class="delivery-card"/)
})

test('manual Track normalizes input and requests a fresh provider snapshot', () => {
  const view = dashboard([parcel()])
  nodes(view.tree).find(node => node.type === 'input').props.onChange({ target: { value: ' sd-0123456789abcdeffedcba9876543210 ' } })
  view.render()
  let prevented = false
  nodes(view.tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() { prevented = true } })
  view.render()
  assert.equal(prevented, true)
  assert.equal(view.refreshes, 1)
  assert.match(view.html(), /role="dialog"/)
})

test('loading and failed reads do not claim that an empty account has no bookings', () => {
  const view = dashboard([]).render({ isLoading: true })
  assert.match(view.html(), /Loading deliveries/)
  view.render({ isLoading: false, error: 'Unable to refresh deliveries.' })
  assert.match(view.html(), /Unable to refresh deliveries/)
})
