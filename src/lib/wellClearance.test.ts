import { describe, expect, it } from 'vitest'
import {
  ENTRANCE,
  FLOORS,
  STAIR,
  TOWER,
  WALL_LIFTS,
  WATER,
  WELL,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import { approachAzimuthDeg, planAllFlights, stairDoorways, stairPassageSections } from './staircase'
import {
  besideDoorwayBearing,
  chaseBreaches,
  clearArcsFor,
  downpipeChases,
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

const chases = downpipeChases(
  FLOORS,
  WATER.channelFloorRange,
  WELL.startsAtFloorIndex,
  WELL.azimuthDeg,
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
 * direction a guard on a placeholder may err in.
 */
const CHASE_HALF_MAX = Math.max(...chases.map((c) => chaseHalfDeg((c.bottomY + c.topY) / 2)))

const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** The flight the visitor LEAVES the wellhead's storey by. */
const DEPARTURE = WALL_LIFTS.findIndex(
  (l) => Math.abs(l.fromY - FLOORS[WELL.startsAtFloorIndex].floorY) < 1e-6,
)
const DEPARTURE_FOOT = flights[DEPARTURE][0]
/** Its doorway, planned exactly as stairDoorways() plans it. */
const DEPARTURE_DOORWAY = {
  azimuthDeg: approachAzimuthDeg(flights[DEPARTURE], DEPARTURE_FOOT, STAIR.width),
  halfWidthDeg:
    (STAIR.doorwayWidth / Math.max(0.5, DEPARTURE_FOOT.midRadius) / 2) * (180 / Math.PI),
}

/**
 * EVERY VOID IN THE DRUM, FLATTENED ONTO PLAN.
 *
 * A tube's plan footprint is simply its whole azimuth span — there is no height
 * in this list, so the sections in between add nothing to the union its ends do
 * not already give. The entrance is deliberately absent; see the note on
 * WELL.azimuthDeg and the entrance test below.
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

describe('the well stands where the owner says it stands', () => {
  it('is beside the doorway of the passage that leaves its own storey', () => {
    /*
     * [OWNER] 2026-08-16: «колодец должен стоять рядом с проходом». The passage
     * is identified by his footage, not chosen: up/080 has the wellhead's recess
     * and the stair's mouth as two openings in one wall with a single pier
     * between them, up/085 is the first tread of the climb out of storey 3.
     *
     * THIS IS THE TEST THAT MOVES WITH THE STAIR, AND IT HAS NOW MOVED ONCE. The
     * doorway is re-planned here from the live flight plan by the same call
     * stairDoorways() makes. On 2026-08-17 approachAzimuthDeg() stopped putting
     * foot doorways on the flight's own treads, this doorway went from 190.772 to
     * 202.628, and the assertion below caught the well 11.856° behind it rather
     * than leaving it where the old sign had put it. The same will happen the day
     * STAIR_FROM_BUTTRESS_DEG is corrected — it is known to be at least 8° too
     * small.
     */
    expect(WALL_LIFTS[DEPARTURE].fromFloorNumber).toBe(3)
    expect(DEPARTURE_DOORWAY.azimuthDeg).toBeCloseTo(202.628, 3)

    const tangent = besideDoorwayBearing(
      DEPARTURE_DOORWAY.azimuthDeg,
      DEPARTURE_DOORWAY.halfWidthDeg,
      WELL.offsetFromAxis,
      WELL.mouthDiameter,
      -1,
    )
    expect(tangent).toBeCloseTo(182.380, 3)
    expect(Number.isInteger(WELL.azimuthDeg)).toBe(true)
    expect(sep(WELL.azimuthDeg, tangent)).toBeLessThan(1)
  })

  it('leaves the mouth 0.87 m from the jamb it stands against', () => {
    /*
     * The tangency in metres, which is the only form of it anyone can picture.
     * Measured to the jamb's INNER CORNER — the nearest stone, at the room face
     * — and not to the plane, because the plane is a construction line and the
     * corner is a thing you can walk into.
     *
     * up/080 reads the pier between the two openings at roughly this width. That
     * is a corroboration and NOT the derivation: a pier read off a handheld
     * wide-angle frame with no scale in it is not a measurement in this project,
     * and if it were, it would be one that disagreed with 2.4 m of offsetFromAxis
     * rather than one that confirmed 171.
     */
    const jambAz = DEPARTURE_DOORWAY.azimuthDeg - DEPARTURE_DOORWAY.halfWidthDeg
    const jambR = innerRadiusAt(FLOORS[WELL.startsAtFloorIndex].floorY)
    const d = Math.sqrt(
      jambR ** 2 +
        WELL.offsetFromAxis ** 2 -
        2 * jambR * WELL.offsetFromAxis * Math.cos((jambAz - WELL.azimuthDeg) * (Math.PI / 180)),
    )
    expect(d - WELL.mouthDiameter / 2).toBeCloseTo(0.887, 3)
  })
})

