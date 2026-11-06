/**
 * Single demo page: store settings, a checkout form that books a SwiftDrop
 * delivery, and live lists of orders sent and webhooks received.
 * Values are rendered with textContent only, so payloads cannot inject HTML.
 */
export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lanka Gadgets — mock merchant store</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#111827; --muted:#6b7280; --line:#e5e7eb;
          --ok:#047857; --bad:#b91c1c; --warn:#b45309; --accent:#2563eb; }
  * { box-sizing: border-box; }
  body { margin:0; font:14px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--text); }
  header { padding:16px; background:var(--card); border-bottom:1px solid var(--line); }
  header h1 { margin:0; font-size:18px; }
  header p { margin:2px 0 0; color:var(--muted); }
  main { display:grid; gap:16px; padding:16px; max-width:1100px; margin:0 auto;
         grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
  h2 { margin:0 0 12px; font-size:15px; }
  label { display:block; margin-bottom:10px; color:var(--muted); font-size:12px; }
  input, select { display:block; width:100%; margin-top:4px; padding:8px; font:inherit;
                  border:1px solid var(--line); border-radius:6px; }
  button { padding:8px 14px; font:inherit; border:0; border-radius:6px; background:var(--accent);
           color:#fff; cursor:pointer; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .toggle { display:flex; gap:8px; align-items:center; color:var(--text); font-size:14px; }
  .toggle input { width:auto; margin:0; }
  .wide { grid-column:1 / -1; }
  ul { list-style:none; margin:0; padding:0; }
  li { border-top:1px solid var(--line); padding:8px 0; }
  .tag { font-weight:600; font-size:12px; }
  .ACCEPTED, .s2 { color:var(--ok); } .DUPLICATE, .FAIL_MODE { color:var(--warn); }
  .BAD_SIGNATURE, .s4, .s5 { color:var(--bad); }
  pre { margin:4px 0 0; padding:8px; background:var(--bg); border-radius:6px; overflow:auto; font-size:12px; }
  .muted { color:var(--muted); }
</style>
</head>
<body>
<header>
  <h1>Lanka Gadgets — mock merchant store</h1>
  <p>A stand-in for a partner shop: books deliveries with the SwiftDrop API and receives signed status webhooks.</p>
</header>
<main>
  <section>
    <h2>Store settings</h2>
    <form id="settings">
      <label>SwiftDrop API base URL<input name="apiBaseUrl"></label>
      <label>API key <span id="keyState" class="muted"></span><input name="apiKey" type="password" placeholder="sd_…" autocomplete="off"></label>
      <label>Webhook signing secret <span id="secretState" class="muted"></span><input name="webhookSecret" type="password" autocomplete="off"></label>
      <div class="row"><button>Save</button><span id="settingsMsg" class="muted"></span></div>
    </form>
    <p class="muted">Webhook URL to register in SwiftDrop: <code id="hookUrl"></code></p>
    <label class="toggle"><input type="checkbox" id="failMode"> Fail mode — answer every webhook with 500 to trigger retries</label>
  </section>

  <section>
    <h2>Checkout — book a delivery</h2>
    <form id="order">
      <label>Order reference<input name="merchantOrderRef" required></label>
      <label>Recipient name<input name="recipientName" required></label>
      <label>Recipient phone<input name="recipientPhone" required></label>
      <label>Pickup address<input name="pickupAddress" value="12 Galle Road, Colombo 03" required></label>
      <label>Drop-off address<input name="dropoffAddress" required></label>
      <div class="row">
        <label style="flex:1">Weight (kg)<input name="weightKg" type="number" min="0.1" step="0.1" value="1" required></label>
        <label style="flex:1">Size<select name="size"><option>SMALL</option><option>MEDIUM</option><option>LARGE</option></select></label>
      </div>
      <div class="row"><button>Create order</button><span id="orderMsg" class="muted"></span></div>
    </form>
  </section>

  <section class="wide"><h2>Orders sent to SwiftDrop</h2><ul id="orders"></ul></section>
  <section class="wide"><h2>Webhooks received</h2><ul id="webhooks"></ul></section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  $('hookUrl').textContent = location.origin + '/webhooks/swiftdrop';

  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  function item(tagText, tagClass, title, data) {
    const li = document.createElement('li');
    const head = document.createElement('div');
    const tag = document.createElement('span');
    tag.className = 'tag ' + tagClass;
    tag.textContent = tagText;
    head.append(tag, ' ' + title);
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(data, null, 2);
    li.append(head, pre);
    return li;
  }

  function renderList(el, entries, toItem, empty) {
    el.replaceChildren(...(entries.length ? entries.map(toItem) : [Object.assign(document.createElement('li'), { className: 'muted', textContent: empty })]));
  }

  let firstLoad = true;
  async function refresh() {
    const state = await fetch('/state').then((r) => r.json());
    const s = state.settings;
    if (firstLoad) { document.forms.settings.apiBaseUrl.value = s.apiBaseUrl; firstLoad = false; }
    $('keyState').textContent = s.apiKey ? '(saved: ' + s.apiKey + ')' : '(not set)';
    $('secretState').textContent = s.webhookSecretSet ? '(saved)' : '(not set)';
    $('failMode').checked = s.failMode;
    renderList($('orders'), state.orders,
      (o) => item(String(o.status), 's' + String(o.status)[0], o.merchantOrderRef + ' · ' + new Date(o.sentAt).toLocaleTimeString(), o.response),
      'No orders yet.');
    renderList($('webhooks'), state.webhooks,
      (w) => item(w.result, w.result, 'replied ' + w.respondedWith + ' · ' + w.eventId + ' · ' + new Date(w.receivedAt).toLocaleTimeString(), w.payload),
      'No webhooks yet. Register the webhook URL above in SwiftDrop, then change a parcel status.');
  }

  document.forms.settings.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    await post('/settings', Object.fromEntries(new FormData(form)));
    form.apiKey.value = ''; form.webhookSecret.value = '';
    $('settingsMsg').textContent = 'Saved';
    refresh();
  });

  $('failMode').addEventListener('change', (e) => post('/settings', { failMode: e.target.checked }).then(refresh));

  document.forms.order.addEventListener('submit', async (e) => {
    e.preventDefault();
    const order = Object.fromEntries(new FormData(e.target));
    order.weightKg = Number(order.weightKg);
    $('orderMsg').textContent = 'Sending…';
    const res = await post('/orders', order);
    $('orderMsg').textContent = res.status < 300 ? 'Created' : 'Failed (' + res.status + ')';
    refresh();
  });

  refresh();
  setInterval(refresh, 2000);
</script>
</body>
</html>`;
}
