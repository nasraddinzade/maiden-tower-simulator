import { useEffect, useState } from 'react'
import { UI, type Orientation } from '../../config/ui'
import { NO_INSETS, compactBarEdge, compactSheetBox, type Viewport } from '../../lib/screenLayout'
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, setLanguage, type Language } from '../../i18n'
import { useFallbackText } from '../../hooks/useFallbackText'
import { SunControlsBody } from './SunControls'
import { HypothesisPanelBody } from './HypothesisPanel'
import { DatumCaveatBody } from './DatumCaveat'
import type { OpeningAperture } from '../../lib/sun'
import type { PassageOpening } from '../../lib/passageOpenings'
import type { HypothesisId } from '../../data/hypotheses'

/**
 * THE SAME INTERFACE, LAID OUT FOR A SCREEN A HAND CAN COVER.
 *
 * What was measured on a 375×812 phone before this existed: the docked panels
 * covered 66.5% of the screen looking at the tower and 70.0% walking in it, the
 * sun panel lay entirely inside the hypothesis panel, 46.4% of that panel could
 * not be reached by a tap at all, and the link to the UNESCO source — in a
 * project whose whole claim is traceability to a source — was underneath the
 * caveat strip and could not be opened. The tower was the thing you could not
 * see. src/lib/screenLayout.ts has that as arithmetic, and the test file pins it.
 *
 * THE PATTERN, and why this one rather than a scaled-down copy of the desktop:
 *
 *   · ONE BAR along the bottom edge, and nothing else by default. Chrome covers
 *     12.4% instead of 66.5%; the building gets the other 87.6% before the
 *     visitor has touched anything.
 *   · THE BOTTOM EDGE because a phone is held in one hand. The docked layout
 *     puts `Walk inside` in the top-left corner and the language switcher in the
 *     top-right, which on an 812 px screen are the two places a thumb cannot go.
 *     The brief names exactly those two controls; both are in the bar.
 *   · ONE PANEL AT A TIME, raised deliberately and dismissed with a 44 px button.
 *     The docked layout shows three at once because on a wide screen they fit
 *     side by side. Here they would stack, and stacking is what produced the
 *     76 393 px² of superimposed text.
 *   · A SHEET IN PORTRAIT, A COLUMN IN LANDSCAPE. Turned sideways the phone has
 *     375 px of height and 812 of width, so a panel must be paid for out of the
 *     width; a bottom sheet of the same 55% would leave the tower a 169 px strip,
 *     which is the failure the brief singles out.
 *
 * The panels themselves are not reimplemented here. Each one is the body of the
 * desktop component — SunControlsBody, HypothesisPanelBody, DatumCaveatBody —
 * with `touch` set, so there is one scrubber, one version switcher and one
 * caveat in the project, and a change to any of them lands in both framings.
 */

type SheetId = 'sun' | 'versions' | 'datum' | 'more'

export interface CompactChromeProps {
  viewport: Viewport
  orientation: Orientation
  firstPerson: boolean
  onToggleFirstPerson: () => void
  /**
   * The physics chunk is on its way. The walk button reports it because the
   * press now starts a download — see components/physics/lazyPhysics.tsx — and
   * a button that looks unpressed for the length of a fetch gets pressed again.
   * It changes the button's TEXT and nothing about its box, so the bar's height
   * and the thumb zone cut from it are unmoved.
   */
  walkLoading?: boolean
  /**
   * Put the orbit camera back where the app opened it. In the bar and not in
   * `More`, because the state it recovers from is one where the visitor cannot
   * see the building: a control you have to go looking for behind a sheet is no
   * use to somebody staring at a black screen. Shown only while orbiting — in
   * walk mode there is no orbit camera to return.
   */
  onResetView: () => void
  date: Date
  live: boolean
  onDate: (d: Date) => void
  onResumeLive: () => void
  apertures: OpeningAperture[]
  hypothesis: HypothesisId
  onHypothesis: (id: HypothesisId) => void
  datumCaveats: PassageOpening[]
  onCredits: () => void
  onEnterXR: () => void
  xrLoading: boolean
  /**
   * Something has been raised from the bar, or put away again.
   *
   * The touch layer needs it: a raised sheet stands where the thumb zone is in
   * portrait, and rather than cut the zone smaller for a state the walk is not
   * in, App suspends the stick while one is up. See <TouchControls
   * coveredByPanel>.
   */
  onPanelOpen?: (open: boolean) => void
}

