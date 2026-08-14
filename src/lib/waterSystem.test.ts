import { describe, expect, it } from 'vitest'
import {
  buriedRunRadii,
  channelRings,
  clearArcsFor,
  flowPosition,
  pipeOuterDiameter,
  segmentsForRing,
  wellProfile,
} from './waterSystem'
import { FLOORS, TOWER, WATER, WELL } from '../config/tower'

describe('pipe dimensions match the sources', () => {
  it('keeps the documented bores', () => {
    expect(WATER.downpipeDiameter).toBeCloseTo(0.3, 10) // [ref] Ø 30 cm
    expect(WATER.channelDiameter).toBeGreaterThanOrEqual(0.2) // [ref] 20–25 cm
    expect(WATER.channelDiameter).toBeLessThanOrEqual(0.25)
  })

  it('keeps the documented 2.2 cm wall', () => {
    expect(WATER.channelWallThickness).toBeCloseTo(0.022, 10)
  })

  it('keeps the documented 40–45 cm segment', () => {
    expect(WATER.channelSegmentLength).toBeGreaterThanOrEqual(0.4)
    expect(WATER.channelSegmentLength).toBeLessThanOrEqual(0.45)
  })

  it('keeps the documented buried section 22 × 18 cm', () => {
    expect(WATER.buriedPipeWidth).toBeCloseTo(0.22, 10)
    expect(WATER.buriedPipeHeight).toBeCloseTo(0.18, 10)
  })

  it('computes an outer diameter from bore plus two walls', () => {
    expect(pipeOuterDiameter(0.225, 0.022)).toBeCloseTo(0.269, 10)
  })
})

describe('segmentsForRing', () => {
  it('closes a ring with whole segments', () => {
    // circumference 2π·4 ≈ 25.1 m at 0.425 m per segment ≈ 59
    expect(segmentsForRing(4, 0.425)).toBe(59)
  })
  it('needs more segments on a wider ring', () => {
    expect(segmentsForRing(6, 0.425)).toBeGreaterThan(segmentsForRing(3, 0.425))
  })
  it('degrades safely on nonsense input', () => {
    expect(segmentsForRing(0, 0.4)).toBe(0)
    expect(segmentsForRing(4, 0)).toBe(0)
  })
})

describe('collecting channels', () => {
  const rings = channelRings(FLOORS, WATER.channelFloorRange, WATER.channelSegmentLength)

  it('runs on storeys 2 through 7, as [ref] states', () => {
    expect(rings.map((r) => r.floorIndex)).toEqual([1, 2, 3, 4, 5, 6])
    // i.e. human-facing storeys 2..7
    expect(rings[0].floorIndex + 1).toBe(2)
    expect(rings[rings.length - 1].floorIndex + 1).toBe(7)
  })

  it('never appears on the ground storey or the top one', () => {
    expect(rings.some((r) => r.floorIndex === 0)).toBe(false)
    expect(rings.some((r) => r.floorIndex === FLOORS.length - 1)).toBe(false)
  })

  it('widens with height, following the thinning wall', () => {
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].radius).toBeGreaterThan(rings[i - 1].radius)
    }
  })

  it('keeps every ring inside its room', () => {
    for (const r of rings) {
      const floor = FLOORS[r.floorIndex]
      expect(r.radius).toBeLessThan(floor.innerRadiusAtLevel)
      expect(r.radius).toBeGreaterThan(floor.oculusRadius)
    }
  })

  it('needs a plausible number of ceramic segments per storey', () => {
    for (const r of rings) {
      expect(r.segmentCount).toBeGreaterThan(30)
      expect(r.segmentCount).toBeLessThan(90)
    }
  })
})

