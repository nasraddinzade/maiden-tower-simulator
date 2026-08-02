import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { keyDates, openingsLit, sunPosition, sunriseAzimuth, type OpeningAperture } from '../../lib/sun'
import { BUTTRESS, SITE } from '../../config/tower'
import {
  SITE_TIMEZONE,
  formatZonedTime,
  toZoned,
  withZonedDayOfYear,
  withZonedTime,
  zonedDayOfYear,
  zonedMinutesOfDay,
} from '../../lib/time'

export interface SunControlsProps {
  date: Date
  onChange: (d: Date) => void
  apertures: OpeningAperture[]
  /** True while the clock is following real time in Baku. */
  live?: boolean
  /** Snap back to now and start following again. */
  onResumeLive?: () => void
}

/** Preset id → i18n key in the `ui` namespace. */
const PRESET_KEYS: Record<string, string> = {
  'winter-solstice': 'winterSolstice',
  'spring-equinox': 'springEquinox',
  novruz: 'novruz',
  'summer-solstice': 'summerSolstice',
  'autumn-equinox': 'autumnEquinox',
}

/**
 * Phase-8 scrubber: a day-of-year slider, a time-of-day slider, the key-day
 * presets, and — the part that matters — a readout of which openings the sun
 * actually reaches at this instant.
 */
export function SunControls({ date, onChange, apertures, live, onResumeLive }: SunControlsProps) {
  const { t, i18n } = useTranslation('ui')
  const sun = useMemo(() => sunPosition(date, SITE.latitude, SITE.longitude), [date])
  const lit = useMemo(() => openingsLit(sun, apertures), [sun, apertures])
  const riseAz = useMemo(() => sunriseAzimuth(date, SITE.latitude, SITE.longitude), [date])

  // Everything the viewer reads or drags is Baku wall-clock time; the state
  // itself stays an absolute instant, which is what the sun actually depends on.
  const setDay = (day: number) => onChange(withZonedDayOfYear(date, day))
  const setMinutes = (mins: number) =>
    onChange(withZonedTime(date, Math.floor(mins / 60), mins % 60))

  const minutes = zonedMinutesOfDay(date)
  const clock = formatZonedTime(date)
  const wall = toZoned(date)

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 44,
        zIndex: 20,
        width: 268,
        maxHeight: '52vh',
        overflowY: 'auto',
        font: '11px/1.45 ui-monospace, monospace',
        color: '#e6e6e6',
        background: 'rgba(12,14,18,.86)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 8,
        padding: '8px 10px',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {t('sunTitle', { lat: SITE.latitude.toFixed(2) })}
      </div>
      <div style={{ color: '#7d8794', fontSize: 10, marginBottom: 2 }}>{SITE_TIMEZONE}</div>

      <div>
        {new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })}{' '}
        · {clock}
        {live ? (
          <span style={{ color: '#8fd9a8', marginLeft: 6 }}>● {t('liveClock')}</span>
        ) : (
          onResumeLive && (
            <button
              onClick={onResumeLive}
              style={{
                font: '10px ui-monospace, monospace',
                color: '#dfe6ee',
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.18)',
                borderRadius: 4,
                padding: '1px 6px',
                marginLeft: 6,
                cursor: 'pointer',
              }}
            >
              {t('now')}
            </button>
          )
        )}
      </div>
      <input
        type="range"
        min={1}
        max={365}
        value={zonedDayOfYear(date)}
        onChange={(e) => setDay(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <input
        type="range"
        min={0}
        max={24 * 60 - 1}
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        style={{ width: '100%' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
        {keyDates(date.getFullYear()).map((k) => (
          <button
            key={k.id}
            onClick={() => onChange(new Date(k.date))}
            style={{
              font: '10px ui-monospace, monospace',
              color: '#dfe6ee',
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.18)',
              borderRadius: 5,
              padding: '2px 6px',
              cursor: 'pointer',
            }}
          >
            {t(PRESET_KEYS[k.id] ?? k.id)}
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 6 }}>
        {t('azimuth')} <b>{sun.azimuthDeg.toFixed(1)}°</b> · {t('altitude')}{' '}
        <b style={{ color: sun.isUp ? '#8fd9a8' : '#8b97a6' }}>{sun.altitudeDeg.toFixed(1)}°</b>
        {!sun.isUp && ` (${t('belowHorizon')})`}
        <br />
        {t('sunriseToday')}: <b>{riseAz === null ? '—' : `${riseAz.toFixed(1)}°`}</b>
      </div>

      <div style={{ marginTop: 6 }}>
        <div style={{ color: '#9fb0c2' }}>{t('beamEnters')}</div>
        {lit.length === 0 ? (
          <div style={{ color: '#8b97a6' }}>{t('beamEntersNone')}</div>
        ) : (
          lit.map((h) => (
            <div key={h.openingId} style={{ color: '#ffd88f' }}>
              {h.openingId} — {t('offset')} {h.bearingOffsetDeg.toFixed(1)}°
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 6, color: '#9fb0c2', fontSize: 11 }}>
        {t('buttress')} {BUTTRESS.azimuthDeg}° · {t('equinoxSunrise')} ≈90°
      </div>
    </div>
  )
}