/* ── the safe area, spelled the same way everywhere ─────────────────────────── */
const SAFE_BOTTOM = 'env(safe-area-inset-bottom)'
const SAFE_LEFT = 'env(safe-area-inset-left)'
const SAFE_RIGHT = 'env(safe-area-inset-right)'
const SAFE_TOP = 'env(safe-area-inset-top)'

/**
 * ═════════════════════════════════════════════════════════════════════════
 * THE BAR STANDS ON THE EDGE THE THUMBS ARE NOT ON, AND THAT CHANGES.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Orbiting, it is the bottom: the phone is held in one hand and the thumb
 * reaches the bottom third, which is the whole reason this layout exists.
 *
 * Walking, it is the top, because the bottom has become the controls. The left
 * thumb is the stick and it lands where the hand holds the phone; the right one
 * drags to look. Measured at 812×375 on the shipped build, this bar put its
 * exit-walk button 588×44 at (12, 325) — 72% of the width along the bottom edge
 * — so a thumb resting there left walk mode without meaning to, and the notice
 * and hint above it took the rest of the band. The rule is compactBarEdge() in
 * lib/screenLayout.ts, and the layout arithmetic and this file read the same
 * one; the zone the stick gets is cut around what this returns.
 *
 * Everything anchored to the bar — the sheet, the strips, the language popover —
 * turns over with it, so the stack keeps its order and only its edge changes.
 */
const barAnchor = (atTop: boolean, px: number) =>
  `calc(${px}px + ${atTop ? SAFE_TOP : SAFE_BOTTOM})`

