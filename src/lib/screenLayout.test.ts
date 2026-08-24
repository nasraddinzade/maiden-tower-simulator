import { describe, expect, it } from 'vitest'
import { UI } from '../config/ui'
import {
  DOCKED_MIN_WIDTH,
  NOTHING_OPEN,
  barOuterHeight,
  clipToViewport,
  compactChrome,
  compactSheetBox,
  compactViewRect,
  coverage,
  dockedChrome,
  layoutModeOf,
  noticeStackHeight,
  orientationOf,
  unionArea,
  type Insets,
  type Rect,
  type Viewport,
} from './screenLayout'

/*
 * THE VIEWPORTS THE BROWSER MEASUREMENT USED, so the numbers here can be put
 * beside the ones taken off a real page rather than invented alongside them.
 */
const PHONE_PORTRAIT: Viewport = { width: 375, height: 812, coarsePointer: true }
const PHONE_LANDSCAPE: Viewport = { width: 812, height: 375, coarsePointer: true }
const TABLET: Viewport = { width: 768, height: 1024, coarsePointer: true }
const DESKTOP: Viewport = { width: 1440, height: 900, coarsePointer: false }

/** iPhone-class insets: the sensor housing above, the home indicator below. */
const PORTRAIT_INSETS: Insets = { top: 59, right: 0, bottom: 34, left: 0 }
/** The same phone turned: the housing moves to one edge, both edges are rounded. */
const LANDSCAPE_INSETS: Insets = { top: 0, right: 44, bottom: 21, left: 44 }

const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('unionArea', () => {
  it('adds disjoint boxes and counts an overlap once', () => {
    expect(unionArea([{ x: 0, y: 0, w: 10, h: 10 }])).toBe(100)
    expect(
      unionArea([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 0, w: 10, h: 10 },
      ]),
    ).toBe(200)
    // two 10×10 squares sharing a 5×10 strip: 150, not 200
    expect(
      unionArea([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 5, y: 0, w: 10, h: 10 },
      ]),
    ).toBe(150)
  })

  it('reports a box swallowed by another as the larger one alone', () => {
    expect(
      unionArea([
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 10, y: 10, w: 20, h: 20 },
      ]),
    ).toBe(10_000)
  })

  it('ignores empty boxes', () => {
    expect(unionArea([])).toBe(0)
    expect(unionArea([{ x: 0, y: 0, w: 0, h: 50 }])).toBe(0)
  })
})

describe('clipToViewport', () => {
  it('trims what hangs off the edge and zeroes what is wholly outside', () => {
    const v: Viewport = { width: 100, height: 100, coarsePointer: false }
    expect(clipToViewport({ x: -20, y: 50, w: 40, h: 80 }, v)).toEqual({ x: 0, y: 50, w: 20, h: 50 })
    expect(clipToViewport({ x: 200, y: 0, w: 40, h: 40 }, v).w).toBe(0)
  })
})

describe('orientationOf', () => {
  it('is a shape, not a sensor: square counts as landscape', () => {
    expect(orientationOf(PHONE_PORTRAIT)).toBe('portrait')
    expect(orientationOf(PHONE_LANDSCAPE)).toBe('landscape')
    expect(orientationOf({ width: 500, height: 500, coarsePointer: true })).toBe('landscape')
  })
})

describe('the docked layout, as it stands', () => {
  /*
   * These four are statements about the SHIPPED interface, computed from the
   * numbers the docked panels lay themselves out with. They are what the rework
   * exists to answer, and they are here so that the answer can be checked rather
   * than believed.
   */
  it('covers two thirds of a phone, which is what the browser measured', () => {
    const c = coverage(dockedChrome(PHONE_PORTRAIT), PHONE_PORTRAIT)
    // measured in a real page: 66.5% in orbit, 70.0% walking
    expect(c).toBeGreaterThan(0.6)
    expect(c).toBeLessThan(0.85)
  })

  it('puts the sun panel entirely INSIDE the hypothesis panel on a phone', () => {
    // the mush of superimposed text on the screenshots, in arithmetic: not an
    // overlap at an edge, containment — every pixel of one lies under the other
    const [sun, hypothesis] = dockedChrome(PHONE_PORTRAIT)
    expect(contains(hypothesis, sun)).toBe(true)
  })

  it('leaves the tower a strip in landscape', () => {
    const c = coverage(dockedChrome(PHONE_LANDSCAPE), PHONE_LANDSCAPE)
    expect(c).toBeGreaterThan(0.5)
  })

  it('does not overlap on a desktop, which is why the desktop layout stays', () => {
    const [sun, hypothesis, notice] = dockedChrome(DESKTOP)
    expect(overlaps(sun, notice)).toBe(false)
    expect(overlaps(notice, hypothesis)).toBe(false)
    expect(overlaps(sun, hypothesis)).toBe(false)
  })
})

