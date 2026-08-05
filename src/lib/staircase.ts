/**
 * Pure geometry for the stair that climbs inside the wall thickness (Phase 4).
 * three.js-free so it can be unit-tested (CLAUDE.md rule 6).
 *
 * [ref]: "Лестница примыкает к внутренней окружности стены, проходит в теле
 * кладки" / "connected by a staircase which abuts the circular wall".
 *
 * The flight is a helix: each step advances by a fixed angle about the tower
 * axis and rises by a fixed riser. Its inner edge sits just outside the inner
 * wall face, so the whole flight lies within the masonry.
 */

/**
 * Which way the stair turns as you climb, seen from above.
 *
 * UNRESOLVED. The Phase-4 spec assumes 'clockwise' and asks for it to be checked
 * against reference-photos/interior/. It cannot be: the two photographs of the
 * HISTORIC stair-in-wall disagree — in `Qız qalası mərtəbələrarası pilləkən.JPG`
 * the treads' narrow ends read as being on the right, while the Dreamstime frame
 * reads as curving the other way. (The other spiral photographs in the set show
 * the MODERN visitor stair, which winds about a central newel and tells us
 * nothing about the original.) Left as a parameter until someone who has walked
 * it confirms — see the note on STAIR.winding in config/tower.ts.
 */
export type Winding = 'clockwise' | 'counterclockwise'

/** +1 for clockwise (increasing azimuth), −1 for counterclockwise. */
export function windingSign(w: Winding): 1 | -1 {
  return w === 'clockwise' ? 1 : -1
}

export interface FlightParams {
  /** World Y of the floor the flight starts from. */
  fromY: number
  /** World Y of the floor the flight lands on. */
  toY: number
  /** Azimuth of the first step, degrees clockwise from north. */
  startAzimuthDeg: number
  /**
   * Radius of the flight's inner edge at a height, wall clearance already
   * included.
   *
   * A FUNCTION, not a number. The wall thins going up, so its room-side face
   * moves outward as you climb — 0.044 m per metre. Pinning the whole flight to
   * the face at the storey's FLOOR left its inner edge progressively inside the
   * room: by the head of a flight the passage was cut 0.23 m past the wall, so
   * the stair was still an open niche onto the chamber for its whole length,
   * which is precisely what the walkthrough footage says it is not. The source
   * says the stair ABUTS the inner face; the face is a cone, so the stair is a
   * cone too.
   */
  innerRadiusAt: (y: number) => number
  /** Radial width of the flight. */
  width: number
  /** Preferred riser height; the real one is rounded to fit the storey exactly. */
  riserTarget: number
  /** Preferred tread depth measured along the walking line. */
  goingTarget: number
  winding: Winding
}

export interface StepPlacement {
  index: number
  /** Azimuth of the step's centre, degrees clockwise from north. */
  azimuthDeg: number
  /** Angular width of the step wedge, degrees. */
  angularWidthDeg: number
  /** World Y of the tread surface (the surface you stand on). */
  treadY: number
  /** Mid-radius of the flight — the walking line. */
  midRadius: number
}

/**
 * Number of risers needed to climb `rise` at approximately `riserTarget`.
 * Always at least one, so a flight never degenerates.
 */
export function stepCountFor(rise: number, riserTarget: number): number {
  if (rise <= 0) return 0
  return Math.max(1, Math.round(rise / riserTarget))
}

/** The riser you actually get once the count is rounded to fit the storey. */
export function actualRiser(rise: number, count: number): number {
  return count > 0 ? rise / count : 0
}

/**
 * Angle each step advances, so that the tread depth along the walking line is
 * about `goingTarget`. Wider flights higher up therefore turn through a smaller
 * angle per step, which keeps the going constant rather than the arc.
 */
export function stepAngleDeg(goingTarget: number, midRadius: number): number {
  if (midRadius <= 0) throw new Error('midRadius must be positive')
  return (goingTarget / midRadius) * (180 / Math.PI)
}

