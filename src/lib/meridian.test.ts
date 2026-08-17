import { describe, expect, it } from 'vitest'

import { cupolaProfile } from './cupola'
import { annularSlabProfile, facesOutward, meridianSignedArea } from './meridian'
import { pavingProfile } from './roofTerrace'
import { FLOORS, ROOF, TOWER, innerRadiusAt } from '../config/tower'
import { WALL_EMBED } from './bedding'

/**
 * WHICH WAY ROUND THE REVOLVED SURFACES ARE DRAWN.
 *
 * Maths only (CLAUDE.md rule 6): every assertion here is the sign of a shoelace
 * or a length in metres, and none of them renders anything. What makes it worth
 * testing is that the quantity is invisible in the source — a profile written in
 * the wrong order looks perfectly reasonable and produces stone you can see
 * through — and that the model has now got it wrong twice.
 */

/** The order the annular floor slab used to be written in, before 2026-08-17. */
function clockwiseSlabProfile(holeR: number, outerR: number, topY: number, thickness: number) {
  return [
    { r: holeR, y: topY },
    { r: outerR, y: topY },
    { r: outerR, y: topY - thickness },
    { r: holeR, y: topY - thickness },
  ]
}

describe('meridian winding', () => {
  it('reads a counter-clockwise square as positive and its reverse as negative', () => {
    // the anchor for the whole convention: without this the other tests only say
    // that two functions agree with each other
    const ccw = [
      { r: 1, y: 0 },
      { r: 2, y: 0 },
      { r: 2, y: 1 },
      { r: 1, y: 1 },
    ]
    expect(meridianSignedArea(ccw)).toBeGreaterThan(0)
    expect(facesOutward(ccw)).toBe(true)
    expect(facesOutward([...ccw].reverse())).toBe(false)
    // and it is twice the area, so the number means something
    expect(meridianSignedArea(ccw)).toBeCloseTo(2, 12)
  })

  it('winds the annular floor slab outward, so its top face is visible from above', () => {
    // THE FAULT. Storeys 2, 5 and 8 are the pierced ones and the only ones drawn
    // by this profile; every one of them showed its floor TOWER.floorSlab low.
    for (const f of FLOORS.filter((s) => s.hasFloorOpening)) {
      const profile = annularSlabProfile({
        holeRadius: 0.9,
        outerRadius: f.innerRadiusAtLevel + WALL_EMBED,
        topY: f.floorY,
        thickness: TOWER.floorSlab,
      })
      expect(
        facesOutward(profile),
        `storey ${f.floorNumber}: floor slab meridian must wind outward or the ` +
          `walking surface is back-face culled`,
      ).toBe(true)
    }
  })

  it('would have caught the order the slab was written in', () => {
    // the guard on the guard: if this ever passes, the predicate stopped
    // discriminating and the test above is worthless
    const f = FLOORS[1]
    const bad = clockwiseSlabProfile(0.9, f.innerRadiusAtLevel + WALL_EMBED, f.floorY, TOWER.floorSlab)
    expect(facesOutward(bad)).toBe(false)
    expect(meridianSignedArea(bad)).toBeCloseTo(
      -meridianSignedArea(
        annularSlabProfile({
          holeRadius: 0.9,
          outerRadius: f.innerRadiusAtLevel + WALL_EMBED,
          topY: f.floorY,
          thickness: TOWER.floorSlab,
        }),
      ),
      12,
    )
  })

  it('puts the slab top at the storey floor, in metres, not merely the right shape', () => {
    // a profile can wind correctly and still be half a metre out; this is the
    // half of it the winding test cannot see
    for (const f of FLOORS.filter((s) => s.hasFloorOpening)) {
      const outer = f.innerRadiusAtLevel + WALL_EMBED
      const p = annularSlabProfile({
        holeRadius: 0.9,
        outerRadius: outer,
        topY: f.floorY,
        thickness: TOWER.floorSlab,
      })
      const top = p.filter((q) => Math.abs(q.y - f.floorY) < 1e-9)
      const bottom = p.filter((q) => Math.abs(q.y - (f.floorY - TOWER.floorSlab)) < 1e-9)
      expect(top).toHaveLength(2)
      expect(bottom).toHaveLength(3) // two corners plus the repeat that closes it
      expect(Math.max(...p.map((q) => q.r))).toBeCloseTo(outer, 12)
      expect(Math.min(...p.map((q) => q.r))).toBeCloseTo(0.9, 12)
    }
  })

  it('closes the slab profile, because LatheGeometry builds only points.length-1 strips', () => {
    // four points would draw the underside, the outer edge and the floor, and
    // leave the lining of the stairwell hole off entirely
    const p = annularSlabProfile({ holeRadius: 0.9, outerRadius: 3.5, topY: 3.781, thickness: 0.3 })
    expect(p).toHaveLength(5)
    expect(p[p.length - 1]).toEqual(p[0])
    // four strips = four faces: underside, outer edge, walking surface, hole lining
    expect(p.length - 1).toBe(4)
  })

  it('winds the terrace paving outward — the same rule, on the one that was fixed first', () => {
    // roofTerrace.ts argues this in prose and nothing asserted it, which is why
    // the identical fault survived in the floor slabs
    const profile = pavingProfile({
      deckY: ROOF.deckY,
      masonryTopY: ROOF.masonryTopY,
      deckOuterRadius: ROOF.deckOuterRadius,
      wallEmbed: WALL_EMBED,
      channelWidth: ROOF.channelWidth,
      channelDepth: ROOF.channelDepth,
    })
    expect(facesOutward(profile)).toBe(true)
  })

  it('winds the cupola INWARD, because a soffit is looked at from below', () => {
    // the deliberate exception, recorded so that a later pass at "all the lathes
    // point the wrong way" does not turn every ceiling in the tower inside out
    const f = FLOORS[2]
    const profile = cupolaProfile(
      innerRadiusAt(f.cupolaSpringY),
      TOWER.oculusRadius,
      TOWER.cupolaRise,
    )
    expect(facesOutward(profile)).toBe(false)
  })
})