describe('DOCKED_MIN_WIDTH', () => {
  it('is where the centred notice stops clearing the wider pinned panel', () => {
    expect(DOCKED_MIN_WIDTH).toBe(
      UI.docked.noticeWidth + 2 * (UI.gutter + Math.max(UI.docked.sunWidth, UI.docked.hypothesisWidth)),
    )
    expect(DOCKED_MIN_WIDTH).toBe(1278)
  })

  it('is exact: nothing overlaps at that width and something does one pixel below', () => {
    const at: Viewport = { width: DOCKED_MIN_WIDTH, height: 900, coarsePointer: false }
    const below: Viewport = { width: DOCKED_MIN_WIDTH - 1, height: 900, coarsePointer: false }

    const [sunA, hypA, noticeA] = dockedChrome(at)
    expect(overlaps(noticeA, hypA)).toBe(false)
    expect(overlaps(noticeA, sunA)).toBe(false)

    const [, hypB, noticeB] = dockedChrome(below)
    expect(overlaps(noticeB, hypB)).toBe(true)
  })
})

describe('layoutModeOf', () => {
  it('gives a cursor the docked layout while its panels still fit', () => {
    expect(layoutModeOf(DESKTOP)).toBe('docked')
    expect(layoutModeOf({ width: 1280, height: 800, coarsePointer: false })).toBe('docked')
    expect(layoutModeOf({ width: DOCKED_MIN_WIDTH, height: 700, coarsePointer: false })).toBe('docked')
  })

  it('gives a narrowed window the compact layout rather than an overlap', () => {
    expect(layoutModeOf({ width: DOCKED_MIN_WIDTH - 1, height: 900, coarsePointer: false })).toBe(
      'compact',
    )
    expect(layoutModeOf({ width: 1024, height: 768, coarsePointer: false })).toBe('compact')
  })

  it('gives a finger the compact layout at any size', () => {
    expect(layoutModeOf(PHONE_PORTRAIT)).toBe('compact')
    expect(layoutModeOf(PHONE_LANDSCAPE)).toBe('compact')
    expect(layoutModeOf(TABLET)).toBe('compact')
    // a tablet wide enough for the docked panels is still driven by a thumb
    expect(layoutModeOf({ width: 1366, height: 1024, coarsePointer: true })).toBe('compact')
  })
})

describe('touch targets', () => {
  it('never asks a finger for less than 44 px', () => {
    // WCAG 2.5.5 AAA and Apple HIG. Asserted of the constants, because the
    // components lay out from them and a component cannot be tested (rule 6).
    expect(UI.minTouchTarget).toBeGreaterThanOrEqual(44)
    expect(UI.compact.barHeight).toBeGreaterThanOrEqual(UI.minTouchTarget)
    expect(UI.compact.noticeHeight).toBeGreaterThanOrEqual(UI.minTouchTarget)
    expect(UI.compact.hintHeight).toBeGreaterThanOrEqual(UI.minTouchTarget)
  })

  it('leaves a bar wide enough for five of them side by side', () => {
    // the narrowest phone in ordinary use is 320 CSS px
    expect(320 - 2 * UI.gutter).toBeGreaterThanOrEqual(5 * UI.minTouchTarget)
  })
})

