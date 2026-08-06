import { describe, expect, it } from 'vitest'
import { barOffsets, grilleBars } from './grille'
import { WINDOW_GRILLE } from '../config/tower'
import windowData from '../data/windows.json'
import type { WindowSpec } from './windows'

const { barSide, gap, embed } = WINDOW_GRILLE

describe('grille bar layout', () => {
  it('is symmetric about the opening', () => {
    for (const span of [0.4, 0.9, 1.6, 1.9]) {
      const o = barOffsets(span, barSide, gap)
      if (o.length === 0) continue
      const sum = o.reduce((a, b) => a + b, 0)
      expect(Math.abs(sum)).toBeLessThan(1e-9)
    }
  })

  it('keeps every bar inside the opening with a gap to each jamb', () => {
    for (const span of [0.4, 0.9, 1.6, 1.9]) {
      for (const o of barOffsets(span, barSide, gap)) {
        // the bar's own edge, not its centre line
        expect(Math.abs(o) + barSide / 2).toBeLessThan(span / 2 - gap / 2 + 1e-9)
      }
    }
  })

  it('holds the pitch between neighbours', () => {
    const o = barOffsets(1.9, barSide, gap)
    expect(o.length).toBeGreaterThan(1)
    for (let i = 1; i < o.length; i += 1) expect(o[i] - o[i - 1]).toBeCloseTo(barSide + gap, 9)
  })

  it('returns nothing rather than jamming a bar into a span too narrow for one', () => {
    expect(barOffsets(barSide + gap, barSide, gap)).toEqual([])
    expect(barOffsets(0.05, barSide, gap)).toEqual([])
  })

  it('covers every shipped opening both ways', () => {
    /*
     * The slits are 0.40 m wide and 1.90 m tall, so a grid of this pitch gives
     * two verticals and a dozen horizontals. Asserting BOTH directions are
     * present is the point: a bar count that silently fell to zero one way would
     * read in-game as a set of parallel bars rather than a grille, and nothing
     * else in the build would notice.
     */
    for (const w of windowData.windows as WindowSpec[]) {
      const bars = grilleBars(w.outerWidth, w.outerHeight, barSide, gap, embed)
      expect(bars.some((b) => b.orientation === 'vertical')).toBe(true)
      expect(bars.some((b) => b.orientation === 'horizontal')).toBe(true)
    }
  })

  it('runs each bar past the opening at both ends', () => {
    const bars = grilleBars(0.4, 1.9, barSide, gap, embed)
    for (const b of bars) {
      const span = b.orientation === 'vertical' ? 1.9 : 0.4
      expect(b.length).toBeCloseTo(span + 2 * embed, 9)
    }
  })
})