/** Lay out one storey-to-storey flight. */
export function planFlight(p: FlightParams): StepPlacement[] {
  const rise = p.toY - p.fromY
  const count = stepCountFor(rise, p.riserTarget)
  if (count === 0) return []

  const riser = actualRiser(rise, count)
  const sign = windingSign(p.winding)

  const steps: StepPlacement[] = []
  let azimuth = p.startAzimuthDeg
  for (let i = 0; i < count; i++) {
    // tread i is the surface you arrive on after climbing i+1 risers
    const treadY = p.fromY + riser * (i + 1)
    const midRadius = p.innerRadiusAt(treadY) + p.width / 2
    // the going is held constant along the walking line, so a wider course
    // higher up turns through a smaller angle
    const dAngle = stepAngleDeg(p.goingTarget, midRadius) * sign
    steps.push({
      index: i,
      azimuthDeg: azimuth,
      angularWidthDeg: Math.abs(dAngle),
      treadY,
      midRadius,
    })
    azimuth += dAngle
  }
  return steps
}

/** Total angle a flight sweeps, degrees (unsigned). */
export function flightArcDeg(steps: StepPlacement[]): number {
  if (steps.length < 2) return steps.length ? steps[0].angularWidthDeg : 0
  return Math.abs(steps[steps.length - 1].azimuthDeg - steps[0].azimuthDeg) + steps[0].angularWidthDeg
}

/**
 * How many steps below the landing the opening must already be open.
 *
 * You do not meet the slab when your FEET reach it — you meet it when your HEAD
 * does, which is a whole body height plus the slab's own thickness earlier. With
 * the old flat 4 steps, the walker's head was under the storey-6 slab from
 * azimuth 168.6° while the opening only began at 150°: 18.6° of arc spent
 * wedged under masonry, and every landing had the same trap.
 */
export function headroomStepsFor(riser: number, walkerHeight: number, slabThickness: number): number {
  if (riser <= 0) return 4
  return Math.max(4, Math.ceil((walkerHeight + slabThickness) / riser))
}

/**
 * Angular span of the opening the flight needs where it breaks through the
 * structure above — the last `headroomSteps` steps plus a landing margin.
 */
export function stairwellSpanDeg(
  steps: StepPlacement[],
  headroomSteps = 4,
): { centreAzimuthDeg: number; widthDeg: number } | null {
  if (steps.length === 0) return null
  const tail = steps.slice(Math.max(0, steps.length - headroomSteps))
  const first = tail[0].azimuthDeg
  const last = tail[tail.length - 1].azimuthDeg
  const widthDeg = Math.abs(last - first) + tail[0].angularWidthDeg * 2
  return { centreAzimuthDeg: (first + last) / 2, widthDeg }
}

export interface StairSettings {
  winding: Winding
  riserTarget: number
  goingTarget: number
  width: number
  wallClearance: number
  startAzimuthDeg: number
}

/** The part of a lift this function needs: two heights and nothing else. */
export interface FlightRun {
  fromY: number
  toY: number
}

/**
 * Lay out the flights cut in the masonry, ONE PER LIFT.
 *
 * Not one per storey gap. The tower does not have a flight between every pair of
 * storeys: the bottom lift is a modern steel spiral standing in the middle of the
 * chamber and is no part of this, and one flight — 4 to 6 — spans two storey
 * heights, opening onto the storey between it partway along. Driving this off a
 * list of RUNS rather than off the floor table is what lets both be true.
 *
 * Flights are still chained: each resumes one step past where the previous ended,
 * so the masonry stair keeps turning the same way up the tower instead of
 * restarting at an arbitrary azimuth every storey. `innerRadiusOf` is injected so
 * this stays independent of the config module and can be exercised with synthetic
 * towers in tests.
 */