export function CompactChrome({
  viewport,
  orientation,
  firstPerson,
  onToggleFirstPerson,
  walkLoading = false,
  onResetView,
  date,
  live,
  onDate,
  onResumeLive,
  apertures,
  hypothesis,
  onHypothesis,
  datumCaveats,
  onCredits,
  onEnterXR,
  xrLoading,
  onPanelOpen,
}: CompactChromeProps) {
  const { text } = useFallbackText('ui')
  const [sheet, setSheet] = useState<SheetId | null>(null)
  const [langOpen, setLangOpen] = useState(false)
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  const [hint, setHint] = useState(false)

  const hasCaveat = datumCaveats.length > 0
  const showNotice = hasCaveat && !noticeDismissed

  /*
   * Which edge everything hangs off. Asked of the layout arithmetic rather than
   * written out here as `firstPerson ? … : …`, so that the rectangles the thumb
   * zone is cut around cannot disagree with the pixels a visitor presses.
   */
  const atTop =
    compactBarEdge({
      notice: showNotice,
      hint,
      sheetOpen: sheet !== null,
      walking: firstPerson,
    }) === 'top'
  const barFace = barAnchor(atTop, UI.compact.barHeight)
  const stackFace = barAnchor(atTop, UI.compact.barHeight + UI.compact.stackGap)
  const anchor = atTop ? 'top' : 'bottom'
  const farEdge = atTop ? 'bottom' : 'top'

  /*
   * The touch hint takes itself away. It says what the two halves of the screen
   * do, which is worth knowing exactly once; the docked layout's hint says
   * "WASD · Shift · 1…8" and stays on screen, and on a phone all three of those
   * are keys that do not exist.
   */
  useEffect(() => {
    if (!firstPerson) {
      setHint(false)
      return
    }
    setHint(true)
    const id = window.setTimeout(() => setHint(false), UI.compact.hintDurationMs)
    return () => window.clearTimeout(id)
  }, [firstPerson])

  const raise = (id: SheetId) => {
    setLangOpen(false)
    setSheet((cur) => (cur === id ? null : id))
  }

  /*
   * WHAT IS RAISED, TOLD TO WHOEVER IS DRIVING THE STICK. A sheet stands where
   * the thumb zone is in portrait, and App answers it by suspending the stick
   * rather than by cutting the zone smaller for a state the walk is not in —
   * see <TouchControls coveredByPanel>. The language popover counts: it is the
   * same kind of thing raised from the same bar.
   */
  const panelOpen = sheet !== null || langOpen
  useEffect(() => {
    onPanelOpen?.(panelOpen)
  }, [panelOpen, onPanelOpen])
  // and nothing is raised once this layout is gone, e.g. a tablet given a
  // keyboard mid-session and handed the docked layout with a sheet up
  useEffect(() => () => onPanelOpen?.(false), [onPanelOpen])

  const box = compactSheetBox(viewport, NO_INSETS, atTop ? 'top' : 'bottom')
  const side = orientation === 'landscape'

  const sheetTitle: Record<SheetId, string> = {
    sun: text('panelSun'),
    versions: text('panelVersions'),
    datum: text('datumTitle'),
    more: text('panelMore'),
  }

  return (
    <>
      {/* ── the raised panel ─────────────────────────────────────────────── */}
      {sheet && (
        <div
          style={{
            position: 'fixed',
            zIndex: 29,
            boxSizing: 'border-box',
            [anchor]: barFace,
            ...(side
              ? {
                  [farEdge]: `calc(${UI.gutter}px + ${atTop ? SAFE_BOTTOM : SAFE_TOP})`,
                  right: `calc(${UI.gutter}px + ${SAFE_RIGHT})`,
                  width: box.width,
                }
              : {
                  left: 0,
                  right: 0,
                  height: box.height,
                  maxHeight: `calc(100dvh - ${UI.compact.barHeight + UI.gutter}px - ${SAFE_BOTTOM} - ${SAFE_TOP})`,
                }),
            display: 'flex',
            flexDirection: 'column',
            color: '#e8e8e8',
            background: 'rgba(10,12,16,.94)',
            border: '1px solid rgba(255,255,255,.14)',
            // the corners that meet the bar stay square, whichever edge it is on
            borderRadius: side ? 10 : atTop ? '0 0 10px 10px' : '10px 10px 0 0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: `0 ${UI.gutter}px`,
              minHeight: UI.minTouchTarget,
              borderBottom: '1px solid rgba(255,255,255,.12)',
              flex: '0 0 auto',
            }}
          >
            <span style={{ font: '600 13px system-ui, sans-serif', flex: 1 }}>
              {sheetTitle[sheet]}
            </span>
            <button
              onClick={() => setSheet(null)}
              aria-label={text('close')}
              style={{ ...iconButton, background: 'transparent', border: 'none' }}
            >
              <CloseIcon />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              // the sheet's own bottom edge sits on the bar, so the safe area is
              // already paid for; this is only the reading margin
              padding: `10px ${UI.gutter}px 14px`,
              font: sheet === 'sun' ? '12px/1.5 ui-monospace, monospace' : '12px/1.55 system-ui, sans-serif',
            }}
          >
            {sheet === 'sun' && (
              <SunControlsBody
                date={date}
                onChange={onDate}
                apertures={apertures}
                live={live}
                onResumeLive={onResumeLive}
                touch
              />
            )}
            {sheet === 'versions' && (
              <HypothesisPanelBody selected={hypothesis} onSelect={onHypothesis} touch />
            )}
            {sheet === 'datum' && <DatumCaveatBody openings={datumCaveats} />}
            {sheet === 'more' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={onCredits} style={rowButton}>
                  {text('credits')}
                </button>
                <button onClick={onEnterXR} disabled={xrLoading} style={rowButton}>
                  {xrLoading ? '…' : text('vrMode')}
                </button>
                {hasCaveat && (
                  <button
                    onClick={() => setSheet('datum')}
                    style={{ ...rowButton, color: '#ffd88f', borderColor: 'rgba(255,216,143,.35)' }}
                  >
                    {text('datumTitle')} — {text('datumMore')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── the strips between the panel and the bar ─────────────────────── */}
      <div
        style={{
          position: 'fixed',
          zIndex: 28,
          left: `calc(${UI.gutter}px + ${SAFE_LEFT})`,
          right: `calc(${UI.gutter}px + ${SAFE_RIGHT})`,
          [anchor]: stackFace,
          display: 'flex',
          // the hint stays the strip closest to the bar in both arrangements,
          // which is what noticeStackHeight() and compactChrome() both assume
          flexDirection: atTop ? 'column-reverse' : 'column',
          gap: UI.compact.stackGap,
          pointerEvents: 'none',
        }}
      >
        {showNotice && !sheet && (
          <div
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              height: UI.compact.noticeHeight,
              boxSizing: 'border-box',
              background: 'rgba(12,14,18,.92)',
              border: '1px solid rgba(255,216,143,.35)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => raise('datum')}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: UI.minTouchTarget,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: `0 0 0 10px`,
                background: 'transparent',
                border: 'none',
                color: '#e8e8e8',
                font: '11px/1.3 system-ui, sans-serif',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#ffd88f', flex: '0 0 auto', display: 'flex' }}>
                <WarnIcon />
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <b style={{ color: '#ffd88f' }}>{text('datumTitle')}</b> · {text('datumHeadline')}
              </span>
            </button>
            <button
              onClick={() => setNoticeDismissed(true)}
              aria-label={text('datumLess')}
              style={{ ...iconButton, background: 'transparent', border: 'none', color: '#9fb0c2' }}
            >
              <CloseIcon />
            </button>
          </div>
        )}

        {hint && !sheet && (
          <button
            onClick={() => setHint(false)}
            style={{
              pointerEvents: 'auto',
              height: UI.compact.hintHeight,
              boxSizing: 'border-box',
              padding: `0 12px`,
              background: 'rgba(12,14,18,.9)',
              border: '1px solid rgba(255,255,255,.16)',
              borderRadius: 8,
              color: '#cfe3d6',
              font: '11px/1.3 system-ui, sans-serif',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            {text('touchHint')}
          </button>
        )}
      </div>

      {/* ── the language popover, above its own button ───────────────────── */}
      {langOpen && (
        <div
          style={{
            position: 'fixed',
            zIndex: 31,
            right: `calc(${UI.gutter}px + ${SAFE_RIGHT})`,
            [anchor]: stackFace,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 160,
            background: 'rgba(10,12,16,.96)',
            border: '1px solid rgba(255,255,255,.16)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <LanguageRow key={lang} lang={lang} onPick={() => (setLanguage(lang), setLangOpen(false))} />
          ))}
        </div>
      )}

      {/* ── the bar ──────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: 'fixed',
          zIndex: 30,
          left: 0,
          right: 0,
          [anchor]: 0,
          boxSizing: 'content-box',
          minHeight: UI.compact.barHeight,
          // the inset rides OUTSIDE the 56, so the touchable part never sits
          // under a home indicator, a notch or a rounded corner
          [atTop ? 'paddingTop' : 'paddingBottom']: atTop ? SAFE_TOP : SAFE_BOTTOM,
          paddingLeft: `calc(${UI.gutter}px + ${SAFE_LEFT})`,
          paddingRight: `calc(${UI.gutter}px + ${SAFE_RIGHT})`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(10,12,16,.94)',
          /*
           * DRAWN, NOT LAID OUT. As a border this hairline made the bar 57 px
           * tall against the 56 the layout arithmetic reports, and the thumb
           * zone is cut to within a pixel of the bar's face — a model that is
           * one pixel short of the interface is a stick that can be planted one
           * pixel inside it. A shadow paints outside the box and occupies no
           * height, so barOuterHeight() is now the bar's real height.
           */
          boxShadow: `0 ${atTop ? 1 : -1}px 0 rgba(255,255,255,.14)`,
        }}
      >
        <button
          onClick={() => {
            setSheet(null)
            setLangOpen(false)
            onToggleFirstPerson()
          }}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: UI.minTouchTarget,
            padding: '0 12px',
            font: '600 13px system-ui, sans-serif',
            color: '#eee',
            background: firstPerson ? '#2f6f4a' : 'rgba(255,255,255,.09)',
            border: '1px solid rgba(255,255,255,.25)',
            borderRadius: 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          {walkLoading ? '…' : firstPerson ? text('walkingShort') : text('walkInside')}
        </button>

        {!firstPerson && (
          <BarButton
            active={false}
            label={text('resetView')}
            onClick={onResetView}
            icon={<RecentreIcon />}
          />
        )}
        <BarButton
          active={sheet === 'sun'}
          label={text('panelSun')}
          onClick={() => raise('sun')}
          icon={<SunIcon />}
        />
        <BarButton
          active={sheet === 'versions'}
          label={text('panelVersions')}
          onClick={() => raise('versions')}
          icon={<LayersIcon />}
        />
        <BarButton
          active={langOpen}
          label={text('language')}
          onClick={() => {
            setSheet(null)
            setLangOpen((v) => !v)
          }}
          icon={<LanguageBadge />}
        />
        <BarButton
          active={sheet === 'more'}
          label={text('panelMore')}
          onClick={() => raise('more')}
          icon={<MoreIcon />}
          flag={hasCaveat && noticeDismissed}
        />
      </nav>
    </>
  )
}

/* ── pieces ─────────────────────────────────────────────────────────────────── */

const iconButton: React.CSSProperties = {
  flex: '0 0 auto',
  width: UI.minTouchTarget,
  height: UI.minTouchTarget,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#dfe6ee',
  cursor: 'pointer',
}

const rowButton: React.CSSProperties = {
  minHeight: UI.minTouchTarget,
  padding: '0 14px',
  font: '13px system-ui, sans-serif',
  color: '#dfe6ee',
  background: 'rgba(255,255,255,.07)',
  border: '1px solid rgba(255,255,255,.18)',
  borderRadius: 8,
  textAlign: 'left',
  cursor: 'pointer',
}

function BarButton({
  icon,
  label,
  active,
  onClick,
  flag = false,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  /** A dot on the corner: something is waiting in here that used to be on screen. */
  flag?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: UI.minTouchTarget,
        minHeight: UI.minTouchTarget,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        padding: 0,
        color: active ? '#0e1116' : '#cfd8e3',
        background: active ? '#c8d6e5' : 'transparent',
        border: '1px solid rgba(255,255,255,.16)',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      {icon}
      {flag && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#ffd88f',
          }}
        />
      )}
    </button>
  )
}

