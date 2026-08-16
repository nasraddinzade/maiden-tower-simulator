/**
 * The bedding rule: a floor structure is buried in the wall, and the wall is
 * what the stair has left of it.
 *
 * These are analytic — the rims are surfaces of revolution and the passage's
 * cheek is a radius per section, so both are numbers and nothing needs to be
 * rendered or raycast (CLAUDE.md rule 6).
 */

import { describe, expect, it } from 'vitest'
import {
  MIN_LATHE_SEGMENTS,
  PASSAGE_JAMB,
  WALL_EMBED,
  beddingDepth,
  chordDip,
  latheSegmentsForBedding,
  passageJambThickness,
  wallTaperSlope,
} from './bedding'
import { FLOORS, ROOF, STAIR, TOWER, WALL_LIFTS, innerRadiusAt } from '../config/tower'
import { PLAYER } from '../config/player'
import { domeHeightAt, effectiveOpeningRadius } from './cupola'
import { PASSAGE_SIDE_CLEARANCE, planAllFlights, stairPassageSections } from './staircase'

/**
 * Every rim in the tower that is bedded into the DRUM'S inner face, exactly as
 * FloorStructures draws it: the annular slabs, the ceiling fill above each
 * crown, and the skirt course under each cupola's springing.
 *
 * The terrace paving is not here. It is bedded into the PARAPET, eleven metres
 * out from anything the stair touches, and it is governed by that junction
 * rather than by this one.
 */
function beddedRims(embed: number): Array<{ what: string; radius: number; y: number }> {
  const rims: Array<{ what: string; radius: number; y: number }> = []
  for (const f of FLOORS) {
    // the slab is a lathe of constant radius spanning floorY − slab .. floorY
    const slab = f.innerRadiusAtLevel + embed
    rims.push({ what: `storey ${f.floorNumber} slab, underside`, radius: slab, y: f.floorY - TOWER.floorSlab })
    rims.push({ what: `storey ${f.floorNumber} slab, top`, radius: slab, y: f.floorY })

    // the skirt runs down and out from the springing — cupolaProfile()'s last point
    const span = innerRadiusAt(f.cupolaSpringY)
    rims.push({ what: `storey ${f.floorNumber} cupola skirt`, radius: span + embed, y: f.cupolaSpringY - embed })

    // the fill is a cone: it widens with the wall between the crown and the slab above
    const hole = effectiveOpeningRadius(f.oculusRadius, span)
    const crownY = f.cupolaSpringY + domeHeightAt(hole, span, TOWER.cupolaRise)
    const topY = FLOORS[f.index + 1] ? FLOORS[f.index + 1].floorY - TOWER.floorSlab : ROOF.masonryTopY
    if (topY - crownY < 0.02) continue
    for (const y of [crownY, topY]) {
      rims.push({ what: `storey ${f.floorNumber} ceiling fill`, radius: innerRadiusAt(y) + embed, y })
    }
  }
  return rims
}

const flights = planAllFlights(STAIR, WALL_LIFTS, innerRadiusAt)
const sections = stairPassageSections(
  flights,
  STAIR.width,
  PLAYER.stairHeadroom,
  innerRadiusAt,
  ROOF.masonryTopY,
  undefined,
  STAIR.doorwayWidth,
).flat()

describe('the jamb the stair leaves', () => {
  it('is thinner than the clearance the flight is held off the wall by', () => {
    /*
     * Three terms, and only the first was ever in anybody's head. The cut takes
     * the side clearance on the inner side as well as the outer, and a passage
     * section is a rectangle whose cheek is frozen at its own tread's radius
     * while the room face leans out for the whole headroom above it.
     */
    const slope = wallTaperSlope(TOWER.wallThicknessBase, TOWER.wallThicknessTop, TOWER.height)
    expect(PASSAGE_JAMB).toBeCloseTo(
      STAIR.wallClearance - PASSAGE_SIDE_CLEARANCE - slope * PLAYER.stairHeadroom,
      12,
    )
    expect(PASSAGE_JAMB).toBeLessThan(STAIR.wallClearance)
    expect(PASSAGE_JAMB).toBeGreaterThan(0)
  })

  it('is what the built passage actually leaves, at the tightest section', () => {
    /*
     * The closed form above is a worst case argued from the taper. This checks it
     * against the tubes the model really builds: for every section, the thinnest
     * stone between the chamber and the passage is the cheek measured against the
     * room face at the section's own CROWN, which is where the face has run
     * furthest out.
     */
    let thinnest = Infinity
    for (const s of sections) {
      thinnest = Math.min(thinnest, s.innerRadius - innerRadiusAt(s.topY))
    }
    expect(thinnest).toBeGreaterThan(0)
    // the closed form may not promise more stone than the model builds
    expect(PASSAGE_JAMB).toBeLessThanOrEqual(thinnest + 1e-9)
  })
})

