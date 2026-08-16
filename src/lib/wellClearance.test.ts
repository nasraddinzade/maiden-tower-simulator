/**
 * THE WELLHEAD AND THE SLOT IN THE WALL, MEASURED APART.
 *
 * [OWNER] 2026-08-17, of the model on screen: «на третьем ярусе вот это отверстие
 * внутри стены стоит на противоположной стороне, а колодец внутри стены между
 * входами на лестницу. А ты взял их поставил вместе.»
 *
 * Until that day WELL.azimuthDeg drove the mouth in the floor AND the chase the
 * downpipe stands in, so no evidence could ever have put them apart — the fault
 * was not a wrong bearing but one bearing where the building has two. This file
 * asserts the two derivations that replace it and then prices them: the wellhead
 * as the bisector of its storey's two stair doorways, the shaft opposite, and the
 * chase measured against every doorway, every reveal and every passage tube in
 * azimuth AND height, the way 4f3e197 established.
 *
 * Everything here is a difference of azimuths, a chord or an arc (CLAUDE.md rule
 * 6). Nothing reads a mesh.
 */
import { describe, expect, it } from 'vitest'
import {
  ENTRANCE,
  FLOORS,
  SHAFT_FROM_WELLHEAD_DEG,
  STAIR,
  TOWER,
  WALL_LIFTS,
  WALL_SHAFT,
  WATER,
  WELL,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import { approachAzimuthDeg, planAllFlights, stairDoorways, stairPassageSections } from './staircase'
import {
  besideDoorwayBearing,
  betweenDoorways,
  chaseBreaches,
  clearArcsFor,
  downpipeChases,
  mouthHalfAngleDeg,
  type PassageRun,
  type PlanBlock,
} from './waterSystem'
import { SHIPPED_CUTS } from './openings.fixture'

const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
const doorways = stairDoorways(
  flights,
  STAIR.width,
  ENTRANCE.height,
  innerRadiusAt,
  (i: number, end: 'foot' | 'head') => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
  TOWER.topY,
  WALL_LIFTS.map((l) => l.opensAtY),
  STAIR.doorwayWidth,
)
const tubes = stairPassageSections(
  flights,
  STAIR.width,
  PLAYER.stairHeadroom,
  innerRadiusAt,
  TOWER.topY,
  undefined,
  STAIR.doorwayWidth,
)

/** The chase now runs on the SHAFT's bearing. That is the whole change. */
const chases = downpipeChases(
  FLOORS,
  WATER.channelFloorRange,
  WELL.startsAtFloorIndex,
  WALL_SHAFT.azimuthDeg,
  WATER.downpipeDiameter,
)

/** Half the arc the downpipe's chase occupies, in degrees, at a height. */
function chaseHalfDeg(y: number) {
  return ((WATER.downpipeDiameter * 2.2) / 2 / innerRadiusAt(y)) * (180 / Math.PI)
}

/**
 * The widest the chase ever is in plan. The drum's face moves outward with
 * height, so the run's half-angle is largest at the lowest storey it occupies;
 * taking that one everywhere errs toward MORE separation, which is the only
 * direction a guard on a derived bearing may err in.
 */
const CHASE_HALF_MAX = Math.max(...chases.map((c) => chaseHalfDeg((c.bottomY + c.topY) / 2)))

const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const STOREY = WELL.startsAtFloorIndex
const FLOOR_Y = FLOORS[STOREY].floorY
const FACE_R = innerRadiusAt(FLOOR_Y)

/**
 * THE TWO WAYS ONTO THE STAIR FROM THE WELLHEAD'S STOREY, planned exactly as
 * stairDoorways() plans them: the head of the flight the walker ARRIVES by and
 * the foot of the flight he LEAVES by. His sentence names both, so both are
 * derived here rather than one being chosen.
 */
const ARRIVAL = WALL_LIFTS.findIndex((l) => Math.abs(l.toY - FLOOR_Y) < 1e-6)
const DEPARTURE = WALL_LIFTS.findIndex((l) => Math.abs(l.fromY - FLOOR_Y) < 1e-6)
const doorwayOf = (flightIndex: number, end: 'foot' | 'head') => {
  const steps = flights[flightIndex]
  const tread = end === 'foot' ? steps[0] : steps[steps.length - 1]
  return {
    azimuthDeg: approachAzimuthDeg(steps, tread, STAIR.width, STAIR.doorwayWidth),
    halfWidthDeg: (STAIR.doorwayWidth / Math.max(0.5, tread.midRadius) / 2) * (180 / Math.PI),
  }
}
const ARRIVAL_DOORWAY = doorwayOf(ARRIVAL, 'head')
const DEPARTURE_DOORWAY = doorwayOf(DEPARTURE, 'foot')
const BETWEEN = betweenDoorways(
  ARRIVAL_DOORWAY.azimuthDeg,
  ARRIVAL_DOORWAY.halfWidthDeg,
  DEPARTURE_DOORWAY.azimuthDeg,
  DEPARTURE_DOORWAY.halfWidthDeg,
  WELL.offsetFromAxis,
  WELL.mouthDiameter,
)

/** Distance from the mouth's RIM to a jamb's inner corner, in metres. */
const rimToJamb = (bearingDeg: number, jambDeg: number) =>
  Math.sqrt(
    FACE_R ** 2 +
      WELL.offsetFromAxis ** 2 -
      2 * FACE_R * WELL.offsetFromAxis * Math.cos(((jambDeg - bearingDeg) * Math.PI) / 180),
  ) -
  WELL.mouthDiameter / 2

/**
 * EVERY VOID IN THE DRUM, FLATTENED ONTO PLAN.
 *
 * A tube's plan footprint is simply its whole azimuth span — there is no height
 * in this list, so the sections in between add nothing to the union its ends do
 * not already give. The entrance is deliberately absent; see the entrance test.
 */
const PLAN_BLOCKS: PlanBlock[] = [
  ...SHIPPED_CUTS.map((w) => ({
    label: `reveal ${w.id}`,
    azimuthDeg: w.azimuthDeg,
    halfWidthDeg: (w.innerWidth / 2 / w.revealEndRadius) * (180 / Math.PI),
  })),
  ...doorways.map((d) => ({
    label: `doorway at ${d.azimuthDeg.toFixed(1)}, y ${d.bottomY.toFixed(2)}`,
    azimuthDeg: d.azimuthDeg,
    halfWidthDeg: d.widthDeg / 2,
  })),
  ...tubes.map((tube, i) => {
    const lo = Math.min(...tube.map((s) => s.azimuthDeg))
    const hi = Math.max(...tube.map((s) => s.azimuthDeg))
    return {
      label: `passage ${WALL_LIFTS[i].fromFloorNumber}→${WALL_LIFTS[i].toFloorNumber}`,
      azimuthDeg: (lo + hi) / 2,
      halfWidthDeg: (hi - lo) / 2,
    }
  }),
]

const PASSAGES: PassageRun[] = tubes.map((sections, i) => ({
  label: `${WALL_LIFTS[i].fromFloorNumber}→${WALL_LIFTS[i].toFloorNumber}`,
  sections,
}))

describe('besideDoorwayBearing', () => {
  /*
   * The property, stated once: the mouth's rim just touches the radial plane of
   * the jamb. Everything else in this block is a corollary of it.
   *
   * KEPT THOUGH THE WELL NO LONGER USES IT. betweenDoorways() is built out of the
   * same clearance and the two ends of its band ARE these tangents, so this is
   * the base case of the placement that replaced it — and the day a storey turns
   * out to have one doorway rather than two, this is the rule that applies.
   */
  const perpendicular = (bearingDeg: number, jambDeg: number, r: number) =>
    r * Math.sin(Math.abs(((bearingDeg - jambDeg + 540) % 360) - 180) * (Math.PI / 180))

  it('sets the mouth tangent to the jamb, at any radius and any width', () => {
    for (const [az, half, r, d] of [
      [190.77, 7.25, 2.4, 1.08],
      [0, 12, 5, 0.5],
      [355, 3, 3.649, 1.08],
      [120, 8.5, 9, 2],
    ] as const) {
      for (const side of [1, -1] as const) {
        const b = besideDoorwayBearing(az, half, r, d, side)
        expect(perpendicular(b, az + side * half, r)).toBeCloseTo(d / 2, 9)
      }
    }
  })

  it('puts the mouth on the side it is asked for, and never inside the doorway', () => {
    const b = besideDoorwayBearing(190.77, 7.25, 2.4, 1.08, -1)
    expect(b).toBeLessThan(190.77 - 7.25)
    expect(besideDoorwayBearing(190.77, 7.25, 2.4, 1.08, 1)).toBeGreaterThan(190.77 + 7.25)
    // the clearance is the mouth's alone: a point mouth sits ON the jamb
    expect(besideDoorwayBearing(190.77, 7.25, 2.4, 0, -1)).toBeCloseTo(183.52, 2)
  })

  it('wraps rather than returning a negative bearing', () => {
    expect(besideDoorwayBearing(5, 7.25, 2.4, 1.08, -1)).toBeCloseTo(360 + 5 - 7.25 - 13.0029, 3)
  })

  it('answers a quarter turn when the mouth swallows the axis', () => {
    /*
     * A mouth wider than twice its own radius from the axis covers every bearing
     * on one side of the tower, so no bearing clears the jamb's plane. asin is
     * clamped rather than left to return NaN: a quarter turn is the furthest the
     * question can be answered at all, and a number that is visibly absurd is
     * more use downstream than one that poisons every sum it touches.
     */
    expect(besideDoorwayBearing(100, 5, 0.4, 1.08, 1)).toBeCloseTo(195, 6)
  })
})

describe('betweenDoorways', () => {
  it('bisects the gap, and takes the shorter of the two gaps', () => {
    /*
     * The property. Two doorways cut the drum into two arcs and only one of them
     * is what anybody means by "between"; the function takes the shorter. Here
     * with 30° doorways at 0 and 90 the short gap runs 15..75 and its middle is
     * 45, while the long one would answer 225.
     */
    const b = betweenDoorways(0, 15, 90, 15, 2.4, 0)
    expect(b.bearingDeg).toBeCloseTo(45, 9)
    expect(b.clearSpanDeg).toBeCloseTo(60, 9)
    // and it does not depend on which doorway is named first
    expect(betweenDoorways(90, 15, 0, 15, 2.4, 0).bearingDeg).toBeCloseTo(45, 9)
  })

  it('is the middle of the band its own ends describe', () => {
    /*
     * The two ends ARE besideDoorwayBearing()'s tangents, one per jamb, so the
     * band and the bisector cannot come from different arithmetic.
     */
    const b = betweenDoorways(10, 8, 150, 6, 3, 1.2)
    expect(b.fromDeg).toBeCloseTo(besideDoorwayBearing(10, 8, 3, 1.2, 1), 9)
    expect(b.toDeg).toBeCloseTo(besideDoorwayBearing(150, 6, 3, 1.2, -1), 9)
    expect((b.fromDeg + b.toDeg) / 2).toBeCloseTo(b.bearingDeg, 9)
    expect(b.freedomDeg).toBeCloseTo((b.toDeg - b.fromDeg) / 2, 9)
  })

  it('spends the mouth’s own width on the freedom and never on the bearing', () => {
    /*
     * THE PROPERTY THAT MADE THIS DERIVATION WORTH HAVING, and the one the old
     * tangent placement did not have. A tangent to ONE jamb carries the mouth's
     * half-angle in its answer, so widening the mouth — or moving it out toward
     * the wall, which is the correction WELL.offsetFromAxis is waiting for —
     * drags the bearing. Between two jambs the same half-angle is taken off both
     * ends and cancels in the middle.
     */
    const wide = betweenDoorways(10, 8, 150, 6, 3, 2.4)
    const narrow = betweenDoorways(10, 8, 150, 6, 3, 0.2)
    expect(wide.bearingDeg).toBeCloseTo(narrow.bearingDeg, 9)
    expect(wide.freedomDeg).toBeLessThan(narrow.freedomDeg)
  })

  it('reports a negative freedom rather than pretending a mouth fits', () => {
    // a 2 m mouth on a 1.2 m radius between doorways 20° apart: it does not fit
    const b = betweenDoorways(0, 5, 20, 5, 1.2, 2)
    expect(b.freedomDeg).toBeLessThan(0)
  })
})

describe('the wellhead stands between the two ways onto the stair', () => {
  it('names the right two doorways, and they are the storey’s only ones', () => {
    /*
     * «Между входами на лестницу» — between the ENTRANCES, plural. Storey 3 has
     * exactly two and this pins them: the head of 2→3 and the foot of 3→4, at the
     * same floor level, a little under a quarter turn apart.
     */
    expect(WALL_LIFTS[ARRIVAL].toFloorNumber).toBe(3)
    expect(WALL_LIFTS[DEPARTURE].fromFloorNumber).toBe(3)
    const atThisFloor = doorways.filter((d) => Math.abs(d.bottomY - FLOOR_Y) < 1e-6)
    expect(atThisFloor).toHaveLength(2)
    expect(atThisFloor.map((d) => Number(d.azimuthDeg.toFixed(3))).sort((a, b) => a - b)).toEqual([
      102.413, 206.58,
    ])
  })

  it('puts the mouth at the bisector of their facing jambs', () => {
    /*
     * THE DERIVATION, AND IT IS NOT A CHOICE. The jambs that face each other
     * across the gap stand at 109.658 and 199.335 — 89.677° of wall between them
     * — and the mouth goes in the middle: 154.496 → 154, a whole degree because
     * nothing has measured this bearing and a decimal would imply something had.
     *
     * BOTH JAMBS MOVED ON THE EVENING OF 2026-08-17 AND THE BISECTOR DID NOT, to
     * the last digit. Each doorway went to the middle of its own landing — 3.952°
     * further from its end tread, the «прямо» repair in approachAzimuthDeg() —
     * and the two ends of storey 3 are mirror images, so the pair opened by
     * 7.904° about a bearing that did not move. The gap is wider and the wellhead
     * is where it was, which is the strongest thing that could be said for a
     * derivation of this kind.
     *
     * THE BISECTOR IS OF THE JAMBS, NOT OF THE CENTRES, and here the two agree to
     * the last digit because both doorways are STAIR.doorwayWidth at the same
     * storey radius. Asserted together so that the day they differ — a storey
     * with one wide opening and one narrow — the file says which one is the rule.
     */
    const jambA = ARRIVAL_DOORWAY.azimuthDeg + ARRIVAL_DOORWAY.halfWidthDeg
    const jambD = DEPARTURE_DOORWAY.azimuthDeg - DEPARTURE_DOORWAY.halfWidthDeg
    expect(jambA).toBeCloseTo(109.658, 3)
    expect(jambD).toBeCloseTo(199.335, 3)
    expect(jambD - jambA).toBeCloseTo(89.677, 3)

    expect(BETWEEN.bearingDeg).toBeCloseTo(154.496, 3)
    expect(BETWEEN.bearingDeg).toBeCloseTo((jambA + jambD) / 2, 9)
    expect(BETWEEN.bearingDeg).toBeCloseTo(
      (ARRIVAL_DOORWAY.azimuthDeg + DEPARTURE_DOORWAY.azimuthDeg) / 2,
      9,
    )
    expect(Number.isInteger(WELL.azimuthDeg)).toBe(true)
    expect(sep(WELL.azimuthDeg, BETWEEN.bearingDeg)).toBeLessThan(1)
  })

  it('leaves ±31.84° of freedom, which is 1.33 m along the floor', () => {
    /*
     * HOW MUCH THE SENTENCE ACTUALLY FIXES. The mouth is 1.08 m across on a
     * 2.4 m radius, so it takes 13.003° of arc and can stand anywhere from
     * 122.661 to 186.332 before its rim touches a jamb. That is the whole claim:
     * the middle of a band 1.33 m wide, not a degree.
     */
    expect(mouthHalfAngleDeg(WELL.offsetFromAxis, WELL.mouthDiameter)).toBeCloseTo(13.0029, 4)
    expect(BETWEEN.fromDeg).toBeCloseTo(122.661, 3)
    expect(BETWEEN.toDeg).toBeCloseTo(186.332, 3)
    expect(BETWEEN.freedomDeg).toBeCloseTo(31.8354, 4)
    expect((BETWEEN.freedomDeg * Math.PI * WELL.offsetFromAxis) / 180).toBeCloseTo(1.3335, 3)
  })

  it('does not move when the mouth is pushed out to the wall, only the freedom does', () => {
    /*
     * WHY THIS DERIVATION SURVIVES THE NEXT MEASUREMENT. WELL.offsetFromAxis is a
     * [PLACEHOLDER] and up/081 says it is too small — the mouth is in the floor of
     * a recess, so nearer 3.1–3.2 than 2.4. Under the old tangent placement that
     * correction moved the bearing 8°, from 182 to 174. Here it moves nothing.
     */
    const out = betweenDoorways(
      ARRIVAL_DOORWAY.azimuthDeg,
      ARRIVAL_DOORWAY.halfWidthDeg,
      DEPARTURE_DOORWAY.azimuthDeg,
      DEPARTURE_DOORWAY.halfWidthDeg,
      3.2,
      WELL.mouthDiameter,
    )
    expect(out.bearingDeg).toBeCloseTo(BETWEEN.bearingDeg, 9)
    expect(out.freedomDeg).toBeCloseTo(35.123, 3)
  })

  it('contains the bearing his first sentence gives, at the very edge of the band', () => {
    /*
     * THE FIRST SENTENCE IS NOT OVERTURNED, IT IS CENTRED. «Колодец должен стоять
     * рядом с проходом» (2026-08-16) puts the mouth tangent to the departure
     * doorway's jamb — which is this band's clockwise END, to nine decimals.
     * «Между входами» (2026-08-17) names the other doorway as well and so picks
     * out the middle. The two sentences do not disagree; the second is the more
     * constrained reading of the same wall.
     *
     * THAT TANGENT IS A DERIVATION AND NOT A NUMBER, which is why it reads 186.33
     * here and 182.38 in the morning: the departure doorway moved to the middle
     * of its landing that evening and the tangent to its jamb went with it. 182
     * was never a measurement of anything — it was this construction run against
     * the doorway of the day — so it follows the doorway rather than standing
     * against it, exactly as 171 did before it.
     */
    const tangent = besideDoorwayBearing(
      DEPARTURE_DOORWAY.azimuthDeg,
      DEPARTURE_DOORWAY.halfWidthDeg,
      WELL.offsetFromAxis,
      WELL.mouthDiameter,
      -1,
    )
    expect(tangent).toBeCloseTo(186.332, 3)
    expect(BETWEEN.toDeg).toBeCloseTo(tangent, 9)
    expect(sep(BETWEEN.bearingDeg, tangent)).toBeCloseTo(BETWEEN.freedomDeg, 9)
  })

  it('stands 2.02 m and 2.06 m from the two jambs, where the tangent stands 0.89 m from one', () => {
    /*
     * THE TANGENCY IN METRES, which is the only form of it anyone can picture,
     * measured to each jamb's INNER CORNER — the nearest stone, at the room face
     * — rather than to the construction plane.
     *
     * AND IT IS WHAT THE MOVE COSTS. up/080 shows the wellhead's recess and the
     * stair's mouth as two openings in one wall with ONE pier between them, and
     * on the tangent placement that pier comes out 0.878 m, near enough the frame
     * to read as support. Centred it is 2.061 m, a wider pier than the frame
     * looks. That is recorded and not argued away — it was never a measurement, a
     * pier read off a handheld wide-angle frame with no scale is not one in this
     * project, and a sentence naming BOTH doorways outranks a single frame naming
     * one.
     *
     * The pier figure is stated against the TANGENT rather than against 182,
     * because the tangent is the construction and 182 was only where it happened
     * to fall before the doorway moved on the evening of 2026-08-17. 0.887 then
     * and 0.878 now: the pier is measured off the jamb, so it went with it.
     */
    const jambA = ARRIVAL_DOORWAY.azimuthDeg + ARRIVAL_DOORWAY.halfWidthDeg
    const jambD = DEPARTURE_DOORWAY.azimuthDeg - DEPARTURE_DOORWAY.halfWidthDeg
    expect(rimToJamb(WELL.azimuthDeg, jambA)).toBeCloseTo(2.019, 3)
    expect(rimToJamb(WELL.azimuthDeg, jambD)).toBeCloseTo(2.061, 3)
    expect(rimToJamb(BETWEEN.toDeg, jambD)).toBeCloseTo(0.878, 3)
    // very nearly equal, which is what "between" buys and what 182 did not have
    expect(Math.abs(rimToJamb(WELL.azimuthDeg, jambA) - rimToJamb(WELL.azimuthDeg, jambD))).toBeLessThan(
      0.05,
    )
  })

  it('is under the flight’s own arc now, and kept out of the floor opening by radius alone', () => {
    /*
     * A HAZARD THE MOVE CREATED AND ARITHMETIC DISPOSES OF. At 182 the wellhead
     * sat near the end of the stair's sweep; at 154 it is squarely inside it —
     * flight 3→4's passage runs 95.9° to 216.5°. What stops the mouth opening
     * into the stairwell cut in the floor slab is not bearing but RADIUS: that
     * opening starts one wall clearance outside the room face, at 3.899 m, and
     * the mouth's rim reaches 2.940 m. Nearly a metre of slab between them.
     *
     * It is asserted because it is the kind of clearance that stops being one
     * when somebody corrects offsetFromAxis: at the 3.2 m up/081 suggests, the
     * rim reaches 3.740 and the margin is 0.159 m. Still clear, and no longer
     * comfortably.
     */
    const tube = tubes[DEPARTURE]
    const lo = Math.min(...tube.map((s) => s.azimuthDeg))
    const hi = Math.max(...tube.map((s) => s.azimuthDeg))
    expect(WELL.azimuthDeg).toBeGreaterThan(lo)
    expect(WELL.azimuthDeg).toBeLessThan(hi)

    const openingInner = FACE_R + STAIR.wallClearance
    expect(openingInner).toBeCloseTo(3.899, 3)
    expect(WELL.offsetFromAxis + WELL.mouthDiameter / 2).toBeCloseTo(2.94, 3)
    expect(openingInner - (WELL.offsetFromAxis + WELL.mouthDiameter / 2)).toBeGreaterThan(0.9)
    expect(openingInner - (3.2 + WELL.mouthDiameter / 2)).toBeCloseTo(0.159, 3)
  })
})

describe('the shaft stands opposite, and the chase costs nothing there', () => {
  it('is the wellhead’s bearing plus half a turn', () => {
    /*
     * «На противоположной стороне». The whole derivation, and it is relational in
     * the same way the wellhead's is, so it follows the stair wherever the stair
     * goes. SHAFT_FROM_WELLHEAD_DEG is a named 180 for the same reason
     * STAIR_FROM_BUTTRESS_DEG is a named 90: it is the entire content of a
     * sentence somebody said about the building, and the day the sentence is
     * refined there is exactly one number to change.
     */
    expect(SHAFT_FROM_WELLHEAD_DEG).toBe(180)
    expect(WALL_SHAFT.azimuthDeg).toBe(
      ((WELL.azimuthDeg + SHAFT_FROM_WELLHEAD_DEG) % 360 + 360) % 360,
    )
    expect(sep(WALL_SHAFT.azimuthDeg, WELL.azimuthDeg)).toBeCloseTo(180, 9)
    expect(Number.isInteger(WALL_SHAFT.azimuthDeg)).toBe(true)
  })

  it('breaks into no stair passage at all, where the shared bearing broke four', () => {
    /*
     * THE BILL THE SPLIT PAYS, IN FULL. While one number did both jobs the chase
     * stood in the same wall the stair is in and opened the jamb between room and
     * passage on four of the five storeys it runs up — 36.6–39.6° into each,
     * biting 0.34 m past a jamb 0.25 m thick, and on storey 3 opening onto the
     * treads of flight 3→4 at floor level with no threshold between room and
     * stair at all. Two agents reported that and left it standing.
     *
     * At 334 chaseBreaches() returns EMPTY. This asserts the empty list rather
     * than a margin, because the empty list is the finding.
     *
     * BOTH DIMENSIONS, of the same pair: only the sections of a passage that share
     * a length of chase's HEIGHT are compared with it in bearing. That is the
     * lesson of downpipeChases() and clearArcsFor() applied together — see
     * chaseBreaches().
     */
    expect(chases.map((c) => c.floorIndex)).toEqual([2, 3, 4, 5, 6])
    expect(chaseBreaches(chases, PASSAGES, innerRadiusAt)).toEqual([])

    // and it would not be empty on the old shared bearing — the fault is real
    const shared = downpipeChases(
      FLOORS,
      WATER.channelFloorRange,
      WELL.startsAtFloorIndex,
      182,
      WATER.downpipeDiameter,
    )
    expect(chaseBreaches(shared, PASSAGES, innerRadiusAt)).toHaveLength(4)
  })

  it('clears every doorway, reveal and passage by 58° or more, in plan', () => {
    /*
     * THE INVENTORY 4f3e197 ASKED FOR, run over all three kinds of void. Plan
     * margins, with the chase's own half-width counted in on every one, and the
     * height flag carried alongside so that no clearance here is a vertical
     * accident: the four nearest things to the chase all share its height, and it
     * still misses them by nearly sixty degrees.
     */
    const doorwayGaps = doorways.map((d) => ({
      label: `doorway at az ${d.azimuthDeg.toFixed(1)}, y ${d.bottomY.toFixed(2)}`,
      gap:
        sep(WALL_SHAFT.azimuthDeg, d.azimuthDeg) -
        (chaseHalfDeg((d.bottomY + d.topY) / 2) + d.widthDeg / 2),
    }))
    expect(doorwayGaps.filter((g) => g.gap <= 0)).toEqual([])
    const nearestDoorway = doorwayGaps.reduce((a, b) => (b.gap < a.gap ? b : a))
    expect(nearestDoorway.label).toContain('az 46.8')
    expect(nearestDoorway.gap).toBeCloseTo(61.674, 2)

    const revealGaps = SHIPPED_CUTS.map((w) => ({
      id: w.id,
      gap:
        sep(WALL_SHAFT.azimuthDeg, w.azimuthDeg) -
        (CHASE_HALF_MAX + (w.innerWidth / 2 / w.revealEndRadius) * (180 / Math.PI)),
    }))
    expect(revealGaps.filter((g) => g.gap <= 0)).toEqual([])
    const nearestReveal = revealGaps.reduce((a, b) => (b.gap < a.gap ? b : a))
    expect(nearestReveal.id).toBe('head-4-6')
    expect(nearestReveal.gap).toBeCloseTo(59.748, 2)

    const passageGaps = PASSAGES.map((p) => {
      const lo = Math.min(...p.sections.map((s) => s.azimuthDeg))
      const hi = Math.max(...p.sections.map((s) => s.azimuthDeg))
      const yl = Math.min(...p.sections.map((s) => s.bottomY))
      const yh = Math.max(...p.sections.map((s) => s.topY))
      return {
        label: p.label,
        gap: sep(WALL_SHAFT.azimuthDeg, (lo + hi) / 2) - ((hi - lo) / 2 + CHASE_HALF_MAX),
        sharesHeight: chases.some((c) => !(yh < c.bottomY || yl > c.topY)),
      }
    })
    expect(passageGaps.filter((g) => g.gap <= 0)).toEqual([])
    const nearestPassage = passageGaps.reduce((a, b) => (b.gap < a.gap ? b : a))
    expect(nearestPassage.label).toBe('4→6')
    expect(nearestPassage.gap).toBeCloseTo(58.748, 2)
    // and it is not a near miss held off by height: they occupy the same storeys
    expect(nearestPassage.sharesHeight).toBe(true)
  })

  it('is not in the entrance passage, though it is nearer to it than 182 was', () => {
    /*
     * Kept as a bearing-only check, alone among these, and on purpose. The
     * entrance is the one void here that is SOURCED — 270, west, İçərişəhər and
     * photographs — so it is not going to move, and it sits 7 m below the lowest
     * chase, so nothing brings the two together.
     *
     * AND THE COMPARISON IS RECORDED THE WAY IT COMES OUT, not the way it would
     * flatter the change. 334 stands 64° off the entrance where 182 stood 88°, so
     * on this one measure the split moves the chase TOWARD the only sourced void
     * in the tower. It is still 48.9° clear with both half-widths counted, and it
     * is further off than 312 — the bearing the free-arc rule chose — ever was,
     * at 42°. A test that only ever reports improvements is not a measurement.
     */
    const half = chaseHalfDeg(0)
    const eHalf = (ENTRANCE.width / 2 / innerRadiusAt(0)) * (180 / Math.PI)
    expect(sep(WALL_SHAFT.azimuthDeg, ENTRANCE.azimuthDeg) - half - eHalf).toBeCloseTo(48.896, 2)
    expect(sep(WALL_SHAFT.azimuthDeg, ENTRANCE.azimuthDeg)).toBeLessThan(
      sep(182, ENTRANCE.azimuthDeg),
    )
    expect(sep(WALL_SHAFT.azimuthDeg, ENTRANCE.azimuthDeg)).toBeGreaterThan(
      sep(312, ENTRANCE.azimuthDeg),
    )
  })
})

describe('the free arc, which the shaft has walked back into', () => {
  const arcs = clearArcsFor(PLAN_BLOCKS, CHASE_HALF_MAX)

  it('leaves exactly one free arc, and the stair closes both its ends', () => {
    /*
     * A FINDING ABOUT THE LAYOUT, not about the well. Every opening this model
     * cuts is an end of a flight and every flight hangs off one bearing, so the
     * stair and its consequences occupy 32.75° to 232.12 and the rest of the drum
     * is empty.
     */
    expect(arcs).toHaveLength(1)
    const arc = arcs[0]
    expect(arc.fromDeg).toBeCloseTo(232.12, 1)
    expect(arc.toDeg).toBeCloseTo(32.75, 1)
    expect(arc.widthDeg).toBeCloseTo(160.63, 1)

    const upperEdge = (b: PlanBlock) => b.azimuthDeg + b.halfWidthDeg + CHASE_HALF_MAX
    const lowerEdge = (b: PlanBlock) => b.azimuthDeg - b.halfWidthDeg - CHASE_HALF_MAX
    const closesBelow = PLAN_BLOCKS.reduce((a, b) =>
      sep(upperEdge(b), arc.fromDeg) < sep(upperEdge(a), arc.fromDeg) ? b : a,
    )
    const closesAbove = PLAN_BLOCKS.reduce((a, b) =>
      sep(lowerEdge(b), arc.toDeg) < sep(lowerEdge(a), arc.toDeg) ? b : a,
    )
    expect(closesBelow.label).toBe('passage 8→9')
    expect(closesAbove.label).toBe('passage 4→6')
  })

  it('holds the shaft, and holds the wellhead nowhere near it', () => {
    /*
     * THE RULE AND THE WITNESS AGREE FOR THE FIRST TIME, and it is worth saying
     * why they ever disagreed. clearArcsFor() answers "where may a VERTICAL RUN
     * IN THE WALL stand"; it was used to place 312 back when one bearing carried
     * both the run and the mouth, and then testimony beat it and the run followed
     * the mouth to 182 — two degrees outside the arc, and by 2026-08-17 forty
     * degrees inside the stair. Split, the run is asked the question that suits
     * it and lands at 334, inside the arc with 58.75° to its nearer end.
     *
     * The wellhead is outside the arc and that is not a fault: a hole in the FLOOR
     * between two doorways is not competing for wall.
     */
    const arc = arcs[0]
    const into = (az: number) => (((az - arc.fromDeg) % 360) + 360) % 360
    expect(into(WALL_SHAFT.azimuthDeg)).toBeLessThan(arc.widthDeg)
    expect(into(WALL_SHAFT.azimuthDeg)).toBeCloseTo(101.88, 1)
    expect(arc.widthDeg - into(WALL_SHAFT.azimuthDeg)).toBeCloseTo(58.75, 1)
    expect(sep(WALL_SHAFT.azimuthDeg, arc.middleDeg)).toBeCloseTo(21.57, 1)
    expect(into(WELL.azimuthDeg)).toBeGreaterThan(arc.widthDeg)
  })
})

describe('what the split costs: the junction nobody has measured', () => {
  /*
   * The one debt the change leaves, and the reason it is here in metres rather
   * than in prose. The pipe stands on the far side of the chamber from the mouth
   * it delivers into, so the leg between them crosses storey 3.
   *
   * The radius of the pipe's foot is the component's own: the chase is cut into
   * the wall, so the run stands a little BEYOND the room face rather than in
   * front of it — face plus 0.55 of a bore.
   */
  const footRadius = innerRadiusAt(FLOOR_Y + WATER.downpipeElbowRise) + WATER.downpipeDiameter * 0.55
  const at = (r: number, azDeg: number) => ({
    x: r * Math.sin((azDeg * Math.PI) / 180),
    z: -r * Math.cos((azDeg * Math.PI) / 180),
  })
  const legLength = (wellAz: number, shaftAz: number) => {
    const a = at(WELL.offsetFromAxis, wellAz)
    const b = at(footRadius, shaftAz)
    return Math.hypot(a.x - b.x, a.z - b.z)
  }

  it('is 6.23 m of pipe across a room 7.30 m wide', () => {
    expect(footRadius).toBeCloseTo(3.825, 3)
    expect(legLength(WELL.azimuthDeg, WALL_SHAFT.azimuthDeg)).toBeCloseTo(6.225, 3)
    // the chamber's clear span at that level, for scale: the leg crosses 85% of it
    expect(2 * FACE_R).toBeCloseTo(7.299, 3)
    expect(legLength(WELL.azimuthDeg, WALL_SHAFT.azimuthDeg) / (2 * FACE_R)).toBeCloseTo(0.853, 3)
  })

  it('is what the shared bearing was buying, and the price is stated rather than hidden', () => {
    /*
     * WHILE THE TWO SHARED A BEARING THE LEG WAS 1.43 m — a plumber's reach from
     * the wall to a mouth in open floor, which is why nobody ever looked at it.
     * The split multiplies it by 4.4. Nothing in [ref] or in the footage says how
     * the real pipe crosses; the museum's cutaway draws the junction
     * schematically because its last courses were lifted long ago.
     *
     * So the model draws the only line that can be DERIVED — straight, at
     * WATER.downpipeElbowRise above the rim — and draws it in the schematic half
     * of the water layer, with the droplets running along it so the crossing is
     * the most visible thing there rather than the least. Inventing a route under
     * the floor would be inventing a dimension, which rule 1 forbids; drawing
     * nothing would be hiding the consequence of his own sentence.
     */
    expect(legLength(182, 182)).toBeCloseTo(1.425, 3)
    expect(
      legLength(WELL.azimuthDeg, WALL_SHAFT.azimuthDeg) / legLength(182, 182),
    ).toBeGreaterThan(4)
    // the leg clears the floor by the elbow rise and no more
    expect(WATER.downpipeElbowRise).toBeCloseTo(0.25, 10)
  })
})