describe('what his placement costs, measured rather than argued', () => {
  it('costs no doorway — the fault of 2026-08 is not reopened', () => {
    /*
     * IT WAS 20 ONCE, AND AT 20 THE PIPE STOOD IN THE DOOR. The chase is cut
     * down the room-side face and the head doorways came out at about az 15 while
     * the flights started at 100, so a visitor leaving the stair on storey 3
     * walked into a 0.30 m pipe across the opening. The owner photographed it and
     * called it, exactly, pipes in the entrances.
     *
     * "Beside the passage" is not "in it", and this is where the difference is
     * kept. The nearest doorway is the very one the well stands against.
     */
    const gaps = doorways.map((d) => ({
      label: `doorway at az ${d.azimuthDeg.toFixed(1)}, y ${d.bottomY.toFixed(2)}`,
      gap: sep(WELL.azimuthDeg, d.azimuthDeg) - (chaseHalfDeg((d.bottomY + d.topY) / 2) + d.widthDeg / 2),
    }))
    expect(gaps.filter((g) => g.gap <= 0)).toEqual([])
    const worst = gaps.reduce((a, b) => (b.gap < a.gap ? b : a))
    expect(worst.gap).toBeGreaterThan(8)
  })

  it('costs no window reveal, which the other side of the door would have', () => {
    /*
     * The side is [VIDEO] and rests on one frame, so it is worth recording what
     * the arithmetic thinks of it independently. Anticlockwise, every reveal in
     * the tower is 10.5° clear. Clockwise — 223, the mirror tangent — the chase
     * lands in foot-8-9's reveal: a pipe out of a window, which is the fault
     * 4f3e197 was written to prevent.
     *
     * THE MARGIN COLLAPSED ON 2026-08-17 AND THE CONCLUSION DID NOT. While the
     * foot doorways stood on their own treads the mirror tangent was 211 and cost
     * SIX reveals against nought, which read as strong independent support for
     * the anticlockwise side. Straightened, the two tangents are 182 and 223 and
     * the bill is one reveal against nought. The side still rests where the note
     * on WELL.azimuthDeg always said it rested — on up/080 — and this test now
     * measures a much weaker corroboration honestly rather than a strong one that
     * has quietly stopped being true.
     */
    const revealGap = (az: number) =>
      SHIPPED_CUTS.map((w) => ({
        id: w.id,
        gap: sep(az, w.azimuthDeg) - (CHASE_HALF_MAX + (w.innerWidth / 2 / w.revealEndRadius) * (180 / Math.PI)),
      }))
    expect(revealGap(WELL.azimuthDeg).filter((g) => g.gap <= 0)).toEqual([])
    expect(Math.min(...revealGap(WELL.azimuthDeg).map((g) => g.gap))).toBeGreaterThan(10.5)

    const mirrored = besideDoorwayBearing(
      DEPARTURE_DOORWAY.azimuthDeg,
      DEPARTURE_DOORWAY.halfWidthDeg,
      WELL.offsetFromAxis,
      WELL.mouthDiameter,
      1,
    )
    expect(Math.round(mirrored)).toBe(223)
    expect(revealGap(Math.round(mirrored)).filter((g) => g.gap <= 0).map((g) => g.id)).toEqual([
      'foot-8-9',
    ])
  })

  it('costs the stair, on every storey the chase runs up', () => {
    /*
     * THE BILL, AND IT IS NOT PAID BY PRETENDING IT IS SMALL.
     *
     * One number does two jobs: it places the mouth the owner saw AND the chase
     * the pipe stands in, and the chase is a wall thing in a wall the stair is
     * already inside. Four lengths of it land in a passage. This asserts the
     * whole list rather than a worst case, because a list that shrinks silently
     * is how "clear" came to mean "not touching anything today".
     *
     * BOTH DIMENSIONS, of the same pair: only the sections of a passage that
     * share a length of chase's HEIGHT are compared with it in bearing. That is
     * the lesson of downpipeChases() and of clearArcsFor() applied together —
     * see chaseBreaches().
     */
    const breaches = chaseBreaches(chases, PASSAGES, innerRadiusAt)
    expect(breaches.map((b) => `storey ${b.floorIndex + 1} × ${b.passage}`)).toEqual([
      'storey 3 × 3→4',
      'storey 4 × 4→6',
      'storey 6 × 6→7',
      'storey 7 × 7→8',
    ])
    /*
     * The depths, apart from the order, because a rounded degree on a tie is the
     * kind of assertion that breaks for no reason. Worst first, as returned.
     */
    const deg = breaches.map((b) => b.overlapDeg)
    /*
     * THE BILL HAS BEEN RE-PRICED TWICE AND IT GOT SHORTER AND DEEPER.
     *
     * 22.61° over eight lengths → 34.21° over eight on 2026-08-16, when the
     * springing rose 0.65 m with CUPOLA_RISE and each length of chase became
     * 2.25 m of wall instead of 1.60. Then 34.21 over eight → 39.57 over FOUR on
     * 2026-08-17, and that one is not the chase changing at all: the well follows
     * its doorway, the doorway moved 11.856° with the way in, and 182 sits
     * squarely under the flights instead of glancing past the corners of six
     * passages. It stops touching 2→3, 3→4-at-storey-4, 4→6-at-storey-5 and
     * 6→7-at-storey-7 altogether, and goes half again as deep into the four it
     * still meets. Fewer wounds, each of them worse.
     */
    expect(deg[0]).toBeCloseTo(39.57, 2)
    expect(deg[deg.length - 1]).toBeCloseTo(36.56, 2)
    // the storeys it runs up that it also breaks into — no longer all five
    expect(new Set(breaches.map((b) => b.floorIndex))).toEqual(new Set([2, 3, 5, 6]))
  })

  it('takes the whole jamb between the room and the stair where it does', () => {
    /*
     * The dimension that decides whether the overlap matters. STAIR.wallClearance
     * is 0.25 m of masonry between the room's face and the passage's inner cheek;
     * the chase bites 0.48 m past that face. Where the two arcs cross there is
     * nothing left between them — a slot 0.66 m wide, wider than the walker's
     * own shoulder, standing open from the floor to the springing.
     */
    const breaches = chaseBreaches(chases, PASSAGES, innerRadiusAt)
    expect(breaches).toHaveLength(4)
    for (const b of breaches) expect(b.biteMetres).toBeGreaterThan(STAIR.wallClearance)
    /*
     * ALL FOUR BITE THE SAME 0.340 m NOW, and the flatness is the finding rather
     * than a coincidence. The bite is how far past the room face the chase
     * reaches against how far in the passage starts, and both are functions of
     * the drum's radius at that height; while the well glanced the CORNERS of
     * eight passages the sample included four shallow ones cut higher up, at
     * 0.44. Sitting under the flights themselves, the four that remain are all
     * measured at their own storey's floor and the spread has gone.
     */
    expect(Math.min(...breaches.map((b) => b.biteMetres))).toBeCloseTo(0.34, 3)
    expect(Math.max(...breaches.map((b) => b.biteMetres))).toBeCloseTo(0.34, 3)
  })

  it('opens onto walkable treads on storey 3, which is the worst of it', () => {
    /*
     * The single number to quote if only one is quoted. On storey 3 the slot does
     * not open into the crown of a tunnel or into a stretch of blind cheek — it
     * opens onto the treads of flight 3→4 themselves.
     *
     * IT GOT WORSE ON 2026-08-17, and this is where the straightened way in is
     * felt. The chase used to meet those treads between 0.41 and 1.44 m above the
     * room floor — waist height, an opening you look through. Following its
     * doorway round, it now meets the flight AT ITS FIRST TREAD: the slot starts
     * level with the paving the walker is standing on and runs up 0.82 m of
     * climb. There is no longer a lip between the room and the stair at all on
     * that bearing; you could step through the wall.
     */
    const chase = chases.find((c) => c.floorIndex === WELL.startsAtFloorIndex)!
    const half = chaseHalfDeg((chase.bottomY + chase.topY) / 2)
    const inArc = flights[DEPARTURE].filter(
      (s) => sep(WELL.azimuthDeg, s.azimuthDeg) < half + (STAIR.width / 2 / s.midRadius) * (180 / Math.PI),
    )
    expect(inArc.length).toBe(6)
    const ys = inArc.map((s) => s.treadY)
    expect(Math.min(...ys) - chase.bottomY).toBeCloseTo(0.0, 2)
    expect(Math.max(...ys) - chase.bottomY).toBeCloseTo(0.82, 2)
    // and they are inside the chase's own height, so the slot really reaches them
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(chase.bottomY)
    expect(Math.max(...ys)).toBeLessThan(chase.topY)
  })

  it('is not in the entrance passage, and is further from it than 312 was', () => {
    /*
     * Kept as a bearing-only check, alone among these, and on purpose. The
     * entrance is the one void here that is SOURCED — 270, west, İçərişəhər and
     * photographs — so it is not going to move, and it sits 7 m below the lowest
     * chase, so nothing brings the two together.
     */
    const half = chaseHalfDeg(0)
    const eHalf = (ENTRANCE.width / 2 / innerRadiusAt(0)) * (180 / Math.PI)
    expect(sep(WELL.azimuthDeg, ENTRANCE.azimuthDeg)).toBeGreaterThan(half + eHalf)
    expect(sep(WELL.azimuthDeg, ENTRANCE.azimuthDeg)).toBeGreaterThan(
      sep(312, ENTRANCE.azimuthDeg),
    )
  })
})

