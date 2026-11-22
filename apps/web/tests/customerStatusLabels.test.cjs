const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const test = require('node:test')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')
const ts = createRequire(path.resolve(__dirname, '../../../package.json'))('typescript')
const { DELIVERY_STATUS_LABELS } = require('../src/features/customer/context/customerDeliveryModel.ts')

// Exercise production labels, parsers and JSX with the existing compiler/server
// renderer. Expose view components only inside this test module's compilation;
// effects/transports do not run and no production exports are changed.
function loadSource(relativePath, dependencies = {}, exposed = []) {
  const filename = path.resolve(__dirname, '../src/features/customer', relativePath)
  const sourceRequire = createRequire(filename)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
  }).outputText
  const output = { exports: {} }
  const load = name => {
    if (name.endsWith('/env')) return { env: { apiBaseUrl: 'https://api.invalid/api/v1' } }
    if (name.endsWith('.css')) return {}
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    return sourceRequire(name)
  }
  const expose = exposed.map(name => `\nexports.${name} = ${name};`).join('')
  new Function('require', 'module', 'exports', source + expose)(load, output, output.exports)
  return output.exports
}

const api = loadSource('tracking/customerTrackingApi.ts', {
  './customerRequest': require('../src/features/customer/tracking/customerRequest.ts'),
})
const { ParcelDetails } = loadSource('pages/CustomerTrackingPage.tsx', {
  '../tracking/customerTrackingApi': api,
  '../tracking/customerTrackingUpdates': {},
  '../../../lib/realtime/LiveIndicator': {},
  '../../../lib/realtime/useParcelRealtime': {},
}, ['ParcelDetails'])
const { DeliveryRow } = loadSource('pages/DeliveryHistoryPage.tsx', {
  '../tracking/customerTrackingApi': api,
  '../tracking/customerReceiptApi': {},
}, ['DeliveryRow'])

const parcel = status => ({
  id: 'owned-parcel', trackingNumber: 'SD-21011', status,
  createdAt: '2026-11-20T00:35:57.712Z', destination: 'Kandy',
  history: [{ status, occurredAt: '2026-11-20T00:35:57.712Z' }],
})

for (const [status, label] of [['PENDING', 'Pending pickup'], ['CREATED', 'Created']]) {
  test(`${status} has a distinct friendly label shared with the Dashboard`, () => {
    assert.deepEqual(api.STATUS_DETAILS[status], { label, tone: 'neutral' })
    assert.equal(DELIVERY_STATUS_LABELS[status], label)
    assert.notEqual(api.STATUS_DETAILS.PENDING.label, api.STATUS_DETAILS.CREATED.label)
  })

  test(`Customer Tracking renders ${label} as the current status without confirming pickup`, () => {
    const html = renderToStaticMarkup(React.createElement(ParcelDetails, { parcel: parcel(status) }))
    assert.match(html, new RegExp(`customer-tracking-badge--neutral">${label}<`))
    assert.match(html, new RegExp(`customer-tracking-step-label">${label}<`))
    assert.doesNotMatch(html, /customer-tracking-step--completed|>PENDING<|>CREATED</)
  })

  test(`Delivery History renders the same ${label} label`, () => {
    const row = React.createElement(DeliveryRow, { delivery: parcel(status), onAccessError: () => false })
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement('table', null, React.createElement('tbody', null, row))))
    assert.match(html, new RegExp(`customer-deliveries-badge--neutral">${label}<`))
    assert.doesNotMatch(html, />PENDING<|>CREATED</)
  })

  test(`tracking and history parsers preserve the ${status} API code and recorded event`, async context => {
    const originalFetch = globalThis.fetch
    context.after(() => { globalThis.fetch = originalFetch })
    const record = parcel(status)
    globalThis.fetch = async url => Response.json(url.includes('/customer/tracking/') ? record : {
      items: [record], page: 1, pageSize: 5, total: 1,
    })
    const controller = new AbortController()
    const tracking = await api.getCustomerTracking(record.trackingNumber, controller.signal)
    const history = await api.getCustomerDeliveries({ filter: 'all', search: '', page: 1, pageSize: 5 }, controller.signal)
    assert.equal(tracking.status, status)
    assert.deepEqual(tracking.history, record.history)
    assert.equal(history.items[0].status, status)
  })
}
