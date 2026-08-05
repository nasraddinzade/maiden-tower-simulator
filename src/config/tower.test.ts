import { describe, expect, it } from 'vitest'
import { BUTTRESS, ENTRANCE, FLOORS, SITE, TOWER, WELL, innerRadiusAt, wallThicknessAt } from './tower'

describe('wall thickness', () => {
  it('is 5.0 m at the GROUND, not at the storey-1 floor [ICOMOS 958]', () => {
    /*
     * The base of the wall is the ground outside, and the entrance is raised, so
     * the storey-1 floor is 2 m up it. This used to assert the 5.0 m at y = 0 and
     * so tapered the whole wall over the wrong interval — which is the same slip
     * that built the tower 31.5 m tall above its own ground line.
     */
    expect(wallThicknessAt(TOWER.groundY)).toBeCloseTo(TOWER.wallThicknessBase, 10)
    expect(wallThicknessAt(0)).toBeLessThan(TOWER.wallThicknessBase)
  })
  it('is 3.7 m at the top [mean of 3.2–4.2]', () => {
    expect(wallThicknessAt(TOWER.topY)).toBeCloseTo(TOWER.wallThicknessTop, 10)
  })
})

describe('inner radius (wall thins from inside → grows with height)', () => {
  it('gives inner Ø ≈ 6.5 m at the base (matches reference "~6.5 m внизу")', () => {
    // at the GROUND, where the sourced 5.0 m wall thickness is measured
    expect(innerRadiusAt(TOWER.groundY) * 2).toBeCloseTo(6.5, 10)
    // and at the storey-1 floor, 2 m up the taper, still within the source's "~"
    expect(innerRadiusAt(0) * 2).toBeGreaterThan(6.5)
    expect(innerRadiusAt(0) * 2).toBeLessThan(6.8)
  })
  it('gives inner Ø within ~8–10 m at the top (matches reference)', () => {
    const topDiameter = innerRadiusAt(TOWER.topY) * 2
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
  it('reconciles the stack to the total height ONLY once the sill is counted', () => {
    /*
     * The identity that matters, and the one that was wrong.
     *
     * [ICOMOS 958]'s 29.5 m is height ABOVE GROUND. The storey stack starts at
     * the floor of storey 1, which the sourced sill puts 2 m above the ground. So
     * the budget is sill + storeys + ceilings + parapet, and the sill term was
     * simply missing. Its absence left 2.6 m over for a parapet measured at about
     * half a metre, and that gap was read as evidence that the storey heights
     * were short. They are not: 2.07 m of it was the omitted 2.00 m sill.
     */
    const clearSum = FLOORS.reduce((s, f) => s + f.clearHeight, 0)
    // read the real value, never a literal: CEILING_STRUCTURE is DERIVED from
    // this very budget now, and a hard-coded 0.8 here would hide it drifting
    const ceilings = FLOORS.length * TOWER.ceilingStructure
    expect(ENTRANCE.sillY + clearSum + ceilings + TOWER.parapetHeight).toBeCloseTo(
      TOWER.height,
      6,
    )
    // and the parapet is the MEASURED input now, not the residual: the horizon
    // ratio 0.556 against a chest-level grip for a 1.85 m owner
    expect(TOWER.parapetHeight).toBeCloseTo(0.556 * 1.85 * 0.73, 6)
    // the ceiling structure that falls out must stay near the 0.8 it replaced —
    // if this ever drifts far, the datum or a sourced clear height has moved
    expect(TOWER.ceilingStructure).toBeGreaterThan(0.6)
    expect(TOWER.ceilingStructure).toBeLessThan(1.0)
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