describe('the well shaft', () => {
  const mouthY = FLOORS[WELL.startsAtFloorIndex].floorY
  const profile = wellProfile(
    mouthY,
    WELL.depth,
    WELL.diameter,
    WELL.mouthDiameter,
    WELL.collarDepth,
  )

  it('opens on the storey the 2026 footage shows', () => {
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

  it('is a funnel: the mouth is wider than the bore', () => {
    expect(profile[0].r).toBeGreaterThan(profile[1].r)
    expect(profile[1].r).toBeCloseTo(WELL.diameter / 2, 10)
  })

  it('descends the documented 21 m', () => {
    expect(profile[0].y - profile[profile.length - 1].y).toBeCloseTo(WELL.depth, 10)
  })

  it('reaches below the tower’s own foundation, as a water shaft must', () => {
    expect(profile[profile.length - 1].y).toBeLessThan(-TOWER.foundationDepth + 8)
  })

  it('never inverts even if the mouth is configured narrower than the bore', () => {
    const p = wellProfile(0, 10, 1.0, 0.4, 1)
    expect(p[0].r).toBeGreaterThanOrEqual(p[1].r)
  })
})

describe('flow animation', () => {
  it('runs from the top to the bottom of a fall', () => {
    expect(flowPosition(10, 0, 0)).toBeCloseTo(10, 10)
    expect(flowPosition(10, 0, 1)).toBeCloseTo(10, 10) // wraps
    expect(flowPosition(10, 0, 0.5)).toBeCloseTo(5, 10)
  })
  it('wraps cleanly for any t, including negatives', () => {
    for (const t of [-3.2, -0.4, 0, 2.7, 11.9]) {
      const y = flowPosition(8, 2, t)
      expect(y).toBeLessThanOrEqual(8 + 1e-9)
      expect(y).toBeGreaterThanOrEqual(2 - 1e-9)
    }
  })
})

describe('buried run', () => {
  it('leaves the tower through the wall', () => {
    const r = buriedRunRadii(FLOORS[0].innerRadiusAtLevel, TOWER.outerRadius)
    expect(r.from).toBeLessThan(FLOORS[0].innerRadiusAtLevel)
    expect(r.to).toBeGreaterThan(TOWER.outerRadius)
  })
})

describe('clearArcsFor', () => {
  const block = (label: string, azimuthDeg: number, halfWidthDeg: number) => ({
    label,
    azimuthDeg,
    halfWidthDeg,
  })

  it('returns the whole circle when nothing is in the way', () => {
    expect(clearArcsFor([], 5)).toEqual([
      { fromDeg: 0, toDeg: 360, widthDeg: 360, middleDeg: 180 },
    ])
  })

  it('widens each block by the run’s own half-angle', () => {
    // one 10°-wide block at north, plus 5° of run either side, blocks 350..10
    const [arc] = clearArcsFor([block('a', 0, 5)], 5)
    expect(arc.fromDeg).toBeCloseTo(10, 9)
    expect(arc.toDeg).toBeCloseTo(350, 9)
    expect(arc.widthDeg).toBeCloseTo(340, 9)
    expect(arc.middleDeg).toBeCloseTo(180, 9)
  })

  it('does not let the 0/360 seam cut an arc in two', () => {
    /*
     * The reason this function merges on a line carrying an extra revolution.
     * Two blocks at 90 and 270 leave two arcs, one of which straddles north —
     * and a naive sweep from 0 reports THREE, splitting the free half at the
     * seam and then reporting the widest as half its true width. The well's
     * bearing is the middle of the widest arc, so that error would have moved
     * it by 45°.
     */
    const arcs = clearArcsFor([block('a', 90, 20), block('b', 270, 20)], 0)
    expect(arcs).toHaveLength(2)
    expect(arcs[0].widthDeg).toBeCloseTo(140, 9)
    expect(arcs[1].widthDeg).toBeCloseTo(140, 9)
    expect(arcs.map((a) => Math.round(a.middleDeg)).sort((x, y) => x - y)).toEqual([0, 180])
  })

  it('merges blocks that overlap and reports the survivors widest first', () => {
    const arcs = clearArcsFor([block('a', 100, 30), block('b', 140, 30), block('c', 310, 5)], 0)
    // 70..170 is one block once merged, 305..315 the other
    expect(arcs).toHaveLength(2)
    expect(arcs[0].widthDeg).toBeCloseTo(135, 9)
    expect(arcs[0].fromDeg).toBeCloseTo(170, 9)
    expect(arcs[0].toDeg).toBeCloseTo(305, 9)
    expect(arcs[1].widthDeg).toBeCloseTo(115, 9)
    expect(arcs[1].fromDeg).toBeCloseTo(315, 9)
    expect(arcs[1].toDeg).toBeCloseTo(70, 9)
  })

  it('reports nothing free when the blocks close the circle', () => {
    expect(clearArcsFor([block('a', 0, 60), block('b', 120, 60), block('c', 240, 60)], 0)).toEqual(
      [],
    )
    // and when a single block is wide enough to do it alone
    expect(clearArcsFor([block('a', 0, 10)], 200)).toEqual([])
  })
})