describe('nothing bedded into the drum stands inside the stair passage', () => {
  it('keeps every slab, skirt and fill rim outside every passage section', () => {
    /*
     * THE FAULT. On the shipped 0.25 m bedding this fails on the ceiling
     * structures of storeys 2 through 8: measured on the built model at azimuth
     * 156 on the climb 2→3, the storey-3 slab stood at r 3.896 against a cheek at
     * 3.767 — a ledge 0.129 m proud, 0.78 m tall, running the length of the
     * flight on the climber's left. A lathe cannot be cut per azimuth, so the rim
     * has to fit the tightest place the passage reaches.
     */
    const rims = beddedRims(WALL_EMBED)
    for (const s of sections) {
      for (const rim of rims) {
        if (rim.y < s.bottomY - 1e-9 || rim.y > s.topY + 1e-9) continue
        expect(
          rim.radius,
          `${rim.what} at y ${rim.y.toFixed(3)} reaches r ${rim.radius.toFixed(3)} into a passage whose cheek is at ${s.innerRadius.toFixed(3)} (az ${s.azimuthDeg.toFixed(1)})`,
        ).toBeLessThan(s.innerRadius)
      }
    }
  })

  it('puts the rim in the middle of that stone, as far from both failures as it can be', () => {
    expect(WALL_EMBED).toBeCloseTo(PASSAGE_JAMB / 2, 12)
    expect(beddingDepth(0.4)).toBeCloseTo(0.2, 12)
  })
})

describe('nothing bedded into the drum emerges into the room', () => {
  it('keeps every rim buried at the coarsest lathe the storeys are drawn with', () => {
    /*
     * The other way this fails, and the reason the bedding cannot simply be made
     * as small as one likes: a lathe is an inscribed polygon, so its facet
     * midpoints sit inside its own radius, and once that dip exceeds the bedding
     * the rim comes out of the wall as a ring of daylight round the room.
     */
    for (const rim of beddedRims(WALL_EMBED)) {
      const sunk = rim.radius * Math.cos(Math.PI / MIN_LATHE_SEGMENTS)
      expect(
        sunk - innerRadiusAt(rim.y),
        `${rim.what}: rim ${rim.radius.toFixed(3)} dips to ${sunk.toFixed(3)} against a wall face at ${innerRadiusAt(rim.y).toFixed(3)}`,
      ).toBeGreaterThan(0)
    }
  })

  it('derives the segment floor from the bedding, not the other way round', () => {
    /*
     * A facet may travel at most half the way from the rim to either face it must
     * not touch — the same halving rule that placed the rim. One coarser and it
     * travels further than that.
     */
    const dip = chordDip(4.5, 0.5)
    expect(Number.isFinite(dip)).toBe(true)
    for (const embed of [0.02, 0.04432, 0.1, 0.25]) {
      const n = latheSegmentsForBedding(embed, 4.5)
      expect(chordDip(4.5, n)).toBeLessThanOrEqual(embed / 2 + 1e-12)
      if (n > 3) expect(chordDip(4.5, n - 1)).toBeGreaterThan(embed / 2)
    }
    expect(MIN_LATHE_SEGMENTS).toBe(latheSegmentsForBedding(WALL_EMBED, 4.5169 + WALL_EMBED))
  })
})

describe('the inputs are the ones the model is built from', () => {
  it('reads the taper off the sourced wall thicknesses', () => {
    const slope = wallTaperSlope(TOWER.wallThicknessBase, TOWER.wallThicknessTop, TOWER.height)
    // 5.0 m at the base to 3.7 m at the top over 29.5 m — [ICOMOS 958]
    expect(slope).toBeCloseTo(1.3 / 29.5, 12)
    // and the same slope the shell itself is drawn with
    expect(innerRadiusAt(10) - innerRadiusAt(0)).toBeCloseTo(slope * 10, 9)
  })

  it('states the jamb as a function, so a wider clearance widens it', () => {
    const base = { sideClearance: 0.06, taperSlope: 0.044068, headroom: 2.3 }
    const narrow = passageJambThickness({ ...base, wallClearance: 0.25 })
    const wide = passageJambThickness({ ...base, wallClearance: 0.4 })
    expect(wide - narrow).toBeCloseTo(0.15, 9)
  })
})
