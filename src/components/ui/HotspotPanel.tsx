import { useTranslation } from 'react-i18next'
import { HOTSPOTS, type HotspotId } from '../../data/hotspots'
import attributionData from '../../data/attribution.json'
import { isPlaceholder } from '../../i18n'

export interface HotspotPanelProps {
  selected: HotspotId | null
  onClose: () => void
}

interface PhotoCredit {
  hotspotId: string
  file: string
  author: string
  license: string
  licenseUrl: string
  sourcePage: string
}

const CREDITS = (attributionData as { photos: PhotoCredit[] }).photos

/**
 * Phase 12 — the model / photograph comparison.
 *
 * The real photograph sits beside the render of the same feature, with the
 * credit and licence attached to it. The confidence badge is the part that
 * matters: it says whether what you are looking at in the model is measured,
 * inferred or simply assumed.
 */
export function HotspotPanel({ selected, onClose }: HotspotPanelProps) {
  const { t, i18n } = useTranslation('hotspots')

  const text = (key: string): string => {
    const v = t(key, { defaultValue: '' })
    if (typeof v === 'string' && v && !isPlaceholder(v)) return v
    return i18n.getFixedT('ru', 'hotspots')(key, { defaultValue: '' }) as string
  }

  if (!selected) return null
  const hotspot = HOTSPOTS.find((h) => h.id === selected)
  if (!hotspot) return null
  const credit = CREDITS.find((c) => c.hotspotId === selected)

  const confidenceLabel = {
    measured: text('confidenceMeasured'),
    inferred: text('confidenceInferred'),
    assumed: text('confidenceAssumed'),
  }[hotspot.confidence]

  const confidenceColour = {
    measured: '#8fd9a8',
    inferred: '#ffd88f',
    assumed: '#e8a0a0',
  }[hotspot.confidence]

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 40,
        width: 'min(760px, 92vw)',
        maxHeight: '86vh',
        overflowY: 'auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 14,
        font: '12px/1.6 system-ui, sans-serif',
        color: '#e8e8e8',
        background: 'rgba(10,12,16,.96)',
        border: '1px solid rgba(255,255,255,.16)',
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{text(`${hotspot.id}.title`)}</div>
        <button
          onClick={onClose}
          style={{
            font: '11px system-ui, sans-serif',
            color: '#dfe6ee',
            background: 'rgba(255,255,255,.08)',
            border: '1px solid rgba(255,255,255,.18)',
            borderRadius: 5,
            padding: '3px 9px',
            cursor: 'pointer',
          }}
        >
          {text('close')}
        </button>
      </div>

      <div>
        <div style={{ color: '#93a1b3', fontSize: 11, marginBottom: 4 }}>{text('comparePhoto')}</div>
        <img
          src={hotspot.photo}
          alt=""
          style={{ width: '100%', borderRadius: 6, display: 'block', background: '#15181d' }}
        />
        {credit && (
          <div style={{ color: '#93a1b3', fontSize: 10, marginTop: 5 }}>
            {text('photoBy')}: {credit.author || '—'}
            <br />
            {text('license')}:{' '}
            {credit.licenseUrl ? (
              <a href={credit.licenseUrl} target="_blank" rel="noreferrer noopener" style={{ color: '#8ab4f8' }}>
                {credit.license}
              </a>
            ) : (
              credit.license
            )}
          </div>
        )}
      </div>

      <div>
        <div style={{ color: '#93a1b3', fontSize: 11, marginBottom: 4 }}>
          {text('compareModel')} ·{' '}
          <span style={{ color: confidenceColour }}>
            {text('confidence')}: {confidenceLabel}
          </span>
        </div>
        <p style={{ margin: 0 }}>{text(`${hotspot.id}.text`)}</p>
      </div>
    </div>
  )
}

/**
 * Phase-12 credits screen. Required by CC BY / CC BY-SA, which is why it lists
 * every shipped photograph rather than a general acknowledgement.
 */
export function AttributionScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('hotspots')
  const text = (key: string): string => {
    const v = t(key, { defaultValue: '' })
    if (typeof v === 'string' && v && !isPlaceholder(v)) return v
    return i18n.getFixedT('ru', 'hotspots')(key, { defaultValue: '' }) as string
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 45,
        overflowY: 'auto',
        background: 'rgba(8,10,13,.97)',
        color: '#e8e8e8',
        font: '12px/1.7 system-ui, sans-serif',
        padding: '32px 24px',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{text('attributionTitle')}</h2>
          <button
            onClick={onClose}
            style={{
              font: '12px system-ui, sans-serif',
              color: '#dfe6ee',
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.18)',
              borderRadius: 5,
              padding: '4px 11px',
              cursor: 'pointer',
            }}
          >
            {text('close')}
          </button>
        </div>

        <p style={{ color: '#a9b6c4' }}>{text('attributionIntro')}</p>

        <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
          {CREDITS.map((c) => (
            <li
              key={c.file}
              style={{
                display: 'flex',
                gap: 12,
                padding: '9px 0',
                borderTop: '1px solid rgba(255,255,255,.1)',
              }}
            >
              <img
                src={c.file}
                alt=""
                style={{ width: 74, height: 56, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
              />
              <div>
                <div>{c.author || '—'}</div>
                <div style={{ color: '#93a1b3' }}>
                  {c.license}
                  {c.sourcePage && (
                    <>
                      {' · '}
                      <a href={c.sourcePage} target="_blank" rel="noreferrer noopener" style={{ color: '#8ab4f8' }}>
                        source
                      </a>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
