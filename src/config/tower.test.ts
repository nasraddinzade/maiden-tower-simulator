import { describe, expect, it } from 'vitest'
import { BUTTRESS, ENTRANCE, FLOORS, SITE, TOWER, WELL, innerRadiusAt, wallThicknessAt } from './tower'

describe('wall thickness', () => {
  it('is 5.0 m at the base [ICOMOS 958]', () => {
    expect(wallThicknessAt(0)).toBe(TOWER.wallThicknessBase)
  })
  it('is 3.7 m at the top [mean of 3.2–4.2]', () => {
    expect(wallThicknessAt(TOWER.height)).toBeCloseTo(TOWER.wallThicknessTop, 10)
  })
})

describe('inner radius (wall thins from inside → grows with height)', () => {
  it('gives inner Ø ≈ 6.5 m at the base (matches reference "~6.5 m внизу")', () => {
    expect(innerRadiusAt(0) * 2).toBeCloseTo(6.5, 10)
  })
  it('gives inner Ø within ~8–10 m at the top (matches reference)', () => {
    const topDiameter = innerRadiusAt(TOWER.height) * 2
    expect(topDiameter).toBeGreaterThanOrEqual(8)
    expect(topDiameter).toBeLessThanOrEqual(10)
  })
  it('increases monotonically with height', () => {
    let prev = -Infinity
    for (let y = 0; y <= TOWER.height; y += 1) {
      const r = innerRadiusAt(y)
      expect(r).toBeGreaterThanOrEqual(prev)
      prev = r
    }
  })
})

describe('floor stack', () => {
  it('has exactly 8 storeys', () => {
    expect(FLOORS).toHaveLength(TOWER.floorCount)
  })
  it('starts storey 1 at y=0', () => {
    expect(FLOORS[0].floorY).toBe(0)
    expect(FLOORS[0].clearHeight).toBe(3.0) // [İçərişəhər] ground storey
  })
  it('has strictly increasing floor levels', () => {
    for (let i = 1; i < FLOORS.length; i++) {
      expect(FLOORS[i].floorY).toBeGreaterThan(FLOORS[i - 1].floorY)
    }
  })
  it('keeps each ceiling above its own floor', () => {
    for (const f of FLOORS) {
      expect(f.ceilingY).toBeGreaterThan(f.floorY)
    }
  })
  it('gives upper storeys the 2.5 m clear height', () => {
    for (let i = 1; i < FLOORS.length; i++) {
      expect(FLOORS[i].clearHeight).toBe(2.5)
    }
  })
  it('fits inside the tower with a positive parapet residual', () => {
    const top = FLOORS[FLOORS.length - 1].ceilingY
    expect(top).toBeLessThan(TOWER.height)
    expect(TOWER.parapetHeight).toBeGreaterThan(0)
  })
  it('reconciles the stack to the total height (3.0 + 7×2.5 + 8×0.8 + parapet = 29.5)', () => {
    const clearSum = FLOORS.reduce((s, f) => s + f.clearHeight, 0)
    const ceilings = FLOORS.length * 0.8 // CEILING_STRUCTURE, per floor
    expect(clearSum + ceilings + TOWER.parapetHeight).toBeCloseTo(TOWER.height, 6)
  })
})

/**
 * Guards on orientation. These encode decisions that were argued out from
 * sources and photographs; they exist so the values cannot drift back silently.
 */
describe('orientation', () => {
  /** Geometric sunrise azimuth at Baku for a given solar declination. */
  const sunriseAzimuth = (declDeg: number) => {
    const phi = (SITE.latitude * Math.PI) / 180
    const dec = (declDeg * Math.PI) / 180
    return (Math.acos(Math.sin(dec) / Math.cos(phi)) * 180) / Math.PI
  }

  it('puts the entrance on the west side [İçərişəhər], not [ref]’s south-east', () => {
    expect(ENTRANCE.azimuthDeg).toBe(270)
    // 135° was the old SE placeholder, disproved by the photographs
    expect(ENTRANCE.azimuthDeg).not.toBe(135)
  })

  it('keeps the entrance far from the winter-solstice sunrise (CLAUDE.md rule 7)', () => {
    const solstice = sunriseAzimuth(-23.44) // ≈121.5° at this latitude
    expect(solstice).toBeGreaterThan(121)
    expect(solstice).toBeLessThan(122)
    const delta = Math.abs(((ENTRANCE.azimuthDeg - solstice + 540) % 360) - 180)
    // never let the entrance be nudged onto the solar bearing the hypothesis predicts
    expect(delta).toBeGreaterThan(45)
  })

  it('keeps the buttress on the measured bearing, not the equinox gloss', () => {
    expect(BUTTRESS.azimuthDeg).toBeCloseTo(106.7, 5)
    // the equinox sunrise is due east; the measured buttress is well off it
    expect(Math.abs(BUTTRESS.azimuthDeg - sunriseAzimuth(0))).toBeGreaterThan(10)
  })

  it('has the equinox sunrise due east, independent of latitude', () => {
    expect(sunriseAzimuth(0)).toBeCloseTo(90, 10)
  })
})

describe('well', () => {
  it('starts at the 2nd storey (0-based index 1) [reference]', () => {
    expect(WELL.startsAtFloorIndex).toBe(1)
    expect(FLOORS[WELL.startsAtFloorIndex].floorNumber).toBe(2)
  })
})
