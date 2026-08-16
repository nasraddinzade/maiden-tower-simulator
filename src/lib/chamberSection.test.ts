import { describe, expect, it } from 'vitest'
import { FLOORS, STAIR, TOWER } from '../config/tower'
import { PLAYER } from '../config/player'
import { WALL_EMBED } from './bedding'

/**
 * THE VERTICAL SECTION OF A CHAMBER, and the four things that must hold in it.
 *
 * All maths, no renderer (rule 6). Every property here states a relation between
 * numbers that already exist in the config; none of them is a re-statement of
 * the config's arithmetic, and every one of them FAILED on the values shipped
 * before 2026-08-16 — the figures are written into each test so the failure is
 * checkable without git.
 *
 * The section, top to bottom, at an upper storey:
 *
 *     floor + 2.500   crown of the cupola      [İçərişəhər] sourced clear height
 *     floor + 2.250   springing at the wall    clear − CUPOLA_RISE
 *     floor + 2.206   the bedded skirt's rim   springing − WALL_EMBED
 *     floor + 1.688   head of the stair doorway  0.75 × springing  [VIDEO]
 *     floor + 1.600   top of the walker
 *     floor + 1.500   his eye
 *     floor + 0       the paving
 *
 * and the whole of the fault repaired on 2026-08-16 is that the fourth line used
 * to sit at 2.100 while the second sat at 1.600 — a hole taller than its wall.
 *
 * IN PLAN, and added 2026-08-17 because the section had no width in it and so
 * could not be checked against a length at all:
 *
 *     0.889   the doorway the footage's proportions give   springing / 2.53
 *     1.100   the doorway STAIR.doorwayWidth cuts          the SOURCED entrance
 *
 * That gap is a conflict and is asserted as one, not smoothed over.
 */

/** m — the doorway head, from the storey's own floor, as stairDoorways cuts it. */
const doorwayHead = STAIR.doorwayHeight
/** m — where an upper storey's vault leaves the wall, above that storey's floor. */
const springing = TOWER.upperSpringingAboveFloor

describe('a hole may not be taller than the wall it is cut in', () => {
  /*
   * THE PROPERTY. The stair doorway is cut in the chamber's own wall, and the
   * wall stops where the vault takes over. So the head of the doorway must stand
   * below the springing at every storey the stair serves — not as a tolerance,
   * as a matter of there being stone there to cut.
   *
   * IT FAILED BY 0.500 m. doorwayHeight was PLAYER.height + 0.35 = 2.100 and the
   * springing was UPPER_CLEAR − 0.9 = 1.600.
   */
  it('puts the doorway head under the springing at every storey the stair serves', () => {
    for (const f of FLOORS) {
      const s = f.ceilingY - TOWER.cupolaRise - f.floorY
      expect(doorwayHead, `storey ${f.floorNumber}`).toBeLessThan(s)
    }
  })

  it('keeps the head below the springing by the measured fraction, not by luck', () => {
    // the fraction is what was measured (up/165, down/135, up/111); the metre
    // value is that fraction times a springing that is only an estimate
    expect(doorwayHead / springing).toBeCloseTo(TOWER.doorwayHeadFraction, 12)
    const [lo, hi] = TOWER.doorwayHeadFractionBracket
    expect(TOWER.doorwayHeadFraction).toBeGreaterThanOrEqual(lo)
    expect(TOWER.doorwayHeadFraction).toBeLessThanOrEqual(hi)
    // and the measurement itself says the head is BELOW the arris, which is the
    // whole content of it: a fraction of one would carry no information at all
    expect(hi).toBeLessThan(1)
  })

  it('leaves the cupola’s bedded skirt clear of the opening too', () => {
    /*
     * The skirt is the springing course, drawn WALL_EMBED below the springing and
     * that far out into the masonry (lib/cupola.ts → cupolaProfile). It is a ring
     * round the whole drum, so it crosses every doorway's bearing; if it hangs
     * lower than the head it hangs across the opening.
     *
     * At the shipped 0.25 m bedding this used to reach 1.350 against a 2.100 m
     * head. It reaches 2.206 now, and the bedding is 0.044 — commit b36496b tied
     * it to the jamb the stair leaves — so the margin is the doorway's, not the
     * bedding's.
     */
    expect(springing - WALL_EMBED).toBeGreaterThan(doorwayHead)
  })
})

describe('the walker fits the building, because the building was measured first', () => {
  /*
   * THE DIRECTION THESE ARE WRITTEN IN MATTERS. They are not "the tower must
   * admit a 1.75 m man" — that is how doorwayHeight came to be PLAYER.height plus
   * a third of a metre. They are "whatever the tower measures, the avatar has to
   * be small enough for it", and they fail loudly when it is not, so the choice
   * is made by a person rather than by a silent clip through stone.
   */
  it('stands the walker upright at the wall of every chamber', () => {
    // FAILED by 0.050 m at storeys 2–8: eye 1.65 against a springing at 1.600.
    for (const f of FLOORS) {
      const s = f.ceilingY - TOWER.cupolaRise - f.floorY
      expect(PLAYER.eyeHeight, `storey ${f.floorNumber} eye`).toBeLessThan(s)
      expect(PLAYER.height, `storey ${f.floorNumber} head`).toBeLessThan(s)
    }
  })

  it('gets him through the doorway, with the margin the config claims', () => {
    // FAILED the moment the doorway stopped being cut to his own size: a 1.75 m
    // capsule does not pass a 1.688 m head, and a capsule cannot stoop.
    expect(PLAYER.height).toBeLessThan(doorwayHead)
    expect(doorwayHead - PLAYER.height).toBeGreaterThanOrEqual(0.05)
  })

  it('keeps the spec’s eye-to-stature ratio while the stature moves', () => {
    // the Phase-6 pair was 1.65/1.75 = 0.9429; the person is smaller, the
    // proportion is not a free parameter
    expect(PLAYER.eyeHeight / PLAYER.height).toBeGreaterThan(0.92)
    expect(PLAYER.eyeHeight / PLAYER.height).toBeLessThan(0.96)
  })
})