export function planAllFlights(
  cfg: StairSettings,
  runs: FlightRun[],
  innerRadiusOf: (y: number) => number,
): StepPlacement[][] {
  const flights: StepPlacement[][] = []
  let cursor = cfg.startAzimuthDeg

  for (const run of runs) {
    const steps = planFlight({
      fromY: run.fromY,
      toY: run.toY,
      startAzimuthDeg: cursor,
      innerRadiusAt: (y) => innerRadiusOf(y) + cfg.wallClearance,
      width: cfg.width,
      riserTarget: cfg.riserTarget,
      goingTarget: cfg.goingTarget,
      winding: cfg.winding,
    })
    flights.push(steps)
    if (steps.length > 1) {
      const stepAngle = steps[1].azimuthDeg - steps[0].azimuthDeg
      cursor = steps[steps.length - 1].azimuthDeg + stepAngle
    } else if (steps.length === 1) {
      cursor = steps[0].azimuthDeg
    }
  }
  return flights
}

/** One cross-section of the passage the stair needs cut through the masonry. */
export interface PassageSection {
  azimuthDeg: number
  innerRadius: number
  outerRadius: number
  bottomY: number
  topY: number
}

/**
 * The void a stair in a wall actually requires.
 *
 * Modelling treads inside solid masonry is not enough: without a passage cut
 * around them the steps are entombed, and the only reason a character seems to
 * climb is that the collider tunnels through the wall surface. A real stair in
 * a wall has a barrel-vaulted passage over it — this returns the sections of
 * that passage, to be swept into a solid and subtracted from the shell.
 */
export function stairPassageSections(
  flights: StepPlacement[][],
  width: number,
  headroom: number,
  /**
   * Radius of the room-side wall face at a height. The passage must be cut back
   * PAST it, otherwise the tunnel is sealed: the void exists inside the masonry
   * but no doorway connects it to any chamber, and a walker placed on the treads
   * is entombed. Open along its length is also what the photographs show — the
   * flight is a passage off the room, not a shaft.
   */
  innerFaceRadiusAt: (y: number) => number,
  sideClearance = PASSAGE_SIDE_CLEARANCE,
  /**
   * Tolerance between the underside of a tread block and the floor of the cut,
   * metres. Only a tolerance — the depth itself is the flight's own riser, so
   * the stone below the passage rises with the stair and meets each tread.
   */
  footTolerance = PASSAGE_FOOT_TOLERANCE,
): PassageSection[][] {
  const half = width / 2 + sideClearance

  /**
   * Depth of the cut below a tread.
   *
   * The floor of the cut is NOT a staircase — it is lofted straight between one
   * step's section and the next, so halfway along a step it sits half a riser
   * higher than at the section itself. Drop it by only one riser and that loft
   * rises into the tread blocks and fills the risers, and the stair renders as a
   * smooth ramp with the steps swallowed. One and a half risers puts the loft
   * exactly on the underside of the treads at the midpoints, which is as close
   * as a linear sweep can sit without eating them.
   */
  const riserOf = (steps: StepPlacement[]): number =>
    steps.length > 1 ? Math.abs(steps[1].treadY - steps[0].treadY) : 0.2

  const sectionAt = (
    s: StepPlacement,
    riser: number,
    azimuthDeg = s.azimuthDeg,
  ): PassageSection => {
    /**
     * The passage stays INSIDE the masonry.
     *
     * It used to be cut back 0.35 m past the room face, which opened the flight
     * to the room along its whole length and made the stair read as a shelf in
     * an open niche. Walkthrough footage of the tower settles it: the stair is a
     * closed, vaulted tunnel in the wall, entered through an arched doorway at
     * each storey. Those doorways are cut separately — see stairDoorways().
     */
    /*
     * Clamped to the room's face at THIS step's height. The side clearance is
     * there to keep the tread off the passage wall, but taken on the inner side
     * it cuts 0.06 m past the face and reopens the niche the whole point was to
     * close. Inward the flight abuts the wall, as the source says; the clearance
     * survives on the outer side, where there is 5 m of masonry to take it.
     */
    return {
      azimuthDeg,
      innerRadius: Math.max(0.05, s.midRadius - half, innerFaceRadiusAt(s.treadY)),
      outerRadius: s.midRadius + half,
      // one and a half risers down, so the lofted floor meets the treads' underside
      bottomY: s.treadY - 1.5 * Math.max(0.12, riser) - footTolerance,
      topY: s.treadY + headroom,
    }
  }

  /**
   * ONE continuous tube for the whole stair, not one per flight.
   *
   * Per-flight tools were the first attempt, out of a worry that a single sweep
   * would wrap past itself and hand the CSG evaluator a self-intersecting solid.
   * It does not: the helix turns about 1.4 times over the whole 23.6 m climb, so
   * a full turn takes some 17 m of height while the tube is only 2.6 m tall — it
   * never catches its own lower course. The per-flight version, meanwhile, put a
   * flat end cap at every landing, and a cap is a wall of solid stone straight
   * across the passage. Walking the model, that is exactly where the climb
   * stopped: at the head of the first flight, facing masonry.
   *
   * Lead-in and lead-out carry the two remaining caps one step past the bottom
   * and top treads, so neither stands where anyone walks. A real stair in a wall
   * starts at a doorway off the room and ends at a landing, not flush with a
   * tread.
   */
  // each step carries its own flight's riser, since storeys round to different ones
  const steps: Array<{ step: StepPlacement; riser: number }> = []
  for (const flight of flights) {
    const riser = riserOf(flight)
    for (const step of flight) steps.push({ step, riser })
  }

  const body = steps.map(({ step, riser }) => sectionAt(step, riser))
  if (body.length < 2) return [body]

  const first = steps[0]
  const last = steps[steps.length - 1]
  const leadIn = first.step.azimuthDeg - (steps[1].step.azimuthDeg - first.step.azimuthDeg)
  const leadOut =
    last.step.azimuthDeg + (last.step.azimuthDeg - steps[steps.length - 2].step.azimuthDeg)
  return [
    [
      sectionAt(first.step, first.riser, leadIn),
      ...body,
      sectionAt(last.step, last.riser, leadOut),
    ],
  ]
}

