import { useState } from 'react'
import { UI } from '../../config/ui'
import { useFallbackText } from '../../hooks/useFallbackText'
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
 *
 * IT CAN BE PUT AWAY ON A PHONE, AND THAT IS NOT A RETREAT FROM ANY OF THE ABOVE.
 * On a 375 px screen this strip lay across the source link of the panel beneath
 * it, at a higher z-index, so the caveat about a source was covering a source.
 * A notice that cannot be dismissed on a screen this size is not more honest than
 * one that can — it is just the last thing the visitor is able to read. Dismissing
 * it takes it off the view and leaves it in the panel list, where it keeps its
 * warning colour; nothing is lost and nothing is hidden.
 */

/** The numbers and the argument. Shared by both framings. */
export function DatumCaveatBody({ openings }: DatumCaveatProps) {
  const { text, language } = useFallbackText('ui')

  // CLAUDE.md: numbers through Intl, locale from i18next. Millimetres, whole,
  // because the comparison this panel exists to make — 19 against 30 — is
  // unreadable in degrees at the fourth decimal place, which is precisely how it
  // stayed invisible in the config for as long as it did.
  const mm = new Intl.NumberFormat(language, { maximumFractionDigits: 0 })
  const rows = openings.map((o) => ({
    id: o.id,
    clear: mm.format(Math.abs(o.pier.centreOffset) * 1000),
    tol: mm.format(o.pier.toleranceOffset * 1000),
  }))
  if (rows.length === 0) return null

  return (
    <>
      {rows.map((r) => (
        <div key={r.id} style={{ color: '#ffd88f', font: '11px ui-monospace, monospace' }}>
          {text('datumNumbers', r)}
        </div>
      ))}
      <div style={{ marginTop: 4, color: '#c8d2de' }}>{text('datumBody', rows[0])}</div>
    </>
  )
}

/** The desktop framing: a strip along the bottom edge, expandable in place. */
export function DatumCaveat({ openings }: DatumCaveatProps) {
  const { text } = useFallbackText('ui')
  const [open, setOpen] = useState(false)

  if (openings.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: UI.gutter,
        zIndex: 21,
        boxSizing: 'border-box',
        width: `min(${UI.docked.noticeWidth}px, calc(100vw - ${2 * UI.gutter}px))`,
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
          <DatumCaveatBody openings={openings} />
        </div>
      )}
    </div>
  )
}