describe('the second ratio, which is what brackets the rise now', () => {
  /*
   * DOORWAY_SPRINGING_RATIO is the springing in units of the doorway's clear
   * WIDTH — 2.53, read off up/165 and up/111 the same way the head fraction was.
   * It exists because the head fraction ties two heights together and neither of
   * them to a length, so it could never say whether the section was the right
   * SIZE, only the right shape.
   */
  it('refutes a 0.9 m rise without appealing to anybody’s stature', () => {
    /*
     * THE PROPERTY. At the shipped rise the doorway comes out about as wide as
     * the flight it serves. At the old 0.9 it comes out 0.63 m — narrower than
     * the 0.9 m flight behind it, which is a stair that does not fit through its
     * own door.
     *
     * This matters because the argument it replaces proved too much: "the owner
     * does not duck" forbids every rise there is (see CUPOLA_RISE). This one
     * touches no visitor at all.
     */
    const widthAt = (rise: number) => (2.5 - rise) / TOWER.doorwaySpringingRatio
    expect(widthAt(0.9)).toBeCloseTo(0.632, 3)
    expect(widthAt(0.9)).toBeLessThan(STAIR.width)
    expect(widthAt(TOWER.cupolaRise)).toBeGreaterThan(STAIR.width - 0.02)
    // and across the whole bracket the opening stays a flight wide, either way
    const [lo, hi] = TOWER.cupolaRiseBracket
    expect(widthAt(hi)).toBeGreaterThan(0.8)
    expect(widthAt(lo)).toBeLessThan(1.0)
  })

  it('states the disagreement with the width the model actually cuts', () => {
    /*
     * NOT A TOLERANCE — a conflict, asserted so it cannot go quiet. The
     * proportion gives 0.889 m and STAIR.doorwayWidth is 1.1; run backwards, the
     * cut width demands a springing above the SOURCED crown, which is the half
     * of it that is impossible rather than merely unlikely.
     */
    expect(TOWER.doorwayWidthByProportion).toBeCloseTo(0.889, 3)
    expect(STAIR.doorwayWidth - TOWER.doorwayWidthByProportion).toBeGreaterThan(0.2)
    const springingFromCutWidth = STAIR.doorwayWidth * TOWER.doorwaySpringingRatio
    expect(springingFromCutWidth).toBeGreaterThan(2.5)
    // the ratio is where it was read, and the bracket is the two frames
    const [lo, hi] = TOWER.doorwaySpringingRatioBracket
    expect(TOWER.doorwaySpringingRatio).toBeGreaterThanOrEqual(lo)
    expect(TOWER.doorwaySpringingRatio).toBeLessThanOrEqual(hi)
    // even at the friendliest end of the bracket the cut width does not come back
    expect(springing / lo).toBeLessThan(STAIR.doorwayWidth)
  })

  it('agrees with the head fraction about the doorway it describes', () => {
    /*
     * The two ratios were read off the same two frames and they are not
     * independent, but they are separable: head/springing and springing/width
     * multiply to head/width, which is the doorway's own proportion — 1.90 at
     * up/165 and 2.02 at up/111. If a later reading moves either ratio without
     * moving that product, the two frames were read inconsistently.
     */
    const headOverWidth = TOWER.doorwayHeadFraction * TOWER.doorwaySpringingRatio
    expect(headOverWidth).toBeCloseTo(1.898, 3)
    expect(doorwayHead / TOWER.doorwayWidthByProportion).toBeCloseTo(headOverWidth, 12)
  })
})

describe('the rise is an estimate and it is bracketed', () => {
  it('sits inside the bracket its note argues for', () => {
    // FAILED: 0.9 against a bracket whose top is 0.45.
    const [lo, hi] = TOWER.cupolaRiseBracket
    expect(TOWER.cupolaRise).toBeGreaterThanOrEqual(lo)
    expect(TOWER.cupolaRise).toBeLessThanOrEqual(hi)
  })

  it('is still a cupola and not a slab, at every span in the tower', () => {
    /*
     * The lower end of the bracket is the shape argument: below about 0.025 of
     * the half-span the soffit is flat and [ref]'s "пологий каменный купол" with
     * its ring courses is not what is being drawn. The spans grow with height, so
     * the widest one is the test.
     */
    const widest = Math.max(...FLOORS.map((f) => f.cupolaSpanRadius))
    expect(TOWER.cupolaRise / widest).toBeGreaterThan(0.025)
    // and the upper end is still shallow — a hemisphere it is not
    expect(TOWER.cupolaRise / widest).toBeLessThan(0.2)
  })

  it('is the only free term between a sourced crown and a measured fraction', () => {
    /*
     * The identity the section is built on, asserted so that moving any one of
     * the three shows up here: crown (sourced) − rise (estimate) = springing, and
     * springing × fraction (measured) = the doorway head.
     */
    const upper = FLOORS.find((f) => f.floorNumber === 4)!
    expect(upper.clearHeight).toBeCloseTo(2.5, 12)
    expect(upper.clearHeight - TOWER.cupolaRise).toBeCloseTo(springing, 12)
    expect(springing * TOWER.doorwayHeadFraction).toBeCloseTo(doorwayHead, 12)
  })
})
