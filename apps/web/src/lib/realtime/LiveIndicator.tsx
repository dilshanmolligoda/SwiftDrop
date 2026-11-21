import type { RealtimeState } from './useParcelRealtime'

const LABELS: Record<Exclude<RealtimeState, 'off'>, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
}

const COLORS: Record<Exclude<RealtimeState, 'off'>, string> = {
  connecting: '#9ca3af',
  live: '#16a34a',
  reconnecting: '#d97706',
}

/** Small "Live" badge. Renders nothing when live updates are off. */
export function LiveIndicator({ state }: { readonly state: RealtimeState }) {
  if (state === 'off') return null
  return (
    <span
      role="status"
      aria-live="polite"
      title={state === 'live' ? 'This page updates automatically' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: COLORS[state],
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[state] }}
      />
      {LABELS[state]}
    </span>
  )
}
