import { UI, type LayoutMode, type Orientation } from '../config/ui'

/**
 * WHERE THE INTERFACE PUTS ITSELF, as arithmetic.
 *
 * The measurement this file exists to answer: on a 375×812 phone the shipped
 * docked layout covered 66.5% of the screen in orbit and 70.0% in walk mode, and
 * 34.8% of it was covered TWICE — the sun panel lay entirely inside the
 * hypothesis panel, 76 393 px² of overlap, which is the mush of superimposed
 * text the screenshots showed. A visitor met a wall of panels about a tower they
 * could not see.
 *
 * Nothing in here draws anything. It answers three questions, and the components
 * lay themselves out from the same answers:
 *
 *   · which layout a viewport gets, and WHY — from the panels' own widths, not
 *     from a breakpoint somebody liked the sound of;
 *   · how big the compact sheet is in each orientation;
 *   · what the chrome covers, and what rectangle is left for the tower.
 *
 * The last one is the claim the whole rework is measured against, so it is
 * computed rather than asserted, and screenLayout.test.ts pins it at both ends:
 * the docked layout's 66% on a phone (which is a fact about the code as it
 * stands) and the compact layout's 14% (which is what replaces it).
 *
 * COORDINATES ARE CSS ONES: origin top-left, y downwards, units CSS pixels.
 * Everything here is a plain number; nothing reads the DOM.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The display cutouts and rounded corners, as reported by `env(safe-area-inset-*)`.
 *
 * JavaScript cannot read `env()`, so these arrive here only in tests and in the
 * dev report; the components apply the real values through CSS `calc()`. That is
 * not a gap between model and interface as long as the model's rule is the one
 * the CSS applies, which is why the bar's inset is modelled as padding OUTSIDE
 * its 56 px — exactly what `min-height: 56px; padding-bottom: env(...)` does.
 */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export interface Viewport {
  width: number
  height: number
  /**
   * `(pointer: coarse)` — a finger rather than a cursor. Not a device class:
   * what it decides is whether 20 px affordances are usable, and that is a
   * property of the input, not of the screen.
   */
  coarsePointer: boolean
}

/** What the compact chrome is showing at this instant. */
export interface CompactState {
  /** The datum caveat's one-line notice is present. */
  notice: boolean
  /** The transient touch hint is present (walk mode, first few seconds). */
  hint: boolean
  /** A panel has been raised from the bar. */
  sheetOpen: boolean
}

export const NOTHING_OPEN: CompactState = { notice: false, hint: false, sheetOpen: false }

export function orientationOf(v: Viewport): Orientation {
  return v.width >= v.height ? 'landscape' : 'portrait'
}

/**
 * THE NARROWEST VIEWPORT THE DOCKED LAYOUT ACTUALLY FITS IN.
 *
 * Derived, not chosen. Three panels share the bottom edge: the sun panel pinned
 * left, the hypothesis panel pinned right, the datum notice CENTRED between
 * them. The centring is what binds — a centred box leaves the same clearance on
 * both sides, so the layout survives only while that clearance is wide enough
 * for the WIDER of the two pinned panels, and the sun panel's 66 px of slack
 * buys nothing at all:
 *
 *     (W − noticeWidth) / 2  ≥  gutter + max(sunWidth, hypothesisWidth)
 *     W ≥ 542 + 2 × (12 + 356) = 1278
 *
 * One pixel narrower and the notice overlaps the hypothesis panel — which is
 * what it was doing at 375, and at 1024, and at every width anybody had actually
 * looked at it on. It is a tight threshold and it is the true one; softening it
 * would only mean shipping the overlap to a narrower window and calling it fine.
 */
export const DOCKED_MIN_WIDTH =
  UI.docked.noticeWidth +
  2 * (UI.gutter + Math.max(UI.docked.sunWidth, UI.docked.hypothesisWidth))

/**
 * WHICH LAYOUT A VIEWPORT GETS. Two rules, and both of them are about the
 * interface rather than about a device.
 *
 * 1. A coarse pointer takes the compact layout at any size. The docked panels'
 *    buttons are 20–26 px tall; a thumb cannot hit them, and a 1180 px tablet
 *    with room for the docked layout is still being driven by a thumb.
 * 2. Below DOCKED_MIN_WIDTH the docked panels overlap each other. There is
 *    nothing to decide: at that width the layout is already broken.
 *
 * There is deliberately no height rule. The docked panels are sized as fractions
 * of the height, so a short viewport shrinks them rather than colliding them, and
 * a height threshold would be a preference dressed as a measurement.
 */
export function layoutModeOf(v: Viewport): LayoutMode {
  if (v.coarsePointer) return 'compact'
  return v.width >= DOCKED_MIN_WIDTH ? 'docked' : 'compact'
}

/** Bar height including the safe-area padding carried outside it. */
export function barOuterHeight(insets: Insets): number {
  return UI.compact.barHeight + insets.bottom
}