/** Clearance kept either side of the flight inside the passage, metres. */
export const PASSAGE_SIDE_CLEARANCE = 0.06
/** Tolerance between a tread's underside and the floor of the cut, metres. */
export const PASSAGE_FOOT_TOLERANCE = 0.02

/**
 * How deep a tread block is: from its own surface all the way DOWN to the floor
 * of the passage cut, not one riser.
 *
 * A tread one riser thick is a plank on nothing. Under each nosing there was a
 * half-riser void down to the bed, and beside each end a 6 cm slot, so the
 * flight read as a stack of floating slabs with black gaps — "дырявая
 * лестница". Cut stone steps are monolithic with their risers: carrying every
 * tread down to the passage floor makes consecutive treads overlap vertically
 * and the flight becomes one solid stepped mass.
 *
 * Must track stairPassageSections()' own bottomY, or the tread either floats
 * again or pushes through the floor beneath it.
 */
export function treadDepth(riser: number): number {
  return 1.5 * Math.max(0.12, riser) + PASSAGE_FOOT_TOLERANCE
}

/**
 * The treads as annular sectors — the shape a winder tread actually has.
 *
 * They used to be straight boxes turned to each step's azimuth. A chord set on
 * a circle cannot meet its neighbour: consecutive treads splay apart on the
 * outer edge and interpenetrate on the inner one, and the wedge between them
 * reads in-game as a thin shard sticking out of the stair. Cutting them as
 * sectors of the angular width the step already carries makes each tread meet
 * the next exactly, because step i+1's azimuth is step i's plus that width.
 *
 * Returned as flat arrays so this module stays three.js-free (CLAUDE.md rule 6).
 */
