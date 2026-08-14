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
import { planAllFlights, stairDoorways, stairPassageSections } from './staircase'
import { clearArcsFor, downpipeChases, type PlanBlock } from './waterSystem'
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

describe('the downpipe stands clear of everything a visitor walks through', () => {
  it('is not in a stair doorway', () => {
    /*
     * IT WAS. The chase is cut down the room-side face and the stair's head
     * doorways came out at about az 15 when the flights started at 100, so a
     * visitor leaving the stair on storey 3 walked into a 0.30 m pipe standing
     * across the opening. The owner photographed it.
     */
    const clashes: string[] = []
    for (const d of doorways) {
      const half = chaseHalfDeg((d.bottomY + d.topY) / 2)
      if (sep(WELL.azimuthDeg, d.azimuthDeg) < half + d.widthDeg / 2) {
        clashes.push(`doorway at az ${d.azimuthDeg.toFixed(1)}, y ${d.bottomY.toFixed(2)}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('is not in a window reveal', () => {
    /*
     * IT ASKS ABOUT HEIGHT, AND IT HAD TO. On 2026-08-13 the stair turned a
     * quarter of the drum and the bearing-only version of this test failed on
     * foot-8-9 — azimuth 218.5 against a chase at 230, overlapping by 0.2° once
     * both half-widths are counted. They did not touch: the chase's topmost
     * length ended at the storey-7 springing, 21.79, and that reveal starts at
     * 23.77. The old version compared bearings alone and borrowed one half-angle
     * from storey 3 for every opening in the tower, so it could not see that.
     * Giving it the second dimension was a correction, not a relaxation.
     *
     * WHAT IT IS NOT is a test that the well is in a sane place. It passed at
     * 230 the whole time the chase was standing in line with that reveal, kept
     * off it by 1.98 m of masonry and by nothing else. That is what the plan
     * test below is for, and the two are not redundant: this one asks whether
     * the model cuts stone it should not, that one asks whether the number is
     * worth keeping. Both answers are needed and they were once the same answer.
     */
    expect(chases.map((c) => c.floorIndex)).toEqual([2, 3, 4, 5, 6])

    const clashes: string[] = []
    for (const w of SHIPPED_CUTS) {
      const wHalf = (w.innerWidth / 2 / w.revealEndRadius) * (180 / Math.PI)
      const sill = w.centreY - w.outerHeight / 2
      const head = w.centreY + w.outerHeight / 2
      for (const c of chases) {
        if (head < c.bottomY || sill > c.topY) continue
        const half = chaseHalfDeg((c.bottomY + c.topY) / 2)
        if (sep(c.azimuthDeg, w.azimuthDeg) < half + wHalf) {
          clashes.push(`${w.id} against the chase on storey ${c.floorIndex + 1}`)
        }
      }
    }
    expect(clashes).toEqual([])
  })

  it('clears every void in the drum IN PLAN, not only in height', () => {
    /*
     * THE PROPERTY THE OTHER TESTS CANNOT STATE, and the one 230 failed.
     *
     * Height is what decides whether a cutter removes stone that is there, and
     * the guards above are right to ask about it. It is the wrong question to
     * ask of a [PLACEHOLDER]. A bearing nobody has measured, kept legal only by
     * the accident that its neighbour sits two metres higher, is not a decision
     * — it is a coincidence that will be read as one. Every height in this list
     * is derived from WALL_LIFTS and from a stair bearing the repo already knows
     * to be wrong by at least 8°; the day any of them moves down, a value that
     * passed only on height becomes a pipe through a window.
     *
     * At 230 this failed twice over: 2.1° inside the roof climb's passage, whose
     * lead-in reaches azimuth 227.0, and into foot-8-9's reveal at 218.5.
     * Neither cut anything. Both were one lowered landing from cutting.
     *
     * THE REVEAL OVERLAP READS 1.14° HERE AND 0.3° IN THE CONFIG NOTE, and the
     * two are the same overlap measured with different chases. The note uses the
     * chase's half-angle at that reveal's own height, 4.27°, which is what a
     * downpipe carried up to storey 8 would actually be; this test uses
     * CHASE_HALF_MAX, 5.13°, the widest the run ever is. Against a placeholder
     * the wider figure is the right one — see the note on CHASE_HALF_MAX — and
     * the difference between them is itself the answer to "how close is close".
     */
    const clashes: string[] = []
    for (const b of PLAN_BLOCKS) {
      const gap = sep(WELL.azimuthDeg, b.azimuthDeg) - (CHASE_HALF_MAX + b.halfWidthDeg)
      if (gap <= 0) clashes.push(`${b.label} overlaps by ${(-gap).toFixed(2)}°`)
    }
    expect(clashes).toEqual([])
  })

  it('is not in the entrance passage', () => {
    /*
     * Kept as a bearing-only check, alone among these, and on purpose. The
     * entrance is the one void here that is SOURCED — 270, west, İçərişəhər and
     * photographs — so it is not going to move, and it sits 7 m below the lowest
     * chase, so nothing brings the two together. It is out of the plan
     * derivation for that reason and checked here instead.
     */
    const half = chaseHalfDeg(0)
    const eHalf = (ENTRANCE.width / 2 / innerRadiusAt(0)) * (180 / Math.PI)
    expect(sep(WELL.azimuthDeg, ENTRANCE.azimuthDeg)).toBeGreaterThan(half + eHalf)
  })

  it('is not inside the arc the stair sweeps', () => {
    /*
     * Not just the doorways: the chase runs the full height of several storeys,
     * and the passage behind the wall face is where the flights are. A pipe in
     * the flight is as wrong as a pipe in the door.
     */
    for (const flight of flights) {
      for (const step of flight) {
        expect(sep(WELL.azimuthDeg, step.azimuthDeg)).toBeGreaterThan(
          chaseHalfDeg(step.treadY) + (STAIR.width / 2 / step.midRadius) * (180 / Math.PI),
        )
      }
    }
  })
})

describe('where the chase may stand at all', () => {
  const arcs = clearArcsFor(PLAN_BLOCKS, CHASE_HALF_MAX)

  it('leaves exactly one free arc, and the stair closes both its ends', () => {
    /*
     * A FINDING ABOUT THE LAYOUT, not about the well. Every opening this model
     * cuts is an end of a flight and every flight hangs off one bearing, so the
     * stair and its consequences occupy 37.9° to 227.0 and the rest of the drum
     * is empty. The well is not choosing a gap between obstacles; there is only
     * one gap, and it is the half of the tower the stair does not use.
     *
     * Both ends are passages rather than windows, which is worth writing down:
     * a reveal is about 8° wide and a tube is over a hundred, so the reveals
     * never get to bound anything. Reading the near miss at foot-8-9 as the
     * problem would have moved the well three degrees and solved nothing.
     */
    expect(arcs).toHaveLength(1)
    const arc = arcs[0]
    expect(arc.fromDeg).toBeCloseTo(232.14, 1)
    expect(arc.toDeg).toBeCloseTo(32.73, 1)
    expect(arc.widthDeg).toBeCloseTo(160.59, 1)

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

  it('puts the well in the middle of it, to the nearest degree', () => {
    /*
     * The rule that replaces "chosen to be clear of everything that is not a
     * placeholder". That phrasing survived three rewrites and was never a rule:
     * it described the value rather than deriving it, so each time the stair
     * moved it had to be re-argued, and it was re-argued into a corner — 105° of
     * clearance in 2026-08-10, 8.4° on 2026-08-13, an overlap in plan by the
     * time anyone measured it.
     *
     * The middle of the free arc IS a rule, and it fails loudly. Turn the stair
     * — STAIR_FROM_BUTTRESS_DEG is known to be 8° or more too small — and the
     * arc is recomputed here from the live flight plan, 312 stops being its
     * middle, and this says so. That is the whole point of writing the choice as
     * a derivation: the well should move when the stair does, and somebody
     * should have to look at it.
     *
     * A WHOLE DEGREE, not 312.43. Nothing has measured this bearing and a
     * decimal would imply something had.
     */
    expect(arcs[0].middleDeg).toBeCloseTo(312.43, 1)
    expect(Number.isInteger(WELL.azimuthDeg)).toBe(true)
    expect(sep(WELL.azimuthDeg, arcs[0].middleDeg)).toBeLessThan(1)
  })

  it('leaves the chase 79° of arc either side, where it had none', () => {
    /*
     * The margin written down, because "no clash" hides how much room there is
     * — which is the mistake the version of this file that said "clears the
     * nearest reveal by 11°" made. It recorded a near miss as though recording
     * it were the same as being clear of it.
     */
    const worst = PLAN_BLOCKS.map((b) => ({
      label: b.label,
      gap: sep(WELL.azimuthDeg, b.azimuthDeg) - (CHASE_HALF_MAX + b.halfWidthDeg),
    })).reduce((a, b) => (b.gap < a.gap ? b : a))
    expect(worst.label).toBe('passage 8→9')
    expect(worst.gap).toBeGreaterThan(79)
  })
})
