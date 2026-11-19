import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  RefreshCw,
  ReceiptText,
} from 'lucide-react'
import { apiRequest } from '../../../api/client'
import { env } from '../../../lib/env'
import styles from './MerchantPricingPage.module.css'

interface PricingSummary {
  today: { date: string; deliveries: number; total: number }
  period: { from: string; to: string; deliveries: number; total: number }
}

interface PricingHistoryRow {
  date: string
  shortDate: string
  deliveries: number
  total: number
  periodLabel: string
}

interface PricingHistory {
  period: { from: string; to: string }
  history: PricingHistoryRow[]
  summary: {
    today: { date: string; deliveries: number; total: number }
    period: { from: string; to: string; deliveries: number; total: number }
  }
}

interface PricingCharge {
  trackingNumber: string
  orderRef: string
  destinationZone: string
  weight: string
  weightKg: number | null
  deliveryFee: number
  adjustments: number
  total: number
}

interface PricingDay {
  date: string
  shortDate: string
  deliveries: number
  total: number
  charges: PricingCharge[]
}

function formatLkr(value: number) {
  return `LKR ${value.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getLocalDateOffset(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function MerchantPricingPage() {
  const navigate = useNavigate()
  const { date } = useParams()
  const [periodDays, setPeriodDays] = useState(7)
  const [summary, setSummary] = useState<PricingSummary | null>(null)
  const [history, setHistory] = useState<PricingHistory | null>(null)
  const [day, setDay] = useState<PricingDay | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const period = useMemo(() => {
    const to = getLocalDateOffset(0)
    const from = getLocalDateOffset(-(periodDays - 1))
    return { from, to }
  }, [periodDays])

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      try {
        if (date) {
          const dayResult = await apiRequest<PricingDay>(
            `/merchant/pricing/days/${encodeURIComponent(date)}`,
            { signal: controller.signal },
          )
          if (!controller.signal.aborted) setDay(dayResult)
          return
        }

        const [summaryResult, historyResult] = await Promise.all([
          apiRequest<PricingSummary>('/merchant/pricing/summary', {
            query: period,
            signal: controller.signal,
          }),
          apiRequest<PricingHistory>('/merchant/pricing/history', {
            query: period,
            signal: controller.signal,
          }),
        ])
        if (!controller.signal.aborted) {
          setSummary(summaryResult)
          setHistory(historyResult)
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Unable to load merchant pricing.',
          )
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [date, period])

  const downloadReport = async (
    format: 'csv' | 'pdf',
    reportDate?: string,
  ) => {
    const path = reportDate
      ? `/merchant/pricing/days/${encodeURIComponent(reportDate)}/export?format=${format}`
      : `/merchant/pricing/history/export?format=${format}&from=${period.from}&to=${period.to}`
    const response = await fetch(`${env.apiBaseUrl}${path}`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error('Unable to download pricing report.')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = reportDate
      ? `merchant-pricing-${reportDate}.${format}`
      : `merchant-pricing-history.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
    setToast(`${format.toUpperCase()} report downloaded`)
  }

  if (date) {
    if (loadError) {
      return (
        <div className={styles.page}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/merchant/pricing')}>
            <ArrowLeft size={12} />Back to pricing
          </button>
          <section className={styles.detailCard} role="alert">{loadError}</section>
        </div>
      )
    }
    if (!day) {
      return <div className={styles.page}>Loading daily pricing…</div>
    }

    return (
      <div className={styles.page}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/merchant/pricing')}>
          <ArrowLeft size={12} />
          Back to pricing
        </button>

        <div className={styles.headingRow}>
          <div>
            <h1>Daily cost breakdown</h1>
            <p>{day.shortDate} · Sri Lanka time</p>
          </div>
          <div className={styles.headingActions}>
            <button type="button" className={styles.outlineButton} onClick={() => void downloadReport('csv', day.date)}>
              <Download size={13} />Download CSV
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => void downloadReport('pdf', day.date)}>
              <Download size={13} />Download PDF
            </button>
          </div>
        </div>

        <section className={styles.summaryCard}>
          <div className={styles.summaryMain}>
            <span className={styles.summaryIcon}><ReceiptText size={18} /></span>
            <div className={styles.summaryCopy}>
              <span>Total delivery cost</span>
              <strong>{formatLkr(day.total)}</strong>
              <small>{day.deliveries} charged deliveries · Total for the day</small>
            </div>
          </div>
        </section>

        <section className={styles.breakdownCard}>
          <div className={styles.breakdownCardHeader}>
            <div>
              <h2>Delivery charges</h2>
              <p>All amounts in LKR</p>
            </div>
          </div>
          <div className={styles.tableScroller}>
            <table className={styles.breakdownTable}>
              <thead>
                <tr>
                  <th>Tracking no.</th>
                  <th>Order ref.</th>
                  <th>Destination zone</th>
                  <th>Weight</th>
                  <th>Delivery fee</th>
                  <th>Adjustments</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {day.charges.map((charge) => (
                  <tr key={charge.trackingNumber}>
                    <td>{charge.trackingNumber}</td>
                    <td>{charge.orderRef}</td>
                    <td>{charge.destinationZone}</td>
                    <td>{charge.weight}</td>
                    <td>{charge.deliveryFee.toFixed(2)}</td>
                    <td>{charge.adjustments.toFixed(2)}</td>
                    <td>{charge.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className={styles.breakdownFooter}>
            <span><strong>Daily total</strong></span>
            <strong>{formatLkr(day.total)}</strong>
          </footer>
        </section>

        <div className={styles.infoCard}>
          <div className={styles.infoMain}>
            <span className={styles.infoIcon}><RefreshCw size={14} /></span>
            <div>
              <strong>Totals may change until the end of the day</strong>
              <span>Report values are based on recorded delivery charges.</span>
            </div>
          </div>
          <button type="button" className={styles.textButton} onClick={() => setToast('Support request opened')}>
            Contact support
          </button>
        </div>
        {toast && <div className={styles.toast} role="status">{toast}</div>}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.headingRow}>
        <div>
          <h1>Pricing</h1>
          <p>See your daily delivery costs and download itemized reports.</p>
        </div>
      </div>

      {loadError && <section className={styles.detailCard} role="alert">{loadError}</section>}

      <section className={styles.summaryCard}>
        <div className={styles.summaryMain}>
          <span className={styles.summaryIcon}><ReceiptText size={18} /></span>
          <div className={styles.summaryCopy}>
            <span>Today's delivery cost</span>
            <strong>{formatLkr(summary?.today.total ?? 0)}</strong>
            <small>{summary?.today.deliveries ?? 0} charged deliveries · Total so far</small>
          </div>
        </div>
        {summary?.today.date && (
          <button type="button" className={styles.outlineButton} onClick={() => navigate(`/merchant/pricing/${summary.today.date}`)}>
            View today's breakdown
          </button>
        )}
      </section>

      <section className={styles.historyCard}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Daily cost history</h2>
            <p>Grouped by charge date · Sri Lanka time</p>
          </div>
          <label className={styles.periodSelect}>
            <CalendarDays size={13} />
            <select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={21}>Last 21 days</option>
            </select>
            <ChevronDown size={12} />
          </label>
        </div>

        <div className={styles.tableScroller}>
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Charged deliveries</th>
                <th>Total cost (LKR)</th>
                <th>Report</th>
                <th aria-label="Download report"></th>
              </tr>
            </thead>
            <tbody>
              {(history?.history ?? []).map((row, index) => (
                <tr
                  key={row.date}
                  tabIndex={0}
                  onClick={() => navigate(`/merchant/pricing/${row.date}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      navigate(`/merchant/pricing/${row.date}`)
                    }
                  }}
                >
                  <td>
                    {row.shortDate}
                    {index === 0 && <span className={styles.todayLabel}>Today</span>}
                  </td>
                  <td>{row.deliveries}</td>
                  <td>{row.total.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                  <td>
                    <button type="button" className={styles.viewLink} onClick={(event) => {
                      event.stopPropagation()
                      navigate(`/merchant/pricing/${row.date}`)
                    }}>
                      View breakdown
                    </button>
                  </td>
                  <td>
                    <button type="button" className={styles.downloadLink} onClick={(event) => {
                      event.stopPropagation()
                      void downloadReport('csv', row.date)
                    }}>
                      <Download size={12} />Download report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className={styles.historyFooter}>
          <span>Selected period</span>
          <span><strong>{summary?.period.deliveries ?? 0} deliveries</strong></span>
          <strong>{formatLkr(summary?.period.total ?? 0)}</strong>
        </footer>
      </section>

      <section className={styles.infoCard}>
        <div className={styles.infoMain}>
          <span className={styles.infoIcon}><FileText size={15} /></span>
          <div>
            <strong>What's in each report?</strong>
            <span>Tracking number, order reference, charge date, delivery fee, adjustments and daily totals.</span>
          </div>
        </div>
        <span>Today's report includes charges recorded so far.</span>
        <button type="button" className={styles.downloadLink} onClick={() => void downloadReport('csv')}>
          <Download size={12} />Download period CSV
        </button>
      </section>
      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
  )
}
