import { describe, expect, it } from 'vitest'
import { barOffsets, grilleBars } from './grille'
import { WINDOW_GRILLE } from '../config/tower'
import windowData from '../data/windows.json'
import type { WindowSpec } from './windows'

const { barSide, uprights, rails, embed } = WINDOW_GRILLE

describe('grille bar layout', () => {
  it('is symmetric about the opening', () => {
    for (const span of [0.4, 0.9, 1.6, 1.9]) {
      const o = barOffsets(span, barSide, uprights)
      expect(Math.abs(o.reduce((a, b) => a + b, 0))).toBeLessThan(1e-9)
    }
  })

  it('gives exactly the number of bars asked for', () => {
    /*
     * The point of counting rather than spacing. A 0.12 m gap fitted ONE upright
     * into a 0.40 m slit and eleven rails up its 1.90 m — a ladder on its side.
     * A count cannot do that whatever the opening's size.
     */
    for (const span of [0.4, 0.9, 1.6, 1.9]) {
      expect(barOffsets(span, barSide, uprights).length).toBe(uprights)
      expect(barOffsets(span, barSide, rails).length).toBe(rails)
    }
  })

  it('keeps every bar inside the opening', () => {
    for (const span of [0.4, 0.9, 1.6, 1.9]) {
      for (const o of barOffsets(span, barSide, uprights)) {
        expect(Math.abs(o) + barSide / 2).toBeLessThan(span / 2 + 1e-9)
      }
    }
  })

  it('holds one pitch between neighbours', () => {
    const o = barOffsets(1.9, barSide, uprights)
    for (let i = 1; i < o.length; i += 1) {
      expect(o[i] - o[i - 1]).toBeCloseTo(o[1] - o[0], 9)
    }
  })

  it('returns nothing rather than a bar in a span too narrow for one', () => {
    expect(barOffsets(0.01, barSide, uprights)).toEqual([])
    expect(barOffsets(0.4, barSide, 0)).toEqual([])
  })

  it('reads as a gate on every shipped opening: more uprights than rails', () => {
    /*
     * The proportion is the whole finding. The photographs show a hung gate —
     * eight to eleven uprights with two or three rails — and the model drew the
     * exact opposite. Asserting the ORDER rather than the numbers keeps the test
     * about the character of the thing.
     */
    for (const w of windowData.windows as WindowSpec[]) {
      const bars = grilleBars(w.outerWidth, w.outerHeight, barSide, uprights, rails, embed)
      const v = bars.filter((b) => b.orientation === 'vertical').length
      const h = bars.filter((b) => b.orientation === 'horizontal').length
      expect(v, w.id).toBeGreaterThan(h)
      expect(h, w.id).toBeGreaterThan(1)
    }
  })

  it('runs each bar past the opening at both ends', () => {
    const bars = grilleBars(0.4, 1.9, barSide, uprights, rails, embed)
    for (const b of bars) {
      const span = b.orientation === 'vertical' ? 1.9 : 0.4
      expect(b.length).toBeCloseTo(span + 2 * embed, 9)
    }
  })
})
