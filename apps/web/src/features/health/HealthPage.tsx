import { useEffect, useState } from 'react'
import { env } from '../../lib/env'
import './HealthPage.css'

interface ApiHealth {
  status: 'ok' | 'error'
  uptime: number
  timestamp: string
  checks: { database: 'up' | 'down' }
}

interface DatabaseReport {
  database: string
  version: string
  size: string
  tableCount: number
  totalRows: number
  tables: { name: string; rows: number }[]
  migrations: { applied: number; latest: string | null }
}

type Result<T> =
  | { state: 'loading' }
  | { state: 'ok'; data: T; ms: number }
  | { state: 'error'; message: string; data?: T }
  | { state: 'hidden' }

const REFRESH_MS = 15_000

// 503 responses still carry the report body, so parse JSON whatever the status
async function getJson<T>(path: string): Promise<Result<T>> {
  const started = performance.now()
  try {
    const res = await fetch(`${env.apiBaseUrl}${path}`)
    const ms = Math.round(performance.now() - started)
    if (res.status === 404) return { state: 'hidden' }
    const data = (await res.json()) as T
    return res.ok
      ? { state: 'ok', data, ms }
      : { state: 'error', message: `HTTP ${res.status}`, data }
  } catch {
    return { state: 'error', message: 'API unreachable (is it running? CORS?)' }
  }
}

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h && `${h}h`, (h || m) && `${m}m`, `${s}s`].filter(Boolean).join(' ')
}

function Badge({ ok, label }: { ok: boolean | null; label: string }) {
  const tone = ok === null ? 'pending' : ok ? 'up' : 'down'
  return <span className={`badge badge--${tone}`}>{label}</span>
}

export default function HealthPage() {
  const [api, setApi] = useState<Result<ApiHealth>>({ state: 'loading' })
  const [db, setDb] = useState<Result<DatabaseReport>>({ state: 'loading' })
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  // Bumping this re-runs the effect below (manual refresh)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      Promise.all([
        getJson<ApiHealth>('/health'),
        getJson<DatabaseReport>('/health/db'),
      ]).then(([apiResult, dbResult]) => {
        if (cancelled) return
        setApi(apiResult)
        setDb(dbResult)
        setCheckedAt(new Date())
      })

    void load()
    const id = setInterval(() => void load(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [tick])

  const refresh = () => setTick((t) => t + 1)

  const apiReport = api.state === 'ok' || api.state === 'error' ? api.data : undefined
  const dbUp = apiReport ? apiReport.checks.database === 'up' : null

  return (
    <main className="health">
      <header className="health__header">
        <div>
          <h1>System health</h1>
          <p className="muted">
            {checkedAt
              ? `Last checked ${checkedAt.toLocaleTimeString()} · refreshes every ${REFRESH_MS / 1000}s`
              : 'Checking…'}
          </p>
        </div>
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </header>

      <section className="health__cards">
        <article className="card">
          <h2>Web app</h2>
          <Badge ok label="Up" />
          <dl>
            <dt>Mode</dt>
            <dd>{import.meta.env.MODE}</dd>
            <dt>API URL</dt>
            <dd className="mono">{env.apiBaseUrl}</dd>
          </dl>
        </article>

        <article className="card">
          <h2>API</h2>
          {api.state === 'loading' && <Badge ok={null} label="Checking" />}
          {api.state === 'ok' && <Badge ok label="Up" />}
          {api.state === 'error' && <Badge ok={false} label={apiReport ? 'Degraded' : 'Down'} />}
          {api.state === 'error' && <p className="error">{api.message}</p>}
          {apiReport && (
            <dl>
              <dt>Uptime</dt>
              <dd>{formatUptime(apiReport.uptime)}</dd>
              {api.state === 'ok' && (
                <>
                  <dt>Response</dt>
                  <dd>{api.ms} ms</dd>
                </>
              )}
            </dl>
          )}
        </article>

        <article className="card">
          <h2>Database</h2>
          {dbUp === null ? (
            <Badge ok={null} label={api.state === 'loading' ? 'Checking' : 'Unknown'} />
          ) : (
            <Badge ok={dbUp} label={dbUp ? 'Up' : 'Down'} />
          )}
          {db.state === 'ok' && (
            <dl>
              <dt>Name</dt>
              <dd>{db.data.database}</dd>
              <dt>PostgreSQL</dt>
              <dd>{db.data.version}</dd>
              <dt>Size</dt>
              <dd>{db.data.size}</dd>
              <dt>Migrations</dt>
              <dd>
                {db.data.migrations.applied}
                {db.data.migrations.latest && (
                  <span className="muted mono"> · {db.data.migrations.latest}</span>
                )}
              </dd>
            </dl>
          )}
        </article>
      </section>

      {db.state === 'ok' && (
        <section className="card">
          <div className="tables__header">
            <h2>Tables</h2>
            <p className="muted">
              {db.data.tableCount} tables · {db.data.totalRows.toLocaleString()} rows
            </p>
          </div>
          {db.data.tables.length === 0 ? (
            <p className="muted">No tables yet. Run a migration.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Table</th>
                  <th className="num">Rows</th>
                </tr>
              </thead>
              <tbody>
                {db.data.tables.map((t) => (
                  <tr key={t.name}>
                    <td className="mono">{t.name}</td>
                    <td className="num">{t.rows.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {db.state === 'hidden' && (
        <p className="muted">Database details are hidden in production.</p>
      )}
    </main>
  )
}