/**
 * HOW BIG THE RAISED PANEL IS, and it is a different shape in each orientation
 * because the scarce axis changes when the phone is turned.
 *
 * Portrait: a sheet across the bottom, capped at 55% of the height. Landscape: a
 * column against the trailing edge, capped at 45% of the width — because 375 px
 * of height is what a landscape phone has, and a sheet taking 55% of it would
 * leave the building the strip the brief forbids.
 */
export function compactSheetBox(
  v: Viewport,
  insets: Insets = NO_INSETS,
): { placement: 'bottom' | 'side'; width: number; height: number } {
  if (orientationOf(v) === 'landscape') {
    /*
     * Of the USABLE width, not the raw one. A landscape phone puts its cutout
     * and its rounded corners on the left and right edges — 44 px a side is
     * ordinary — and a fraction taken of the raw width would spend the visitor's
     * safe area on the panel and hand back the strip this is here to prevent.
     */
    const usable = v.width - insets.left - insets.right
    const width = Math.min(UI.compact.sheetWidth, Math.round(usable * UI.compact.sheetWidthFraction))
    // top gutter to the top of the bar
    const height = v.height - insets.top - UI.gutter - barOuterHeight(insets)
    return { placement: 'side', width, height: Math.max(0, height) }
  }
  const height = Math.min(
    Math.round(v.height * UI.compact.sheetMaxHeightFraction),
    Math.max(0, v.height - insets.top - barOuterHeight(insets) - UI.gutter),
  )
  return { placement: 'bottom', width: v.width, height }
}

/**
 * A RAISED PANEL PUTS THE STRIPS AWAY, and the model has to know it.
 *
 * The strips live in the gap between the bar and the sheet, and there is no gap
 * once a sheet is raised — in landscape the sheet is beside them rather than
 * over them, and a full-width strip under a side column is a strip lying across
 * the view for no reason. The component hides them; this is the same rule, so
 * that a state the interface cannot be in is not a state the arithmetic answers
 * for.
 */
function strips(state: CompactState): CompactState {
  return state.sheetOpen ? { notice: false, hint: false, sheetOpen: true } : state
}

/**
 * The stack of one-line strips between the bar and the view: the touch hint
 * closest to the bar, the datum notice above it. Height of the whole stack,
 * zero when neither is showing.
 */
export function noticeStackHeight(state: CompactState): number {
  const s = strips(state)
  let h = 0
  if (s.hint) h += UI.compact.hintHeight + UI.compact.stackGap
  if (s.notice) h += UI.compact.noticeHeight + UI.compact.stackGap
  return h
}

/** Every rectangle the compact chrome occupies, in CSS coordinates. */
export function compactChrome(
  v: Viewport,
  raw: CompactState,
  insets: Insets = NO_INSETS,
): Rect[] {
  const state = strips(raw)
  const bar = barOuterHeight(insets)
  const rects: Rect[] = [{ x: 0, y: v.height - bar, w: v.width, h: bar }]

  let y = v.height - bar
  if (state.hint) {
    y -= UI.compact.stackGap + UI.compact.hintHeight
    rects.push({
      x: insets.left + UI.gutter,
      y,
      w: v.width - insets.left - insets.right - 2 * UI.gutter,
      h: UI.compact.hintHeight,
    })
  }
  if (state.notice) {
    y -= UI.compact.stackGap + UI.compact.noticeHeight
    rects.push({
      x: insets.left + UI.gutter,
      y,
      w: v.width - insets.left - insets.right - 2 * UI.gutter,
      h: UI.compact.noticeHeight,
    })
  }

  if (state.sheetOpen) {
    const box = compactSheetBox(v, insets)
    if (box.placement === 'side') {
      rects.push({
        x: v.width - insets.right - UI.gutter - box.width,
        y: v.height - bar - box.height,
        w: box.width,
        h: box.height,
      })
    } else {
      rects.push({ x: 0, y: v.height - bar - box.height, w: box.width, h: box.height })
    }
  }
  return rects
}

/**
 * THE RECTANGLE LEFT FOR THE TOWER — the largest chrome-free box on screen.
 *
 * Computed analytically rather than searched, because the compact layout has
 * exactly one shape: a band along the bottom, and in landscape a column against
 * one side. The claim it is here to support is the brief's — that in landscape
 * the view must not be squeezed to a strip — and a claim of that kind has to be
 * a number somebody can check, not an impression of a screenshot.
 */
export function compactViewRect(
  v: Viewport,
  state: CompactState,
  insets: Insets = NO_INSETS,
): Rect {
  const bar = barOuterHeight(insets)
  const box = state.sheetOpen ? compactSheetBox(v, insets) : null

  if (box && box.placement === 'side') {
    // full height above the bar, minus the column
    return {
      x: insets.left,
      y: insets.top,
      w: v.width - insets.left - insets.right - UI.gutter - box.width,
      h: v.height - insets.top - bar,
    }
  }

  const taken = bar + (box ? box.height : 0) + noticeStackHeight(state)
  return {
    x: insets.left,
    y: insets.top,
    w: v.width - insets.left - insets.right,
    h: Math.max(0, v.height - insets.top - taken),
  }
}