export function stairTreadVertices(
  steps: StepPlacement[],
  width: number,
  thicknessOf: (s: StepPlacement) => number,
  arcSegments = 3,
): { positions: number[]; indices: number[] } {
  const positions: number[] = []
  const indices: number[] = []
  const DEG = Math.PI / 180

  for (const s of steps) {
    const base = positions.length / 3
    const inner = s.midRadius - width / 2
    const outer = s.midRadius + width / 2
    const top = s.treadY
    const bottom = s.treadY - thicknessOf(s)
    const half = s.angularWidthDeg / 2

    for (let k = 0; k <= arcSegments; k++) {
      const az = (s.azimuthDeg - half + (s.angularWidthDeg * k) / arcSegments) * DEG
      const dx = Math.sin(az)
      const dz = -Math.cos(az)
      // four per station: inner-bottom, outer-bottom, outer-top, inner-top
      positions.push(dx * inner, bottom, dz * inner)
      positions.push(dx * outer, bottom, dz * outer)
      positions.push(dx * outer, top, dz * outer)
      positions.push(dx * inner, top, dz * inner)
    }

    /*
     * Winding, and it matters more than it looks.
     *
     * The station loop runs inner-bottom → outer-bottom → outer-top → inner-top
     * while the sweep advances with increasing azimuth. Taken in that order the
     * faces come out INSIDE-OUT — the bottom face's normal points up, the top
     * face's points down — so with backface culling the treads render as hollow
     * shells and the flight reads as full of holes. Reversed, they are solid.
     */
    for (let k = 0; k < arcSegments; k++) {
      const a = base + k * 4
      const b = base + (k + 1) * 4
      for (let f = 0; f < 4; f++) {
        const g = (f + 1) % 4
        indices.push(a + f, b + g, b + f)
        indices.push(a + f, a + g, b + g)
      }
    }
    /*
     * The two radial end faces — the riser you tread against, and the back of
     * the step above it. These were wound the wrong way round: both came out
     * inside-out, so from the side you happened to be climbing, the riser was a
     * backface and the eye went straight through the stair to whatever lay
     * beyond. That is the "hollow" look — the tread stone is there, but a
     * quarter of its faces are not drawn.
     */
    const last = base + arcSegments * 4
    indices.push(base + 0, base + 2, base + 1, base + 0, base + 3, base + 2)
    indices.push(last + 0, last + 1, last + 2, last + 0, last + 2, last + 3)
  }

  return { positions, indices }
}

/**
 * Where a flight is entered or left at one of its ends — the ONE rule the
 * doorway and the ramp up to it must both obey.
 *
 * Half a flight-width along the climb from the end tread. Both the opening in
 * the masonry and the walking surface leading to it are placed by this, because
 * when they were placed separately they drifted apart by exactly that half width
 * and the walker met a jamb where the ramp said there was a way through.
 */
export function approachAzimuthDeg(
  steps: StepPlacement[],
  endTread: StepPlacement,
  width: number,
): number {
  if (steps.length < 2) return endTread.azimuthDeg
  const halfWidthDeg = ((width / Math.max(0.5, endTread.midRadius)) * (180 / Math.PI)) / 2
  const climbDir = Math.sign(steps[1].azimuthDeg - steps[0].azimuthDeg)
  return endTread.azimuthDeg + halfWidthDeg * climbDir
}

/** An arched doorway between a room and the stair passage. */
export interface StairDoorway {
  azimuthDeg: number
  /** Angular width of the opening, degrees. */
  widthDeg: number
  bottomY: number
  topY: number
  /** Reaches into the room. */
  innerRadius: number
  /** Reaches into the passage. */
  outerRadius: number
}

/**
 * The doorways that let you onto the stair.
 *
 * With the passage sealed inside the masonry, each flight needs a way in at its
 * foot and a way out at its head — which is what the tower actually has: an
 * arched opening at floor level, the width of the flight, with the steps
 * starting immediately behind it.
 *
 * The head of one flight and the foot of the next sit at the same storey but at
 * different azimuths (the helix moves on), so both are emitted; they are a few
 * degrees apart and simply read as one landing.
 */
