import { describe, expect, it } from 'vitest'
import {
  buriedRunRadii,
  channelRings,
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

  it('opens on the storey [ref] gives', () => {
    expect(WELL.startsAtFloorIndex).toBe(1)
    expect(FLOORS[WELL.startsAtFloorIndex].floorNumber).toBe(2)
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
