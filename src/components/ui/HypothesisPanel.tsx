import { useTranslation } from 'react-i18next'
import { HYPOTHESES, type HypothesisId } from '../../data/hypotheses'
import { isPlaceholder } from '../../i18n'

export interface HypothesisPanelProps {
  selected: HypothesisId
  onSelect: (id: HypothesisId) => void
}

/**
 * Phase 10 — the version switcher.
 *
 * Deliberately shows FOR and AGAINST side by side for every reading, and never
 * marks one as correct. Where this model has actually tested a claim (the
 * buttress bearing, the solstice beam), the result is written into the against
 * column as a finding, not as a verdict on the tower.
 */
export function HypothesisPanel({ selected, onSelect }: HypothesisPanelProps) {
  const { t, i18n } = useTranslation('hypotheses')

  /** Azerbaijani prose is still TODO_AZ; fall back rather than show the marker. */
  const text = (key: string): string => {
    const v = t(key, { defaultValue: '' })
    if (typeof v === 'string' && v && !isPlaceholder(v)) return v
    return i18n.getFixedT('ru', 'hypotheses')(key, { defaultValue: '' }) as string
  }

  const list = (key: string): string[] => {
    const v = t(key, { returnObjects: true, defaultValue: [] })
    const arr = Array.isArray(v) ? (v as string[]) : []
    if (arr.length > 0 && !arr.every(isPlaceholder)) return arr.filter((x) => !isPlaceholder(x))
    const ru = i18n.getFixedT('ru', 'hypotheses')(key, { returnObjects: true, defaultValue: [] })
    return Array.isArray(ru) ? (ru as string[]) : []
  }

  const current = HYPOTHESES.find((h) => h.id === selected) ?? HYPOTHESES[0]

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 20,
        width: 330,
        maxHeight: '72vh',
        overflowY: 'auto',
        font: '11px/1.5 system-ui, sans-serif',
        color: '#e8e8e8',
        background: 'rgba(12,14,18,.9)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{text('layerTitle')}</div>
      <div style={{ color: '#93a1b3', fontSize: 10, marginBottom: 8 }}>{text('disclaimer')}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {HYPOTHESES.map((h) => {
          const active = h.id === selected
          return (
            <button
              key={h.id}
              onClick={() => onSelect(h.id)}
              style={{
                font: '10px system-ui, sans-serif',
                color: active ? '#0e1116' : '#dfe6ee',
                background: active ? '#c8d6e5' : 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.18)',
                borderRadius: 5,
                padding: '3px 7px',
                cursor: 'pointer',
              }}
            >
              {text(`${h.id}.title`)}
            </button>
          )
        })}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{text(`${current.id}.title`)}</div>
        <div style={{ color: '#b9c4d0', margin: '3px 0 6px' }}>{text(`${current.id}.summary`)}</div>

        <div style={{ color: '#93a1b3', fontSize: 10 }}>
          {text('proponent')}: {current.proponent} · {text('period')}: {current.period}
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#8fd9a8', fontWeight: 700 }}>{text('for')}</div>
          <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
            {list(`${current.id}.for`).map((s, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#e8a0a0', fontWeight: 700 }}>{text('against')}</div>
          <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
            {list(`${current.id}.against`).map((s, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 8, color: '#93a1b3', fontSize: 10 }}>
          {text('source')}:{' '}
          {current.source.url ? (
            <a
              href={current.source.url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: '#8ab4f8' }}
            >
              {current.source.label}
            </a>
          ) : (
            current.source.label
          )}
        </div>
      </div>
    </div>
  )
}