export function stairDoorways(
  flights: StepPlacement[][],
  width: number,
  height: number,
  innerFaceRadiusAt: (y: number) => number,
  floorYOf: (flightIndex: number, end: 'foot' | 'head') => number,
  /** Floor slab thickness, so the threshold can be dropped clear of it. */
  slabThickness = 0.3,
  /**
   * Per flight, the floor levels it runs PAST and opens onto partway along.
   *
   * Only 4→6 has any: it is one flight spanning two storey heights, and storey 5
   * is reached from the middle of it rather than from its head. Without this the
   * middle storey has no way onto the stair at all.
   */
  opensAtYPerFlight: number[][] = [],
  /**
   * Clear width of the OPENING, which need not be the flight's width — and had
   * better not be. A flight 0.9 m wide needs 0.9 m of tread; a walker arriving
   * across the landing has to TURN through the doorway, and 0.6 m of walker
   * turning into a 0.9 m hole catches on the jamb. Measured, that stopped the
   * climb at storey 3.
   *
   * Note carefully that the AZIMUTH still comes from the flight width, via
   * approachAzimuthDeg — the opening and the ramp up to it must share a centre
   * line or they drift apart and the walker meets a jamb where the ramp says
   * there is a way through. Only the opening's angular EXTENT widens.
   */
  doorwayWidth = width,
): StairDoorway[] {
  const out: StairDoorway[] = []

  const doorwayAt = (all: StepPlacement[], s: StepPlacement, floorY: number): StairDoorway => {
    // reach past the room face so the opening is a hole, not a blind recess
    const inner = Math.min(innerFaceRadiusAt(floorY) - 0.25, s.midRadius - doorwayWidth / 2)
    // the same azimuth the ramp up to it uses — see approachAzimuthDeg()
    const azimuthDeg = approachAzimuthDeg(all, s, width)
    /*
     * The head is measured from whatever the walker is standing on IN the
     * opening, not from the floor of the room.
     *
     * The ramp onto the flight climbs inside the doorway — half a flight-width
     * along, the treads are already two or three risers up. A head fixed at
     * floor level therefore came down on the walker halfway through the opening:
     * measured, feet at 4.05 m under a lintel at 5.90 m with 1.75 m of walker
     * between them, and the climb stopped in the doorway itself.
     */
    const underfoot = all.reduce((best, cur) =>
      Math.abs(cur.azimuthDeg - azimuthDeg) < Math.abs(best.azimuthDeg - azimuthDeg) ? cur : best,
    )
    return {
      azimuthDeg,
      widthDeg: (doorwayWidth / Math.max(0.5, s.midRadius)) * (180 / Math.PI),
      /**
       * The threshold sits BELOW the floor, not at it.
       *
       * A doorway is an arc a couple of steps wide, so a sill cut at floor
       * level hangs over the tread just short of the landing: measured, that
       * left 0.16 m of headroom on the second-to-last step of a flight — you
       * could not get from the stair onto the floor. Dropping it clear of the
       * slab removes the lip; the room's own floor slab covers the notch.
       */
      bottomY: floorY - slabThickness - 0.15,
      topY: Math.max(floorY, underfoot.treadY) + height,
      innerRadius: Math.max(0.05, inner),
      outerRadius: s.midRadius + doorwayWidth / 2 + 0.06,
    }
  }

  flights.forEach((steps, i) => {
    if (steps.length === 0) return
    for (const end of ['foot', 'head'] as const) {
      const s = end === 'foot' ? steps[0] : steps[steps.length - 1]
      out.push(doorwayAt(steps, s, floorYOf(i, end)))
    }
    // and the openings partway along, for a flight that passes a storey
    for (const floorY of opensAtYPerFlight[i] ?? []) {
      // the tread nearest that level IS the landing there — the flight does not
      // pause for it, you simply step off sideways where it goes by
      const s = steps.reduce((best, cur) =>
        Math.abs(cur.treadY - floorY) < Math.abs(best.treadY - floorY) ? cur : best,
      )
      out.push(doorwayAt(steps, s, floorY))
    }
  })
  return out
}