describe('where the chase could have stood, kept because it is what was given up', () => {
  const arcs = clearArcsFor(PLAN_BLOCKS, CHASE_HALF_MAX)

  it('leaves exactly one free arc, and the stair closes both its ends', () => {
    /*
     * A FINDING ABOUT THE LAYOUT, not about the well, and it survives the well
     * moving away from it. Every opening this model cuts is an end of a flight
     * and every flight hangs off one bearing, so the stair and its consequences
     * occupy 37.9° to 227.0 and the rest of the drum is empty.
     *
     * This is no longer where the well is. It is kept because it is the size of
     * what his sentence cost: there was one place a chase could stand clear of
     * everything, 160° wide, and the wellhead is 130° away from the middle of it.
     */
    expect(arcs).toHaveLength(1)
    const arc = arcs[0]
    expect(arc.fromDeg).toBeCloseTo(232.14, 1)
    expect(arc.toDeg).toBeCloseTo(32.73, 1)
    expect(arc.widthDeg).toBeCloseTo(160.59, 1)
    expect(sep(WELL.azimuthDeg, arc.middleDeg)).toBeCloseTo(130.43, 1)

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

  it('has a nearer end than 312, and the near end is 20° from the doorway', () => {
    /*
     * THE QUESTION THIS PUTS TO HIM, and the reason the report asks about the
     * side before anything else.
     *
     * The chase only ever meets the passages it shares a HEIGHT with, and the
     * roof climb is not one of them — it runs 23.14–27.50 and the topmost chase
     * stops at 21.79. Drop it and the free arc opens at 222.25 instead of 232.12.
     * That bearing is 19.6° CLOCKWISE of the storey-3 doorway, 0.46 m of arc from
     * its far jamb along the room face: still "next to the passage" by any
     * ordinary reading of the words — nearer to it now than before the way in was
     * straightened, since the doorway moved toward it — and it costs nothing at
     * all.
     *
     * It is not what the model builds, because up/080 puts the well on the other
     * side and this repository does not choose the cheaper reading of a witness.
     * It is measured here so that one sentence from him can collect it.
     */
    const meetsInHeight = PASSAGES.filter((p) =>
      chases.some((c) =>
        p.sections.some((s) => !(s.topY < c.bottomY || s.bottomY > c.topY)),
      ),
    ).map((p) => {
      const lo = Math.min(...p.sections.map((s) => s.azimuthDeg))
      const hi = Math.max(...p.sections.map((s) => s.azimuthDeg))
      return { label: p.label, azimuthDeg: (lo + hi) / 2, halfWidthDeg: (hi - lo) / 2 }
    })
    const relaxed = clearArcsFor(meetsInHeight, CHASE_HALF_MAX)
    expect(relaxed).toHaveLength(1)
    expect(relaxed[0].fromDeg).toBeCloseTo(222.27, 1)
    expect(relaxed[0].fromDeg - DEPARTURE_DOORWAY.azimuthDeg).toBeCloseTo(19.6, 1)
    const jambToChase =
      ((relaxed[0].fromDeg -
        CHASE_HALF_MAX -
        (DEPARTURE_DOORWAY.azimuthDeg + DEPARTURE_DOORWAY.halfWidthDeg)) *
        Math.PI) /
      180
    expect(jambToChase * innerRadiusAt(FLOORS[WELL.startsAtFloorIndex].floorY)).toBeCloseTo(0.46, 2)
  })
})
