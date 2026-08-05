import { describe, expect, it } from 'vitest'
import {
  BUTTRESS,
  ENTRANCE,
  FLOORS,
  LIFTS,
  SITE,
  STAIR,
  TOWER,
  WELL,
  innerRadiusAt,
  wallThicknessAt,
} from './tower'

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
  it('starts at the storey the 2026 footage shows, not the one [ref] records', () => {
    /*
     * STOREY 3, and the change is deliberate. [ref] says the well was FOUND on
     * the 2nd storey and İçərişəhər's own captions say the 3rd, so the documents
     * already disagree. Both of the owner's 2026 walkthroughs — read blind of
     * each other — put the glass-covered head in the THIRD chamber's floor, with
     * the case of ceramic pipe sections beside it, and both call the second
     * chamber's floor unbroken. The model's target is the tower as it stands, so
     * the footage decides where a visitor meets it; the excavation note remains
     * evidence about its history, and the two need not agree.
     */
    expect(WELL.startsAtFloorIndex).toBe(2)
    expect(FLOORS[WELL.startsAtFloorIndex].floorNumber).toBe(3)
  })
})

/**
 * The parapet is now an INPUT, not a residual — but the stack still has to
 * reproduce it. This is the consistency check that would catch the datum, a
 * sourced clear height or the storey count moving underneath it.
 */
describe('the vertical budget stays closed', () => {
  it('reproduces the measured parapet as the stack residual', () => {
    const topOfFloors = FLOORS[FLOORS.length - 1].ceilingY + TOWER.ceilingStructure
    expect(TOWER.topY - topOfFloors).toBeCloseTo(TOWER.parapetHeight, 9)
  })

  it('puts the top of the tower HEIGHT above the ground, not above the floor', () => {
    // the slip this whole correction was about: 29.5 m is height above ground
    expect(TOWER.topY - TOWER.groundY).toBeCloseTo(TOWER.height, 9)
    expect(TOWER.topY).not.toBeCloseTo(TOWER.height, 3)
  })

  it('lands the topmost exterior slit above the storey-8 floor, not in the parapet', () => {
    /*
     * The second conflict the datum slip created. Photographs put the highest
     * slit at about 0.94 of the tower's height; with the old stack that fell
     * inside solid parapet, which no real opening can do.
     */
    const slitY = TOWER.groundY + 0.94 * TOWER.height
    expect(slitY).toBeGreaterThan(FLOORS[FLOORS.length - 1].floorY)
    expect(slitY).toBeLessThan(TOWER.topY - TOWER.parapetHeight)
  })
})

/**
 * Guards on the ONE tread count the corpus yielded.
 *
 * The 8→roof lift was counted frame by frame in both walkthroughs: 16–17 risers,
 * in two flights about a landing. Nothing else in the tower was counted at all —
 * every flight below begins straight and breaks into winders inside the wall, so
 * no single frame holds both its first tread and its last.
 *
 * These do not prove the riser. The rise they divide comes from the model, so
 * they can only show that count and assumption are mutually consistent. What
 * they DO catch is a storey height or a lift-table edit that quietly pushes the
 * implied riser somewhere a stone stair cannot go.
 */
describe('the counted flight stays physically possible', () => {
  const roofLift = LIFTS[LIFTS.length - 1]

  it('is the lift from the top storey to the roof deck', () => {
    expect(roofLift.kind).toBe('wallStair')
    expect(roofLift.fromFloorNumber).toBe(FLOORS.length)
    expect(roofLift.toY).toBeCloseTo(TOWER.topY - TOWER.parapetHeight, 9)
  })

  it('divides into 16–17 risers at a riser a person can climb', () => {
    const rise = roofLift.toY - roofLift.fromY
    for (const treads of [16, 17]) {
      const riser = rise / treads
      expect(riser, `${treads} treads gives ${riser.toFixed(3)} m`).toBeGreaterThan(0.15)
      expect(riser).toBeLessThan(0.25)
    }
  })

  it('brackets the assumed riser, which is the whole of what the count shows', () => {
    const rise = roofLift.toY - roofLift.fromY
    expect(rise / 17).toBeLessThanOrEqual(STAIR.riserTarget)
    expect(rise / 16).toBeGreaterThanOrEqual(STAIR.riserTarget)
  })
})

/**
 * The masonry stair must never again be given the storey the steel spiral serves.
 * The owner's account is explicit — "с первого яруса на второй по середине есть
 * винтовая лестница" — and the model spent a long time with a stone flight there
 * instead, which is a route the building does not have.
 */
describe('the lift table matches the building', () => {
  it('serves storey 1 to 2 by the modern spiral and nothing else', () => {
    const first = LIFTS.filter((l) => l.fromFloorNumber === 1)
    expect(first).toHaveLength(1)
    expect(first[0].kind).toBe('modernSpiral')
    expect(first[0].toFloorNumber).toBe(2)
  })

  it('runs exactly one flight past a storey, and it is 4→6', () => {
    // "с 4 на 5 и 6 всего одна лестница где на 5 выходишь с середины пути"
    const passing = LIFTS.filter((l) => l.opensAtFloorNumbers.length > 0)
    expect(passing).toHaveLength(1)
    expect(passing[0].fromFloorNumber).toBe(4)
    expect(passing[0].toFloorNumber).toBe(6)
    expect(passing[0].opensAtFloorNumbers).toEqual([5])
  })

  it('leaves no storey unreachable', () => {
    const reached = new Set([1])
    for (const l of LIFTS) {
      expect(reached.has(l.fromFloorNumber), `nothing reaches storey ${l.fromFloorNumber}`).toBe(true)
      reached.add(l.toFloorNumber)
      for (const n of l.opensAtFloorNumbers) reached.add(n)
    }
    for (const f of FLOORS) expect(reached.has(f.floorNumber), `storey ${f.floorNumber}`).toBe(true)
  })
})
