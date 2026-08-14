import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isPlaceholder } from '../../i18n'
import type { PassageOpening } from '../../lib/passageOpenings'

export interface DatumCaveatProps {
  /** Ends whose existence the [OSM] trace cannot settle — openingsInsideDatumError(). */
  openings: PassageOpening[]
}

/**
 * THE ONE CAVEAT THAT IS SHOWN TO THE VISITOR RATHER THAN TO THE MODELLER.
 *
 * Everything else this repository knows about its own uncertainty is in comments,
 * in windows.json, or in console warnings — all of which are addressed to whoever
 * is editing the model. This one is not, and the difference is the reason it
 * exists: a person walking the passage at the head of the 6→7 climb is looking at
 * a window whose existence turns on 19 mm of a satellite tracing, and neither a
 * comment nor a console line reaches them. See lib/passageOpenings.ts →
 * pierEdgeReading() for the decision this is the visible half of.
 *
 * It appears only when there IS such an opening. That is deliberate and it is not
 * tidiness: a caveat that is always on screen is furniture, and gets read like
 * furniture. If the stair is ever turned and this goes quiet, the model has stopped
 * standing anything on the fourth significant figure of that trace, and the silence
 * is the news.
 *
 * WHAT IT DOES NOT SAY. It does not say the window is wrong, and it does not
 * invite the reader to discount it. The state of the evidence is that nobody
 * knows — the record for this end is [PLACEHOLDER] and the geometry's answer is
 * inside its own noise — and a caveat that leaned either way would be making the
 * claim the model has just refused to make.
 */
export function DatumCaveat({ openings }: DatumCaveatProps) {
  const { t, i18n } = useTranslation('ui')
  const [open, setOpen] = useState(false)

  /** Azerbaijani prose is still TODO_AZ; fall back rather than show the marker. */
  const text = (key: string, opts?: Record<string, unknown>): string => {
    const v = t(key, { defaultValue: '', ...opts })
    if (typeof v === 'string' && v && !isPlaceholder(v)) return v
    return i18n.getFixedT('ru', 'ui')(key, { defaultValue: '', ...opts }) as string
  }

  if (openings.length === 0) return null

  // CLAUDE.md: numbers through Intl, locale from i18next. Millimetres, whole,
  // because the comparison this panel exists to make — 19 against 30 — is
  // unreadable in degrees at the fourth decimal place, which is precisely how it
  // stayed invisible in the config for as long as it did.
  const mm = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 })
  const rows = openings.map((o) => ({
    id: o.id,
    clear: mm.format(Math.abs(o.pier.centreOffset) * 1000),
    tol: mm.format(o.pier.toleranceOffset * 1000),
  }))

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 12,
        zIndex: 21,
        width: 'min(520px, calc(100vw - 24px))',
        font: '11px/1.5 system-ui, sans-serif',
        color: '#e8e8e8',
        background: 'rgba(12,14,18,.9)',
        border: '1px solid rgba(255,216,143,.35)',
        borderRadius: 8,
        padding: '7px 10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: '#ffd88f', fontWeight: 700 }}>{text('datumTitle')}</span>
        <span style={{ flex: 1 }}>{text('datumHeadline')}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            font: '10px ui-monospace, monospace',
            color: '#dfe6ee',
            background: 'rgba(255,255,255,.08)',
            border: '1px solid rgba(255,255,255,.18)',
            borderRadius: 4,
            padding: '1px 6px',
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          {open ? text('datumLess') : text('datumMore')}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 6 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ color: '#ffd88f', font: '11px ui-monospace, monospace' }}>
              {text('datumNumbers', r)}
            </div>
          ))}
          <div style={{ marginTop: 4, color: '#c8d2de' }}>{text('datumBody', rows[0])}</div>
        </div>
      )}
    </div>
  )
}
