import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { keyDates, openingsLit, sunPosition, sunriseAzimuth, type OpeningAperture } from '../../lib/sun'
import { BUTTRESS, SITE } from '../../config/tower'
import { UI } from '../../config/ui'
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
  /**
   * Lay the controls out for a finger rather than a cursor: 44 px sliders and
   * buttons instead of the 12–16 px ones a cursor can hit. It changes nothing
   * the panel says — only what it can be operated with. See config/ui.ts.
   */
  touch?: boolean
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
 *
 * THE PANEL AND ITS CORNER ARE TWO THINGS NOW. `SunControlsBody` is the content;
 * `SunControls` is the content pinned to the bottom-left of a desktop. On a
 * phone the same body is raised from the action bar instead
 * (components/ui/CompactChrome.tsx), which is the whole of what "the same
 * interface, laid out for a small screen" means here — one panel, two frames,
 * no second copy of the scrubber to drift out of step with this one.
 */
export function SunControlsBody({
  date,
  onChange,
  apertures,
  live,
  onResumeLive,
  touch = false,
}: SunControlsProps) {
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

  const slider: React.CSSProperties = touch
    ? { width: '100%', height: UI.minTouchTarget, margin: 0 }
    : { width: '100%' }

  const chip: React.CSSProperties = {
    font: `${touch ? 12 : 10}px ui-monospace, monospace`,
    color: '#dfe6ee',
    background: 'rgba(255,255,255,.08)',
    border: '1px solid rgba(255,255,255,.18)',
    borderRadius: 5,
    padding: touch ? '0 12px' : '2px 6px',
    minHeight: touch ? UI.minTouchTarget : undefined,
    cursor: 'pointer',
  }

  return (
    <>
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
                ...chip,
                // this one has always been a shade tighter than the preset
                // chips beside it; kept to the pixel so the desktop panel is
                // the panel it was
                borderRadius: touch ? 5 : 4,
                padding: touch ? '0 12px' : '1px 6px',
                marginLeft: 6,
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
        style={slider}
      />
      <input
        type="range"
        min={0}
        max={24 * 60 - 1}
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        style={slider}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: touch ? 6 : 4, margin: '6px 0' }}>
        {keyDates(date.getFullYear()).map((k) => (
          <button key={k.id} onClick={() => onChange(new Date(k.date))} style={chip}>
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
    </>
  )
}

/** The desktop framing: pinned to the bottom-left corner. Unchanged. */
export function SunControls(props: SunControlsProps) {
  return (
    <div
      style={{
        position: 'fixed',
        left: UI.gutter,
        bottom: UI.docked.sunBottom,
        zIndex: 20,
        boxSizing: 'border-box',
        width: UI.docked.sunWidth,
        maxHeight: `${UI.docked.sunMaxHeightFraction * 100}vh`,
        overflowY: 'auto',
        font: '11px/1.45 ui-monospace, monospace',
        color: '#e6e6e6',
        background: 'rgba(12,14,18,.86)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 8,
        padding: '8px 10px',
      }}
    >
      <SunControlsBody {...props} />
    </div>
  )
}