/**
 * THE DOCKED LAYOUT'S RECTANGLES, at their maximum extent.
 *
 * Maximum, not typical, and the distinction matters: the sun panel is content
 * sized and measured 264 px tall in Russian at 375 px wide, while its
 * `max-height: 52vh` lets it reach 422. A layout has to survive the tall case —
 * the language with the longest prose, the hypothesis with the most findings —
 * so that is the case this reports.
 *
 * The two panels are exact: their widths and height fractions are the values the
 * components lay out with, out of config/ui.ts. The four small controls are the
 * width of their longest shipped label, marked as approximations in the config;
 * together they are an eighth of the area of either panel.
 *
 * `walking` adds the keyboard hint that only exists in walk mode, which is the
 * state that measured 70.0%.
 */
export function dockedChrome(v: Viewport, walking = true): Rect[] {
  const d = UI.docked
  const g = UI.gutter
  const sunH = v.height * d.sunMaxHeightFraction
  const hypH = v.height * d.hypothesisMaxHeightFraction
  const noticeW = Math.min(d.noticeWidth, v.width - 2 * g)

  const rects: Rect[] = [
    // SunControls, bottom-left
    { x: g, y: v.height - d.sunBottom - sunH, w: d.sunWidth, h: sunH },
    // HypothesisPanel, bottom-right
    { x: v.width - g - d.hypothesisWidth, y: v.height - g - hypH, w: d.hypothesisWidth, h: hypH },
    // DatumCaveat, bottom-centre
    {
      x: (v.width - noticeW) / 2,
      y: v.height - g - d.noticeHeight,
      w: noticeW,
      h: d.noticeHeight,
    },
    // the walk-mode toggle, top-left
    { x: g, y: g, w: d.walkButtonWidth, h: d.walkButtonHeight },
    // credits + VR, under it
    { x: g, y: 52, w: d.secondaryRowWidth, h: d.secondaryRowHeight },
    // the language switcher, top-right
    {
      x: v.width - g - d.languageSwitcherWidth,
      y: g,
      w: d.languageSwitcherWidth,
      h: d.languageSwitcherHeight,
    },
  ]
  if (walking) {
    rects.push({ x: v.width - g - d.hintWidth, y: g, w: d.hintWidth, h: d.hintHeight })
  }
  return rects
}

/** A rectangle trimmed to the viewport; anything off-screen covers nothing. */
export function clipToViewport(r: Rect, v: Viewport): Rect {
  const x0 = Math.max(0, r.x)
  const y0 = Math.max(0, r.y)
  const x1 = Math.min(v.width, r.x + r.w)
  const y1 = Math.min(v.height, r.y + r.h)
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/**
 * The area covered by a set of rectangles, counting overlaps ONCE.
 *
 * Coordinate compression: the union of axis-aligned boxes is exactly the sum of
 * the cells of the grid their edges induce that lie inside at least one box.
 * Exact, not sampled, and O(n³) on a handful of rectangles.
 *
 * Overlap is the reason this cannot be a sum. The two docked panels overlapped
 * by 76 393 px² on the measured phone; adding their areas would report 108% of a
 * 375×812 screen covered, which is both false and useless.
 */
export function unionArea(rects: Rect[]): number {
  const live = rects.filter((r) => r.w > 0 && r.h > 0)
  if (live.length === 0) return 0
  const xs = [...new Set(live.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b)
  const ys = [...new Set(live.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b)
  let area = 0
  for (let i = 0; i < xs.length - 1; i += 1) {
    const cx = (xs[i] + xs[i + 1]) / 2
    for (let j = 0; j < ys.length - 1; j += 1) {
      const cy = (ys[j] + ys[j + 1]) / 2
      const inside = live.some(
        (r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h,
      )
      if (inside) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
    }
  }
  return area
}

/** The fraction of the viewport a set of rectangles covers, overlaps counted once. */
export function coverage(rects: Rect[], v: Viewport): number {
  const a = v.width * v.height
  if (a <= 0) return 0
  return unionArea(rects.map((r) => clipToViewport(r, v))) / a
}

/**
 * One line for the dev console, so the figure the layout is judged on is
 * reported by the app rather than only asserted in a test. See App.tsx.
 */
export function describeLayout(v: Viewport, state: CompactState, insets: Insets = NO_INSETS): string {
  const mode = layoutModeOf(v)
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  if (mode === 'docked') {
    return `docked at ${v.width}×${v.height} — chrome covers ${pct(coverage(dockedChrome(v), v))}`
  }
  const view = compactViewRect(v, state, insets)
  return (
    `compact/${orientationOf(v)} at ${v.width}×${v.height} — chrome covers ` +
    `${pct(coverage(compactChrome(v, state, insets), v))}, ` +
    `the view keeps ${Math.round(view.w)}×${Math.round(view.h)} ` +
    `(${pct(view.w / v.width)} × ${pct(view.h / v.height)})`
  )
}
