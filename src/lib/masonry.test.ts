import { describe, expect, it } from 'vitest'
import {
  COURSE_HEIGHT,
  LIMESTONE_INTERIOR,
  LIMESTONE_INTERIOR_MORTAR,
  LIMESTONE_LIGHT,
  LIMESTONE_MORTAR,
  MEASURED_ALBEDO_RATIO,
  courseBand,
  diamondIntensityAt,
  diamondPattern,
  linearLuminance,
} from './masonry'
import { TOWER } from '../config/tower'

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('measured palette', () => {
  it('makes the course lighter than the joint', () => {
    expect(luminance(LIMESTONE_LIGHT)).toBeGreaterThan(luminance(LIMESTONE_MORTAR))
  })

  it('keeps the albedo contrast modest, as flat-light photos show', () => {
    const ratio = luminance(LIMESTONE_LIGHT) / luminance(LIMESTONE_MORTAR)
    // the dramatic black-and-white striping is shadow, not pigment
    expect(ratio).toBeLessThan(1.8)
    expect(ratio).toBeGreaterThan(1.1)
    expect(MEASURED_ALBEDO_RATIO).toBeLessThan(1.8)
  })

  it('makes the interior darker than the outside, per the sources', () => {
    expect(luminance(LIMESTONE_INTERIOR)).toBeLessThan(luminance(LIMESTONE_LIGHT))
  })

  /*
   * The pair the old tests never put together.
   *
   * They checked LIGHT against MORTAR, and INTERIOR against LIGHT, and both
   * passed while the shader was mixing INTERIOR against MORTAR — a pair no
   * assertion ever named. It was inverted: the exterior-sampled joint is
   * lighter than the interior stone, so indoors the bed lines were brighter
   * than the courses they separate.
   *
   * And they compared sRGB codes while the shader mixes in linear light, which
   * is a different number for the same colours (1.39 in codes, 1.95 in linear).
   * A guard is only a guard if it watches the value that is applied.
   */
  it('darkens the joint on BOTH faces of the wall, in the space the shader mixes', () => {
    const outside = linearLuminance(LIMESTONE_LIGHT) / linearLuminance(LIMESTONE_MORTAR)
    const inside = linearLuminance(LIMESTONE_INTERIOR) / linearLuminance(LIMESTONE_INTERIOR_MORTAR)
    expect(outside).toBeGreaterThan(1)
    expect(inside).toBeGreaterThan(1)
    // the interior joint is derived from the measured flat-light ratio, so the
    // coursing contrast it produces is the exterior's, not a second invention
    expect(inside).toBeCloseTo(outside, 1)
  })

  it('states the measured ratio in the space it was measured in', () => {
    // sampled off photographs, so sRGB codes is where 1.39 lives
    const codes = luminance(LIMESTONE_INTERIOR) / luminance(LIMESTONE_INTERIOR_MORTAR)
    expect(codes).toBeCloseTo(MEASURED_ALBEDO_RATIO, 1)
    // and it is a different number once linearised — the reason for the test above
    expect(linearLuminance(LIMESTONE_LIGHT) / linearLuminance(LIMESTONE_MORTAR)).toBeGreaterThan(
      MEASURED_ALBEDO_RATIO + 0.3,
    )
  })

  it('is a limestone hue — warm, desaturated, not grey and not orange', () => {
    for (const hex of [LIMESTONE_LIGHT, LIMESTONE_MORTAR, LIMESTONE_INTERIOR, LIMESTONE_INTERIOR_MORTAR]) {
      const n = parseInt(hex.slice(1), 16)
      const r = (n >> 16) & 255
      const g = (n >> 8) & 255
      const b = n & 255
      expect(r).toBeGreaterThan(b) // warm
      expect(g).toBeGreaterThan(b) // sandy, not pink
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b)
      expect(sat).toBeLessThan(0.55) // limestone, not terracotta
    }
  })
})

describe('courseBand', () => {
  const P = COURSE_HEIGHT

  it('is dark in the joint and full on the course face', () => {
    expect(courseBand(0.001, P)).toBeLessThan(0.2)
    expect(courseBand(P * 0.7, P)).toBe(1)
  })

  it('repeats every course', () => {
    for (let k = 0; k < 5; k++) {
      expect(courseBand(P * 0.7 + k * P, P)).toBeCloseTo(courseBand(P * 0.7, P), 10)
    }
  })

  it('stays within [0,1] everywhere, including below ground', () => {
    for (let y = -5; y < 30; y += 0.017) {
      const v = courseBand(y, P)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('transitions smoothly rather than snapping', () => {
    const a = courseBand(P * 0.05, P)
    const b = courseBand(P * 0.14, P)
    const c = courseBand(P * 0.24, P)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('degrades safely if the period is zeroed in leva', () => {
    expect(courseBand(3, 0)).toBe(1)
  })
})

describe('diamond dressing', () => {
  it('is plain at the base and strongest at the top, per the sources', () => {
    expect(diamondIntensityAt(0, TOWER.height)).toBe(0)
    expect(diamondIntensityAt(TOWER.height, TOWER.height)).toBe(1)
    expect(diamondIntensityAt(TOWER.height / 2, TOWER.height)).toBeLessThan(0.3)
  })

  it('increases monotonically with height', () => {
    let prev = -1
    for (let y = 0; y <= TOWER.height; y += 1) {
      const v = diamondIntensityAt(y, TOWER.height)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('clamps outside the tower', () => {
    expect(diamondIntensityAt(-10, TOWER.height)).toBe(0)
    expect(diamondIntensityAt(1000, TOWER.height)).toBe(1)
  })

  it('produces a bounded lozenge field', () => {
    for (let u = 0; u < 3; u += 0.13) {
      for (let v = 0; v < 3; v += 0.17) {
        const d = diamondPattern(u, v, 4)
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(1)
      }
    }
  })

  it('actually varies — it is a pattern, not a constant', () => {
    const samples = []
    for (let u = 0; u < 1; u += 0.05) samples.push(diamondPattern(u, 0.3, 4))
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.4)
  })
})