function LanguageRow({ lang, onPick }: { lang: Language; onPick: () => void }) {
  const { language } = useFallbackText('ui')
  const active = language === lang
  return (
    <button
      onClick={onPick}
      style={{
        minHeight: UI.minTouchTarget,
        padding: '0 14px',
        font: '13px system-ui, sans-serif',
        color: active ? '#0e1116' : '#dfe6ee',
        background: active ? '#c8d6e5' : 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,.1)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {LANGUAGE_NAMES[lang]}
    </button>
  )
}

/* ── icons: inline SVG, currentColor, 20 px ─────────────────────────────────── */

const svg = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/**
 * The way back: a frame with the building put back in the middle of it. Not a
 * circular-arrow "reload" glyph, which on a page that costs 1.5 MB to reload is
 * the one promise this button must not appear to make.
 */
function RecentreIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M3 7V3.6h3.4M17 7V3.6h-3.4M3 13v3.4h3.4M17 13v3.4h-3.4" />
      <path d="M8 13V9.2l2-2 2 2V13Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg {...svg} aria-hidden>
      <circle cx="10" cy="10" r="3.4" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r = (a * Math.PI) / 180
        return (
          <line
            key={a}
            x1={10 + Math.cos(r) * 5.6}
            y1={10 + Math.sin(r) * 5.6}
            x2={10 + Math.cos(r) * 7.6}
            y2={10 + Math.sin(r) * 7.6}
          />
        )
      })}
    </svg>
  )
}

/** The version switcher: readings stacked one over another, none on top. */
function LayersIcon() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M10 2.6 17.2 6.4 10 10.2 2.8 6.4Z" />
      <path d="M2.8 10.2 10 14 17.2 10.2" />
      <path d="M2.8 13.8 10 17.6 17.2 13.8" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg {...svg} aria-hidden>
      <circle cx="4.6" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg {...svg} aria-hidden>
      <line x1="5.5" y1="5.5" x2="14.5" y2="14.5" />
      <line x1="14.5" y1="5.5" x2="5.5" y2="14.5" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg {...svg} width={16} height={16} aria-hidden>
      <path d="M10 3.2 18 16.4H2Z" />
      <line x1="10" y1="8.2" x2="10" y2="12" />
      <circle cx="10" cy="14.1" r="0.4" fill="currentColor" />
    </svg>
  )
}

/**
 * The current language as its own two letters, which is the one icon that says
 * what it does in every language it offers.
 */
function LanguageBadge() {
  const { language } = useFallbackText('ui')
  return (
    <span style={{ font: '600 12px ui-monospace, monospace', letterSpacing: 0.5 }}>
      {(language || 'az').slice(0, 2).toUpperCase()}
    </span>
  )
}