/**
 * The walking surface that gets you between a room and the end of a flight,
 * expressed as a pair of points the ramp chain can be built from.
 *
 * Walking the model, the stair was unreachable: you crossed the doorway, hit
 * something invisible and stopped, a metre short of the first tread. Nothing was
 * in the way — a ray cast in ANY direction from the walker found no surface
 * nearer than 0.48 m. Two things were wrong at once.
 *
 * First, the floor ran out: the room's slab colliders stop at the wall face and
 * the flight's ramp chain begins under the first tread a quarter of a metre
 * further out, with nothing between. The shell draws a floor there — the passage
 * bed — but the bed is CSG geometry and carries no collider.
 *
 * Second, and this is why simply filling the gap was not enough, the ramp chain
 * presents a VERTICAL SIDE FACE to anyone arriving across it. The chain replaces
 * the treads with an inclined slab; approached from the flight it is a smooth
 * slope, but approached from the room it is a 0.3 m wall standing at the tread
 * line, and the character controller would not climb it.
 *
 * So the approach is a ramp too, on the same principle as the flight: one
 * inclined box from the room's floor up to the first tread, and one level box
 * from the last tread back into the room above. Nothing vertical anywhere along
 * the way in. Once placed ON the stair the walker already climbed all seven
 * flights without a stumble, which is what made this so hard to see.
 */
