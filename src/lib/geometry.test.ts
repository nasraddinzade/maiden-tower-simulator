import { describe, expect, it } from 'vitest'
import { azimuthToVector, clamp, lerp, taperedWallThickness } from './geometry'

describe('lerp', () => {
  it('returns endpoints at t=0 and t=1', () => {
    expect(lerp(5, 3.7, 0)).toBe(5)
    expect(lerp(5, 3.7, 1)).toBe(3.7)
  })
  it('interpolates the midpoint', () => {
    expect(lerp(5, 3, 0.5)).toBe(4)
  })
})

describe('clamp', () => {
  it('clamps below, within, and above the range', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
    expect(clamp(2, 0, 1)).toBe(1)
  })
})

describe('taperedWallThickness', () => {
  const H = 29.5
  const BASE = 5.0
  const TOP = 3.7

  it('equals the base thickness at the bottom', () => {
    expect(taperedWallThickness(0, H, BASE, TOP)).toBe(BASE)
  })
  it('equals the top thickness at the top', () => {
    expect(taperedWallThickness(H, H, BASE, TOP)).toBeCloseTo(TOP, 10)
  })
  it('decreases monotonically with height', () => {
    let prev = Infinity
    for (let y = 0; y <= H; y += 1) {
      const t = taperedWallThickness(y, H, BASE, TOP)
      expect(t).toBeLessThanOrEqual(prev)
      prev = t
    }
  })
  it('clamps outside [0, H]', () => {
    expect(taperedWallThickness(-10, H, BASE, TOP)).toBe(BASE)
    expect(taperedWallThickness(H + 10, H, BASE, TOP)).toBeCloseTo(TOP, 10)
  })
})

describe('azimuthToVector', () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 10)

  it('maps the four cardinal azimuths (north=-Z, east=+X)', () => {
    const n = azimuthToVector(0)
    near(n.x, 0)
    near(n.z, -1) // north = -Z

    const e = azimuthToVector(90)
    near(e.x, 1) // east = +X
    near(e.z, 0)

    const s = azimuthToVector(180)
    near(s.x, 0)
    near(s.z, 1) // south = +Z

    const w = azimuthToVector(270)
    near(w.x, -1) // west = -X
    near(w.z, 0)
  })

  it('returns unit-length vectors', () => {
    for (const az of [0, 33, 90, 135, 217, 359]) {
      const v = azimuthToVector(az)
      near(Math.hypot(v.x, v.z), 1)
    }
  })
})