describe('the compact layout — what a visitor meets first', () => {
  it('shows the tower and almost nothing else', () => {
    const state = { ...NOTHING_OPEN, notice: true }
    const c = coverage(compactChrome(PHONE_PORTRAIT, state), PHONE_PORTRAIT)
    // the bar edge to edge, 56 × 375; the notice inset by a gutter each side,
    // 48 × 351. The 8 px between them is view, not chrome.
    expect(c).toBeCloseTo((56 * 375 + 48 * 351) / (375 * 812), 4)
    expect(c).toBeLessThan(0.2)
  })

  it('is a fifth of what the docked layout covered on the same screen', () => {
    const before = coverage(dockedChrome(PHONE_PORTRAIT), PHONE_PORTRAIT)
    const after = coverage(
      compactChrome(PHONE_PORTRAIT, { ...NOTHING_OPEN, notice: true }),
      PHONE_PORTRAIT,
    )
    expect(after).toBeLessThan(before / 4)
  })

  it('keeps four fifths of the height for the view with nothing raised', () => {
    const view = compactViewRect(PHONE_PORTRAIT, { ...NOTHING_OPEN, notice: true })
    expect(view.w).toBe(375)
    expect(view.h / PHONE_PORTRAIT.height).toBeGreaterThan(0.8)
  })

  it('still keeps a third of the height with a panel raised in portrait', () => {
    const view = compactViewRect(PHONE_PORTRAIT, { ...NOTHING_OPEN, sheetOpen: true })
    expect(view.h / PHONE_PORTRAIT.height).toBeGreaterThan(0.3)
  })

  it('does not squeeze the view to a strip in landscape', () => {
    // the brief's constraint, as a number. The docked layout failed it: panels
    // reached y 363 of 375 and left the building a band across the middle.
    const view = compactViewRect(PHONE_LANDSCAPE, { ...NOTHING_OPEN, notice: true, sheetOpen: true })
    expect(view.w / PHONE_LANDSCAPE.width).toBeGreaterThan(0.5)
    expect(view.h / PHONE_LANDSCAPE.height).toBeGreaterThan(0.8)
  })

  it('raises a side column in landscape and a bottom sheet in portrait', () => {
    expect(compactSheetBox(PHONE_PORTRAIT).placement).toBe('bottom')
    expect(compactSheetBox(PHONE_LANDSCAPE).placement).toBe('side')
    // a bottom sheet of the same fraction would leave 169 px of a 375 px screen
    expect(Math.round(PHONE_LANDSCAPE.height * UI.compact.sheetMaxHeightFraction)).toBe(206)
  })

  it('never lets the sheet grow past the room between the bar and the top', () => {
    const tiny: Viewport = { width: 320, height: 400, coarsePointer: true }
    const box = compactSheetBox(tiny, PORTRAIT_INSETS)
    expect(box.height).toBeLessThanOrEqual(
      tiny.height - PORTRAIT_INSETS.top - barOuterHeight(PORTRAIT_INSETS) - UI.gutter,
    )
    expect(box.height).toBeGreaterThanOrEqual(0)
  })
})

describe('safe areas', () => {
  it('carries the home indicator outside the bar, not inside it', () => {
    // `min-height: 56px; padding-bottom: env(safe-area-inset-bottom)` — the
    // touchable 56 stays 56 and the inset is added under it
    expect(barOuterHeight(PORTRAIT_INSETS)).toBe(UI.compact.barHeight + 34)
    expect(barOuterHeight({ top: 0, right: 0, bottom: 0, left: 0 })).toBe(UI.compact.barHeight)
  })

  it('keeps the view dominant on a phone with a notch and an indicator', () => {
    const view = compactViewRect(
      PHONE_PORTRAIT,
      { ...NOTHING_OPEN, notice: true },
      PORTRAIT_INSETS,
    )
    expect(view.y).toBe(PORTRAIT_INSETS.top)
    expect(view.h / PHONE_PORTRAIT.height).toBeGreaterThan(0.7)
  })

  it('spends the landscape cutouts on the view, not on the panel', () => {
    const usable = PHONE_LANDSCAPE.width - LANDSCAPE_INSETS.left - LANDSCAPE_INSETS.right
    const box = compactSheetBox(PHONE_LANDSCAPE, LANDSCAPE_INSETS)
    expect(box.width).toBeLessThanOrEqual(Math.round(usable * UI.compact.sheetWidthFraction))
    const view = compactViewRect(
      PHONE_LANDSCAPE,
      { ...NOTHING_OPEN, sheetOpen: true },
      LANDSCAPE_INSETS,
    )
    expect(view.w / usable).toBeGreaterThan(0.5)
  })
})

describe('noticeStackHeight', () => {
  it('is nothing when nothing is stacked, and adds a gap per strip', () => {
    expect(noticeStackHeight(NOTHING_OPEN)).toBe(0)
    expect(noticeStackHeight({ ...NOTHING_OPEN, notice: true })).toBe(
      UI.compact.noticeHeight + UI.compact.stackGap,
    )
    expect(noticeStackHeight({ ...NOTHING_OPEN, notice: true, hint: true })).toBe(
      UI.compact.noticeHeight + UI.compact.hintHeight + 2 * UI.compact.stackGap,
    )
  })

  it('is what the chrome and the view rect both settle up with', () => {
    const state = { ...NOTHING_OPEN, notice: true, hint: true }
    const view = compactViewRect(PHONE_PORTRAIT, state)
    expect(view.h).toBe(
      PHONE_PORTRAIT.height - barOuterHeight({ top: 0, right: 0, bottom: 0, left: 0 }) -
        noticeStackHeight(state),
    )
    // and the strips do not overlap each other or the bar
    const rects = compactChrome(PHONE_PORTRAIT, state)
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(overlaps(rects[i], rects[j])).toBe(false)
      }
    }
  })
})