export function stairApproaches(
  flights: StepPlacement[][],
  width: number,
  innerFaceRadiusAt: (y: number) => number,
  floorYOf: (flightIndex: number, end: 'foot' | 'head') => number,
  /** Per flight, floor levels it runs PAST and opens onto — see stairDoorways(). */
  opensAtYPerFlight: number[][] = [],
): Array<[StepApproachPoint, StepApproachPoint]> {
  const out: Array<[StepApproachPoint, StepApproachPoint]> = []
  flights.forEach((steps, i) => {
    if (steps.length < 2) return
    /*
     * BOTH ends of every flight, now that the flights are genuinely separate.
     *
     * While the model had one helix running the full height, a flight above the
     * bottom needed no way in at its foot: it began a few degrees past where the
     * one below arrived and the two were one continuous ramp. The tower is not
     * built that way. Each flight starts at its own doorway off a chamber, so
     * each needs its own ramp up off that chamber's floor, or its bottom tread
     * stands 0.2 m proud of the floor with nothing leading to it — and this
     * character controller will not climb a step of any height.
     */
    const nearestTo = (azimuthDeg: number) =>
      steps.reduce((best, cur) =>
        Math.abs(cur.azimuthDeg - azimuthDeg) < Math.abs(best.azimuthDeg - azimuthDeg) ? cur : best,
      )

    /*
     * EVERY approach is pushed one half-width ALONG the climb, and then anchored
     * on whatever tread it actually lands next to.
     *
     * Both halves of that matter, and both were learnt the hard way.
     *
     * The shift: an approach centred on the end tread straddles it, reaching back
     * over the treads below, which are a riser and two risers lower. A slab laid
     * over a descending flight is a wall across it. Unshifted at the foot, this
     * put the next flight's ramp 0.19 m proud of the top treads of the flight
     * below, and the climb stopped two steps short of storey 3 at az 145.
     *
     * The anchor: having moved along the flight, the approach must meet it at the
     * height the flight HAS THERE, not at the height of the end tread it was
     * named after. Otherwise the shift simply trades a wall at one end for a lip
     * at the other, and this character controller will not climb a lip either.
     *
     * TRIED AND REVERTED: anchoring the foot ramp on the END TREAD's height
     * instead, so it climbs one riser over a metre — 10° — rather than the two
     * or three risers the shifted-azimuth tread gives. It is gentler, and it
     * makes things WORSE. Walked, the climb then stopped at storey 2 instead of
     * storey 3: a ramp that ends one riser up no longer reaches the flight,
     * which by then is two or three risers higher at that azimuth, so the walker
     * arrives at the ramp's top facing the flight's side as a ledge. The steep
     * anchor is doing necessary work. Whatever fixes the storey-3 hand-off, it
     * is not this.
     */
    const approach = (endTread: StepPlacement, floorY: number, level: boolean) => {
      const azimuthDeg = approachAzimuthDeg(steps, endTread, width)
      const anchor = level ? endTread : nearestTo(azimuthDeg)
      out.push([
        /*
         * Far enough inside the room to overlap its floor slab, whose colliders
         * stop at the wall face. Butting the two would leave a seam the character
         * controller can catch on, and a seam is what this exists to remove.
         */
        {
          azimuthDeg,
          treadY: floorY,
          midRadius: Math.max(0.5, innerFaceRadiusAt(floorY) - 0.35),
        },
        {
          azimuthDeg,
          // the head is level: planFlight lands its top tread flush with the
          // floor above, and past that tread the flight has no more treads to
          // follow, so there is nothing to anchor to but the floor itself
          treadY: level ? floorY : anchor.treadY,
          midRadius: anchor.midRadius,
        },
      ])
      // always room-end first, so the box's own slope runs the way it is walked
    }

    /*
     * THE FOOT RAMP RUNS TANGENTIALLY, along the way the walker is travelling.
     *
     * This is what defeated three attempts. The approaches climbed RADIALLY —
     * inward end to outward end at one azimuth — while a walker arriving off the
     * flight below is moving TANGENTIALLY, around the helix. So they always met
     * it broadside, and a ramp met broadside is a ledge however gentle its slope.
     * Measured at storey 3: standing at 7.255 m facing a surface at 7.39, free to
     * move in the four downhill directions and stuck in all four uphill ones,
     * with no ray from the capsule centre able to see the thing at all.
     *
     * Running it along the travel direction instead — from the storey floor at
     * the previous flight's head, round to this flight's first tread — makes it a
     * continuation of the walk rather than something crossing it.
     *
     * The BOTTOM flight keeps the radial ramp: nobody arrives at it along a
     * flight, they walk out of the chamber, and radial is the way they come.
     */
    const previous = i > 0 ? flights[i - 1] : null
    if (previous && previous.length >= 2) {
      const floorY = floorYOf(i, 'foot')
      /*
       * Start at the previous flight's LAST TREAD, not at its landing. The
       * landing is pushed half a flight-width along the climb and so sits almost
       * on top of this flight's first tread — a hand-off from there had 0.14 m of
       * run for 0.19 m of rise. From the last tread the run is a full step angle,
       * the rise is one riser, and the slope comes out the same as the stair's
       * own. Which is what it is: the flights are one helix, and the hand-off is
       * simply the step between them.
       */
      const from = previous[previous.length - 1]
      out.push([
        { azimuthDeg: from.azimuthDeg, treadY: floorY, midRadius: from.midRadius },
        { azimuthDeg: steps[0].azimuthDeg, treadY: steps[0].treadY, midRadius: steps[0].midRadius },
      ])
    } else {
      approach(steps[0], floorYOf(i, 'foot'), false)
    }
    approach(steps[steps.length - 1], floorYOf(i, 'head'), true)

    /*
     * And a landing where the flight merely PASSES a storey — 4→6 opening onto
     * storey 5. The flight does not stop there, so the tread nearest that level
     * is where you step off, and the landing is a ramp from it down to the
     * chamber floor, exactly like a foot approach taken the other way.
     */
    for (const floorY of opensAtYPerFlight[i] ?? []) {
      /*
       * LEVEL, like a head landing — not a ramp like a foot approach.
       *
       * This is the last place the radial ramp survived, and it is the one place
       * a flight runs straight past. A ramp rising to a tread's height here
       * stands proud of the flight it crosses, and the climber going by meets it
       * broadside: the same ledge that stopped the climb at storey 3, in the
       * middle of the 4→6 run instead of at its end. Level at the storey floor,
       * the landing is within half a riser of the flight wherever they meet,
       * because the tread chosen is the one nearest that floor.
       */
      approach(
        steps.reduce((best, cur) =>
          Math.abs(cur.treadY - floorY) < Math.abs(best.treadY - floorY) ? cur : best,
        ),
        floorY,
        true,
      )
    }
  })
  return out
}

/** A point on the walking line: what stairRampBoxes() needs, nothing more. */
export interface StepApproachPoint {
  azimuthDeg: number
  treadY: number
  midRadius: number
}

/**
 * True when the whole flight stays inside the masonry: its outer edge must not
 * break through the outer face, and its inner edge must not overhang the room.
 */
export function flightFitsInWall(
  innerRadius: number,
  width: number,
  innerFaceRadius: number,
  outerFaceRadius: number,
): boolean {
  return innerRadius >= innerFaceRadius && innerRadius + width <= outerFaceRadius
}
