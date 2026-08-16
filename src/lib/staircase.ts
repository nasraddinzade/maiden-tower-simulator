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
 * NO LONGER UNRESOLVED, and not yet settled either. The Phase-4 spec assumed
 * 'clockwise' and asked for it to be checked against reference-photos/interior/.
 * That could not be done: the two photographs of the HISTORIC stair-in-wall
 * disagree — in `Qız qalası mərtəbələrarası pilləkən.JPG` the treads' narrow ends
 * read as being on the right, while the Dreamstime frame reads as curving the
 * other way. (The other spiral photographs in the set show the MODERN visitor
 * stair, which winds about a central newel and tells us nothing about the
 * original.)
 *
 * [2026-08-14] The owner's walkthrough footage replaces both of them. Read four
 * times independently, three of the readings resolve the tread wedge and all
 * three put the narrow end on the CLIMBER'S LEFT — which is 'counterclockwise'
 * here, and is what STAIR.winding already said. Frames, the handrail argument
 * and the reason this is still called a strong reading rather than a measurement
 * are all on STAIR.winding in config/tower.ts. It stays a parameter, and the
 * leva switch stays live, until someone who has walked it says the word.
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
  /**
   * Heights at which the flight stops rising and runs level for a while.
   *
   * A landing is not a separate flight here, and that is deliberate. Split into
   * two runs it would need a floor to start and end at, and stairDoorways()
   * would cut an opening into whatever is at that height — which, halfway up the
   * wall between storey 8 and the roof, is solid masonry. Expressed as treads
   * that happen not to rise, everything downstream follows for free: the passage
   * runs level over it, the ramp chain lies flat, and no doorway is invented.
   */
  landingsAtY?: number[]
  /** Arc length of each landing along the walking line, metres. */
  landingLength?: number
  /**
   * Arc length of the LEVEL PLATFORM at each end of the flight, metres.
   *
   * Without it a doorway opens straight onto the nosing of the first step, and
   * behind the doorway's own depth there is nothing but the end cap of the
   * passage — which reads from the chamber as a raw rectangular pocket cut into
   * the wall, flat-faced and unfinished, because that is exactly what it is. A
   * stair in a wall is entered onto a landing; the landing is what the doorway
   * opens onto and what hides the cut.
   */
  endLandingLength?: number
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
  const emit = (treadY: number) => {
    const midRadius = p.innerRadiusAt(treadY) + p.width / 2
    // the going is held constant along the walking line, so a wider course
    // higher up turns through a smaller angle
    const dAngle = stepAngleDeg(p.goingTarget, midRadius) * sign
    steps.push({
      index: steps.length,
      azimuthDeg: azimuth,
      angularWidthDeg: Math.abs(dAngle),
      treadY,
      midRadius,
    })
    azimuth += dAngle
  }

  const landings = [...(p.landingsAtY ?? [])].sort((a, b) => a - b)
  const landingTreads = Math.max(
    1,
    Math.round((p.landingLength ?? p.goingTarget * 4) / p.goingTarget),
  )
  const endTreads = p.endLandingLength
    ? Math.max(1, Math.round(p.endLandingLength / p.goingTarget))
    : 0
  let next = 0

  // the landing you step onto from the room, level with its floor
  for (let k = 0; k < endTreads; k++) emit(p.fromY)

  for (let i = 0; i < count; i++) {
    // tread i is the surface you arrive on after climbing i+1 risers
    const treadY = p.fromY + riser * (i + 1)
    emit(treadY)
    /*
     * The landing goes AFTER the tread that first reaches its level, so the
     * walker arrives on the flat rather than stepping up onto it. Its treads
     * repeat that height, which is what makes it level; the riser count is
     * untouched, so the flight still lands exactly on toY.
     */
    while (next < landings.length && treadY >= landings[next] - 1e-6) {
      for (let k = 0; k < landingTreads; k++) emit(treadY)
      next += 1
    }
  }

  // and the landing at the head, level with the floor the flight arrives on
  for (let k = 0; k < endTreads; k++) emit(p.toY)

  return steps
}

/**
 * The riser a flight actually climbs by, taken from the steps themselves.
 *
 * NOT rise / step-count. A flight with a landing in it has treads that do not
 * rise, so dividing the total by the number of treads gives a riser smaller than
 * any real one — and everything derived from it shrinks with it. treadDepth()
 * would then cut the tread blocks thinner than the drop to the passage floor and
 * the flight would go hollow again, which is the fault this project has spent
 * the longest chasing. The largest step between consecutive treads is the riser
 * the mason cut; the level ones are the landing.
 */
export function flightRiser(steps: StepPlacement[], fallback = 0.2): number {
  let riser = 0
  for (let i = 1; i < steps.length; i += 1) {
    riser = Math.max(riser, Math.abs(steps[i].treadY - steps[i - 1].treadY))
  }
  return riser > 1e-6 ? riser : fallback
}

/** Total angle a flight sweeps, degrees (unsigned). */
export function flightArcDeg(steps: StepPlacement[]): number {
  if (steps.length < 2) return steps.length ? steps[0].angularWidthDeg : 0
  return Math.abs(steps[steps.length - 1].azimuthDeg - steps[0].azimuthDeg) + steps[0].angularWidthDeg
}

/**
 * Angular span of the opening the flight needs where it breaks through the
 * structure above it.
 *
 * IT IS MEASURED IN METRES OF HEADROOM, NOT IN STEPS, and that substitution is
 * the whole of this function's history.
 *
 * The rule has always meant the same thing: you do not meet the slab when your
 * FEET reach it, you meet it when your HEAD does, which is a body height and a
 * slab's thickness earlier. It used to say that by counting steps — round
 * (walkerHeight + slabThickness) up to a whole number of risers and open the
 * last N — and a step count is only a height if every step rises. Two things
 * broke it, and on 2026-08-15 they broke it together, on the roof.
 *
 * The riser was read as `steps[1].treadY − steps[0].treadY`, and a flight begins
 * with a LEVEL PLATFORM (see FlightParams.endLandingLength), so steps 0, 1 and 2
 * are all at fromY and that difference is exactly zero. Zero fell through to the
 * old function's fallback of four steps, so EVERY opening in the tower — six of
 * them — was cut over the last four treads: 16.5° to 19.8° of arc where the rule
 * asked for 36° to 44°.
 *
 * And four-times-too-small was still not the fault, because the step count is
 * the wrong unit even when the riser is right. The roof climb has a LANDING in
 * it, five level treads at 25.109, 1.34 m under the paving's underside; they
 * spend 16.7° of arc and gain no height at all. Counting back ten steps from the
 * top gets you 36.4° of arc and lands in the middle of that landing, still 1.3 m
 * short of headroom. Counting back in METRES gets you the 70° the geometry
 * actually needs, and it gets there without knowing a landing exists.
 *
 * WHAT THE OWNER MET, before this was measured: he could not get out onto his
 * own roof. The paving is what roofs the last stretch of the roof climb — the
 * passage cutter is clamped to ROOF.masonryTopY, its underside — so the deck is
 * the ceiling there, and the opening cut in it began 43° too late. Walked, the
 * capsule's head met the underside of the paving at azimuth 183, 2.05 m below
 * the terrace and thirteen treads short of it, and the clearance fell to zero
 * from there on. The hole in the deck was real, correctly placed and visible
 * through the stair; nobody could reach it.
 *
 * `clearHeight` is PLAYER.stairHeadroom — the SAME number the vault over the
 * treads is cut to. That is deliberate and it is the point: the stair keeps one
 * clear height over every tread for its whole length, and whether the ceiling
 * there is a barrel vault in the drum or the slab it is about to come up
 * through makes no difference to the walker under it. Any second number here
 * would be a second answer to one question.
 *
 * The survivors are a contiguous tail because treads never descend, so the
 * opening is one arc at the head of the flight and never two.
 */
export function stairwellSpanDeg(
  steps: StepPlacement[],
  /** Underside of the structure being pierced — its top less its thickness. */
  soffitY: number,
  /** Clear height the stair must keep over every tread; see the note above. */
  clearHeight: number,
): { centreAzimuthDeg: number; widthDeg: number } | null {
  if (steps.length === 0) return null
  const tail = steps.filter((s) => s.treadY + clearHeight > soffitY)
  if (tail.length === 0) return null
  const first = tail[0].azimuthDeg
  const last = tail[tail.length - 1].azimuthDeg
  // a whole tread's width of margin at each end, so the opening never stops on
  // a nosing — the landing at the head is walked over, not aimed at
  const widthDeg = Math.abs(last - first) + tail[0].angularWidthDeg * 2
  return { centreAzimuthDeg: (first + last) / 2, widthDeg }
}

/**
 * The stairwell opening as a chain of straight tools, one arc at a time.
 *
 * A stairwell is an ANNULAR SECTOR — an arc of the surface, a metre deep
 * radially — and the thing that cuts it out of a lathe is a box. Over 16° of arc
 * a single box is a fair sector: its chord departs from the arc by 5.767 ×
 * (1/cos 8.2° − 1) = 0.06 m at the ends, which is lost in the paving's own
 * faceting. Over the 70° the roof needs it is not a sector at all. The box's
 * inner face is a PLANE at `innerRadius` along the arc's mid bearing, so at the
 * ends of a 70° arc it stands at 4.767 / cos 35° = 5.82 m: the tool cuts a hole
 * out near the parapet and leaves the stair roofed over. Widening the opening
 * without this would have replaced one wrong hole with a wronger one.
 *
 * So the arc is divided until each piece is no coarser than the surface being
 * cut, and each piece gets its own box on its own bearing. `maxArcDeg` is the
 * lathe's own angular step, passed in rather than chosen here: at that size the
 * chord error is 5.767 × (1/cos 1.875° − 1) = 3 mm, which is exactly the
 * faceting error the lathe already has, so the cut is as round as the stone.
 *
 * The pieces OVERLAP by `overlapFraction`. Butted exactly, two neighbouring
 * boxes share one plane down the middle of the opening and the CSG is asked to
 * resolve a coincident face — the tangency case this model has twice lost a
 * floor to. The overlap costs 6% of one piece's arc at each end of the opening,
 * two centimetres, and buys a boolean that cannot be coplanar with itself.
 *
 * Returned as plain numbers so the arithmetic stays out of the component and
 * inside the tested half of the codebase (CLAUDE.md rule 6).
 */
export interface StairwellCutTool {
  /** Bearing of this piece's own box. */
  azimuthDeg: number
  /** Radius of the box's centre: the opening's mid radius on that bearing. */
  midRadius: number
  /** Depth of the box radially — the opening's full radial band. */
  radialDepth: number
  /** Width of the box across the arc. */
  tangentialWidth: number
}

export function stairwellCutTools(
  centreAzimuthDeg: number,
  widthDeg: number,
  innerRadius: number,
  outerRadius: number,
  maxArcDeg: number,
  overlapFraction = 0.06,
): StairwellCutTool[] {
  if (widthDeg <= 0 || outerRadius <= innerRadius) return []
  const pieces = Math.max(1, Math.ceil(widthDeg / Math.max(1e-6, maxArcDeg)))
  const pieceDeg = widthDeg / pieces
  const start = centreAzimuthDeg - widthDeg / 2
  const out: StairwellCutTool[] = []
  for (let i = 0; i < pieces; i++) {
    out.push({
      azimuthDeg: start + pieceDeg * (i + 0.5),
      midRadius: (innerRadius + outerRadius) / 2,
      radialDepth: outerRadius - innerRadius,
      // the chord this piece subtends at the opening's OUTER edge, so the box
      // covers the sector out there rather than stopping short of it
      tangentialWidth:
        2 * outerRadius * Math.sin(((pieceDeg * (1 + overlapFraction)) / 2) * (Math.PI / 180)),
    })
  }
  return out
}

export interface StairSettings {
  winding: Winding
  riserTarget: number
  goingTarget: number
  width: number
  wallClearance: number
  startAzimuthDeg: number
  /** Arc length of a landing along the walking line, metres. */
  landingLength?: number
  /** Arc length of the level platform at each end of a flight, metres. */
  endLandingLength?: number
}

/** The part of a lift this function needs: two heights and nothing else. */
export interface FlightRun {
  fromY: number
  toY: number
  /** See FlightParams.landingsAtY. */
  landingsAtY?: number[]
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
 * EVERY FLIGHT STARTS AT THE SAME AZIMUTH. They are stacked one above another in
 * one sector of the wall, not chained into a single helix winding up the tower.
 *
 * The flights used to resume one step past where the previous ended, and the
 * argument for it was that the stair should keep turning the same way rather than
 * restart at an arbitrary azimuth. What that produced is a continuous 418° spiral
 * — one unbroken stair from storey 2 to the roof — and the owner, who has walked
 * the building, says that is wrong twice over. Their description of it separates
 * "a SPIRAL stair from the first storey to the second" from "a PASSAGE with a
 * stair" for every masonry lift above: the spiral is the modern steel insertion
 * in the middle of the chamber, and the historic lifts are discrete passages. A
 * chained helix makes all of them one thing.
 *
 * Stacking is the owner's answer to where they sit relative to each other: the
 * same place in the wall, one above the next. It also happens to be safe, and not
 * by luck — every flight climbs at the same rate per degree, because riser and
 * going are held constant, so stacked passages stay exactly parallel and keep the
 * storey height between them wherever they run. A passage is 2.6 m tall against a
 * 3.28 m storey, so they clear by 0.65 m along their whole length. There is a
 * test for that, since the clearance would vanish if either number moved.
 *
 * `innerRadiusOf` is injected so this stays independent of the config module and
 * can be exercised with synthetic towers in tests.
 */
export function planAllFlights(
  cfg: StairSettings,
  runs: FlightRun[],
  innerRadiusOf: (y: number) => number,
): StepPlacement[][] {
  const plan = (run: FlightRun, startAzimuthDeg: number) =>
    planFlight({
      fromY: run.fromY,
      toY: run.toY,
      startAzimuthDeg,
      innerRadiusAt: (y) => innerRadiusOf(y) + cfg.wallClearance,
      width: cfg.width,
      riserTarget: cfg.riserTarget,
      goingTarget: cfg.goingTarget,
      winding: cfg.winding,
      landingsAtY: run.landingsAtY,
      landingLength: cfg.landingLength,
      endLandingLength: cfg.endLandingLength,
    })

  return runs.map((run) => {
    const first = plan(run, cfg.startAzimuthDeg)
    /*
     * A LANDING HAS TO BE PAID FOR IN ARC, or it pushes the flight down onto the
     * one below.
     *
     * Level treads advance round the wall without gaining height, so past a
     * landing the flight is behind the stack: at any azimuth it sits lower than
     * an unbroken flight would by the landing's arc times the stair's gradient.
     * Measured on the roof climb, whose 1.2 m landing cost 0.82 m of height, that
     * closed the gap to the passage below from 3.28 m to 2.67 m — against a
     * passage 2.63 m tall. Four centimetres of stone between two tunnels.
     *
     * So a flight with landings starts that much arc EARLIER, and from the
     * landing onward it is exactly parallel to the stack again. The price is that
     * its doorway sits about a metre to one side of the others, which is a thing
     * you would not notice in the building and is the honest cost of the landing
     * being real.
     */
    /*
     * Only the landings INSIDE the climb are paid for.
     *
     * The platforms at the two ends consume arc as well, but every flight has
     * the same ones, so they shift the whole stack together and parallelism
     * survives. An interior landing is different: it belongs to one flight only,
     * and past it that flight falls behind the others.
     */
    const firstRise = first.findIndex((s, k) => k > 0 && s.treadY > first[k - 1].treadY)
    let lastRise = -1
    first.forEach((s, k) => {
      if (k > 0 && s.treadY > first[k - 1].treadY) lastRise = k
    })
    const landingArc =
      firstRise < 0
        ? 0
        : first.reduce(
            (arc, s, k) =>
              k > firstRise && k < lastRise && s.treadY === first[k - 1].treadY
                ? arc + s.angularWidthDeg
                : arc,
            0,
          )
    if (landingArc === 0) return first
    return plan(run, cfg.startAzimuthDeg - windingSign(cfg.winding) * landingArc)
  })
}

/** One cross-section of the passage the stair needs cut through the masonry. */
export interface PassageSection {
  azimuthDeg: number
  innerRadius: number
  outerRadius: number
  bottomY: number
  topY: number
  /**
   * THIS STRETCH OF PASSAGE HAS NO VAULT, because the drum's stone has run out.
   *
   * Set where `tread + headroom` came out above the top of the masonry, which in
   * this model happens over the last stretch of the roof climb and nowhere else.
   * `topY` is then the top of the stone rather than a crown, and the two are not
   * the same kind of thing: one is where a vault springs to, the other is where
   * the wall stops. Anything that draws or cuts these sections has to know which
   * it has been handed — a pointed vault whose crown is exactly the roof surface
   * is tangent to it, and tangency is the CSG case this model has twice lost a
   * floor to.
   *
   * WHAT IT MEANS CHANGED ON 2026-08-14 WITHOUT THE FLAG CHANGING. It used to be
   * a confession: the masonry top was TOWER.topY, so a flagged section was one
   * the cutter drove through the parapet ring, and the last steps really did come
   * out under open sky over a 50° breach. It is now a description of a lintel.
   * The masonry top is ROOF.masonryTopY — the underside of the paving — so a
   * flagged section is one that has the terrace's own paving course over it
   * rather than a vault, and where the flag runs on past the deck opening the
   * paving is what carries the roof across the stair. That is what a roof over a
   * stair mouth is made of.
   *
   * The tower is not open over its stair and never was: roof/007 and up/250 show
   * the stair arriving at deck level through a door under a head-house, with the
   * parapet running on unbroken past it. The model no longer says otherwise.
   */
  openToSky?: boolean
}

/**
 * How many treads at the FOOT of a flight are the level platform you enter onto,
 * rather than steps.
 *
 * THE LITTLE PLATFORM TO THE RIGHT OF THE WAY ONTO THE STAIR. [OWNER] 2026-08-16,
 * arrow on a screenshot of the foot doorway: «не должно быть той маленькой
 * площадки справа от входа на лестницу». Walked and measured before anything was
 * touched, at the foot of 2→3 (the first stair doorway a visitor meets, since the
 * lift below it is the modern spiral):
 *
 *   · the doorway spans azimuth 183.07–198.06, 1.10 m of arc at the walking line;
 *   · the flight's first RISER stands at 186.5, so the left quarter of the opening
 *     is stair and the right 0.85 m is level floor;
 *   · that floor does not stop at the far jamb. The walking surface is level from
 *     186.2 all the way to 219.2 — 33° of arc, 2.42 m — because the passage tube
 *     runs 1.50 m of lead-in out past the first tread to carry the slit at the
 *     passage's end;
 *   · and the two halves of it were cut at DIFFERENT DEPTHS. Raycast down the
 *     built shell: 3.781 (tread stone) out to azimuth 198.99, then 3.63 at 199.0,
 *     3.71 at 200.0, 3.76 from 201 on (shell stone). A 0.13 m slot at 198.99,
 *     0.155 m deep, standing 0.9° outside the doorway's far jamb, with a pale
 *     shelf of a different material beyond it.
 *
 * The slot is what makes it read as a PLATFORM rather than as floor: two stones
 * at two levels with a black line between them, seen through a doorway. It is
 * drawn geometry — the shell's CSG bed and the flight's tread blocks — and not a
 * collider; the ramp chain over it is one continuous inclined box and never had a
 * lip. This function is the fix: the sections over those treads are landing
 * sections, so the bed under the platform is the platform's own floor and the
 * whole thing is one plane from the first riser to the passage's end.
 *
 * THE HEAD HAS THE SAME TRENCH AND IS LEFT ALONE. There the platform's sections
 * are cut 1.5 risers under the storey and the lead-out at storey level, exactly as
 * here, and at the head of 2→3 the slot lands at azimuth 110.1. Raising that bed
 * is not the same edit at the top of the tower: the roof flight's platform IS the
 * deck at 26.749, its deep bed sits at 26.4215 and stairPassageSections()'
 * inStone() keeps a section only below masonryTopY 26.449 — so a landing bed at
 * 26.729 drops those three sections out of the tube, takes tube[last] with them
 * and moves head-8-9's cap and the slit centred on it. Six openings for a trench
 * nobody has complained about is not a trade this file may make on its own.
 *
 * WHAT THIS DOES NOT DO, said plainly because the owner will look for it: the
 * 1.50 m of level passage BEYOND the doorway is still there. It is the landing the
 * slit at the foot is centred on — planPassageOpenings() places every opening at
 * the middle of the arc between the end tread and the end cap — and shortening it
 * to the 1.36° the doorway actually needs collapses that arc from 20.44° to 4.09°,
 * which fitReveal() then clamps to a 0.17 m inner mouth against a 0.40 m outer
 * one: six foot slits that no longer flare inward. Measured: with the lead-in cut
 * to one step and the landing taken to the first riser instead, the six feet
 * survive (inner mouths 0.796–0.845 m, all still clear of the pier) but every one
 * of them moves 10–12° round the drum. That is the same bill approachAzimuthDeg()'s
 * note prices from the other side, and it is the owner's to settle.
 */
export function entryLandingTreads(steps: StepPlacement[]): number {
  /*
   * TWO TREADS, NOT ONE, and the reason is that one cannot be told apart.
   *
   * planFlight() lays the platform at fromY and then climbs, so with a one-tread
   * platform the list reads fromY, fromY+riser, fromY+2·riser — which is exactly
   * what a flight with NO platform reads, one riser lower. The step list does not
   * carry fromY, so nothing here can separate the two cases, and a rule that
   * guessed would cut the first STEP of every plain flight as a landing and hollow
   * the stair out under it. STAIR.endLandingLength is 0.9 m against a 0.3 m going,
   * so the platform is three treads and the question is academic; drop that number
   * below two treads' worth and this returns 0 and the trench comes back, visibly,
   * rather than silently doing the wrong thing.
   */
  if (steps.length < 2 || steps[1].treadY !== steps[0].treadY) return 0
  let n = 2
  while (n < steps.length && steps[n].treadY === steps[0].treadY) n += 1
  // a flight that never rises is not a flight with a platform on it
  return n === steps.length ? 0 : n
}

/**
 * THE PAVING OF A LANDING: the level stone that carries its floor from the end
 * tread out to the passage's end cap.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LITTLE PLATFORM BESIDE THE WAY ONTO THE STAIR. [OWNER], twice: «не должно
 * быть той маленькой площадки справа от входа на лестницу», then «справа с
 * лестницы маленькая площадка появляется, которой не должно быть».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * e96b76f measured the object and named its cause, and what it fixed was the
 * BED — the sections over the entry platform are landing sections now, so the
 * cut floor under a foot landing is one plane. That was right and it was not
 * enough, because the floor a walker SEES over a landing is not the bed. It is
 * the flight's own tread blocks, and they stop at the end tread. Cast down the
 * built shell at the foot of 2→3, r 4.20, at one-degree steps:
 *
 *     az 187…198   3.7811   tread stone
 *     az 199…217   3.7611   shell bed
 *     az 218       nothing  (past the cap)
 *
 * A slab of tread stone 0.94 m long standing 0.020 m proud of 1.33 m of paler
 * shell floor, with the join at azimuth 198.99 — INSIDE the doorway, which spans
 * 195.34…210.33. Two stones at two levels with a black line between them, seen
 * through a doorway: a little platform. Nothing about that changed when the
 * bed was levelled; only the trench beside it got shallower, from 0.155 m to
 * 0.020 m, which is why he saw it again.
 *
 * AND THE HEAD IS THE ONE HE MEANS BY «СПРАВА». e96b76f left the head's trench
 * on the ground that nobody had complained about it. Cast down the same shell at
 * the head of 2→3, r 4.35:
 *
 *     az  93…108   7.0423   shell bed (the lead-out)
 *     az 109       6.9841   the loft diving
 *     az 110       6.8959   ← 0.166 m of open slot, no stone over it
 *     az 111…126   7.0623   tread stone
 *
 * The head doorway spans 99.12…113.61 and you enter it FACING OUTWARD to go
 * down, so increasing azimuth is on your right: the platform, and the black slot
 * at its foot, stand on the right of the way onto the stair, 3.6° inside the far
 * jamb. It is the same object as the foot's and it is eight times deeper.
 *
 * WHAT THIS DOES. The landing is paved out to the cap at the end tread's own
 * level, in the end tread's own stone, one slab per section of lead. From the
 * first riser to the end of the passage the floor is then one plane and one
 * material, flush with the storey it serves, and the joins that are left are at
 * the two places a mason puts one: the riser, and the wall at the end of the
 * passage.
 *
 * WHY NOT RAISE THE BED INSTEAD, which is the obvious repair and is the one
 * thing that cannot be done. The bed has to stay strictly BELOW the doorway
 * cutter's own floor or the two tools meet on a plane, and on a landing that
 * floor is the storey level exactly (stairDoorways(), "ON A LANDING THE SILL IS
 * THE FLOOR"). So the bed's level is forced to storey − footTolerance, the
 * visible floor has to be storey level, and the only thing that can be both is
 * stone laid ON the bed. Which is what a landing in a wall is: the cut is the
 * pocket, the paving is the floor. Every slab is a tread-depth thick, so it is
 * bedded 0.31 m into the stone under it and cannot read as a slab on a floor —
 * at a head that same depth is what buries the 0.166 m trench instead of filling
 * it, which is the edit e96b76f could not afford to make at the top of the tower.
 *
 * IT IS READ OFF THE CUT, NOT RE-DERIVED. The lead is `stairPassageSections()`'
 * own business — how far past the end tread it runs is a rule about doorways that
 * has already been rewritten twice this week — so this takes the TUBE and lays a
 * slab on each section of it that stands past the end tread. There is no second
 * expression for the length of a landing to drift from the first, and no way for
 * the paving to reach a degree further than the void it lies in.
 *
 * That also settles where there must be NO paving, without a rule of its own.
 * The cutter's inStone() has already dropped every lead section whose floor is
 * above the top of the stone, which at the roof is all of them: the last flight's
 * head landing IS the deck, and the stair leaves through the opening in the
 * paving rather than along a tunnel. So eleven ends are paved and the twelfth
 * gets nothing, because there is nothing there to pave — and a strip of stair
 * stone across the open terrace is not something this can produce.
 *
 * IT MOVES NOTHING. No section, no cap, no doorway, no opening and no collider is
 * derived from this; it is drawn stone, and nothing reads it back.
 */
export function landingPaving(
  steps: StepPlacement[],
  /** The flight's own passage, as stairPassageSections() cut it. */
  tube: PassageSection[],
): StepPlacement[] {
  if (steps.length < 2 || tube.length === 0) return []

  const foot = steps[0]
  const head = steps[steps.length - 1]
  const climb = Math.sign(steps[1].azimuthDeg - steps[0].azimuthDeg)

  const out: StepPlacement[] = []
  const pave = (end: StepPlacement, lead: PassageSection[]) => {
    /*
     * Outward from the end tread, so each slab is exactly the step of lead it
     * covers. Taking the width from the section spacing rather than from the
     * flight's pitch is the same principle as taking the length from the tube:
     * the paving is a rubbing of the cut, so a slab cannot be wider than its own
     * bay however the cutter comes to lay them out.
     */
    const ordered = [...lead].sort(
      (a, b) =>
        Math.abs(a.azimuthDeg - end.azimuthDeg) - Math.abs(b.azimuthDeg - end.azimuthDeg),
    )
    let fromDeg = end.azimuthDeg
    for (const s of ordered) {
      out.push({
        index: out.length,
        azimuthDeg: s.azimuthDeg,
        angularWidthDeg: Math.abs(s.azimuthDeg - fromDeg),
        // the landing's own level and the flight's own walking line, so the
        // paving is flush with the end tread's block and laps into it
        treadY: end.treadY,
        midRadius: end.midRadius,
      })
      fromDeg = s.azimuthDeg
    }
  }
  // AWAY FROM THE FLIGHT AT BOTH ENDS, the sense stairPassageSections() carries
  // its lead-in and lead-out in — against the climb below, along it above
  pave(
    foot,
    tube.filter((s) => (s.azimuthDeg - foot.azimuthDeg) * climb < -1e-6),
  )
  pave(
    head,
    tube.filter((s) => (s.azimuthDeg - head.azimuthDeg) * climb > 1e-6),
  )
  return out
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
  /**
   * WORLD Y OF THE TOP OF THE STONE. A cutter may not remove stone that is not
   * there, and until 2026-08-10 this one claimed to.
   *
   * The vault is `tread + headroom` above every step, which is right in five
   * flights out of six and arithmetically impossible in the sixth. The roof
   * climb lands on the deck at 26.749 and the masonry stops at 27.500, so the
   * vault the rule asks for stands at 29.049 — 1.55 m of barrel vault in open
   * air. Nothing was ever built there, because the shell has no stone above
   * 27.500 for the tool to subtract (raycast over the built shell: max Y is
   * 27.500 at every azimuth outside the cut), which is exactly why this went
   * unnoticed: the lie was invisible.
   *
   * What the clamp changes is what the model ASSERTS. Without it,
   * `stairPassageSections()` describes a tunnel through a building that ends
   * 1.55 m below the tunnel's own crown, and everything reading the sections back
   * is handed that as a fact — passageEndAnchors() published 29.049 as the crown
   * of the roof flight's head opening, and fitReveal() then sized a 2.0 m reveal
   * against it and passed its own validator.
   *
   * IT IS NOT FREE, and the first attempt shipped believing it was. The surplus
   * was doing work nobody had noticed: it kept the cutter's crown clear of the
   * roof plane. Clamped exactly onto that plane the pointed vault becomes tangent
   * to it, the boolean is asked to resolve a tangency, and it leaves a curved lid
   * of parapet stone roofing the stair — measured on the built shell, solid at
   * 27.500 from azimuth 30 to 70 with the passage floor a metre below and nothing
   * in between. The clamp is only honest together with sectionProfile()'s
   * flattening of a vault that has nothing to spring from; see the note there.
   *
   * WHAT IT USED TO NOT DO, and the reason it now does. Callers passed
   * TOWER.topY, the top of the parapet, so over the last stretch of the roof
   * climb the cut went clean through the parapet ring for about 50° of arc and
   * the final steps came out under open sky. Clamping the cutter neither closed
   * that breach nor excused it, and the note here said so.
   *
   * WHAT THE CALLER PASSES NOW IS ROOF.masonryTopY — the underside of the terrace
   * paving, one paving course below the deck — and the breach is gone with it.
   * The owner's roof footage settled the shape (roof/016, roof/001, roof/007,
   * up/250): the paving crosses the whole thickness of the wall to a thin parapet
   * on the outer edge, the parapet is unbroken all the way round, and the stair
   * comes up through an opening in the deck. So over the passage the stone stops
   * at the paving's underside, not at the coping — the ring is 2 m further out
   * than the cutter ever reaches — and the last flagged sections are roofed by
   * the paving until the deck opening starts, which is where the stair mouth is.
   *
   * The clamp is the same clamp; only the level it is given is honest now. Do NOT
   * put it back to TOWER.topY to "simplify": the two levels are 1.00 m apart and
   * everything between them is either paving or air.
   */
  masonryTopY: number,
  sideClearance = PASSAGE_SIDE_CLEARANCE,
  /**
   * Clear width of the doorway at each end, so the tube can be carried out far
   * enough to contain it. See the lead-out note below.
   */
  doorwayWidth = width,
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
  const riserOf = (steps: StepPlacement[]): number => flightRiser(steps)

  const sectionAt = (
    s: StepPlacement,
    riser: number,
    azimuthDeg = s.azimuthDeg,
    /**
     * A LANDING section, not a section over a tread.
     *
     * The depth below is only ever there to clear the underside of a tread block,
     * and past the end of a flight there is no tread — the flight is drawn from
     * its own steps and stops with them. Cutting the lead sections a riser and a
     * half down anyway leaves a trench at the threshold: measured in the model at
     * the foot of flight 1, the passage floor stood at 6.73 where the storey is at
     * 7.06, a 0.33 m drop the width of the doorway, reading from the room as a
     * black slot beside the opening. Twelve flight ends, twelve trenches.
     *
     * So a lead section's floor is the LANDING's floor. The 0.02 m is not a
     * threshold detail — it keeps this cut's floor off the doorway cutter's own,
     * which sits exactly at the storey level. Two tools meeting on one plane is
     * what cost this model its stair floor once already.
     *
     * AND A TREAD THAT DOES NOT RISE IS A LANDING TOO, which is the half of this
     * the flag missed. The platform at a flight's foot is built as TREADS (see
     * FlightParams.endLandingLength), so the sections over it were cut a riser and
     * a half down while the lead beyond them was cut at floor level — and the
     * sweep lofts between the two. Measured at the foot of 2→3, the bed fell to
     * 3.626 at the outer edge of the last platform tread and came back to 3.761
     * one step later: a 0.13 m black slot standing exactly at the doorway's far
     * jamb, with the lead's floor beyond it reading as a SEPARATE little shelf
     * rather than as the same landing continuing. That slot and that shelf are
     * what the owner drew an arrow at on 2026-08-16; see entryLandingTreads().
     *
     * Raising the bed buries the platform's tread blocks in it, and that costs
     * nothing: a tread block is stone, the bed is stone, and the only face of
     * either that is ever seen is the tread's top.
     */
    landing = false,
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
    // one and a half risers down, so the lofted floor meets the treads' underside
    const bottomY = landing
      ? s.treadY - footTolerance
      : s.treadY - 1.5 * Math.max(0.12, riser) - footTolerance
    /*
     * The vault, or the top of the stone where the stone runs out first.
     *
     * Never below the floor of the cut, however low the masonry is said to stop:
     * an inverted section sweeps into a self-intersecting solid and the CSG that
     * follows it is undefined. A tread standing above the top of the building is
     * a fault in the lift table, not something a cutter should try to express by
     * turning itself inside out.
     */
    const wanted = s.treadY + headroom
    const topY = Math.max(bottomY + 1e-3, Math.min(wanted, masonryTopY))
    return {
      azimuthDeg,
      innerRadius: Math.max(0.05, s.midRadius - half, innerFaceRadiusAt(s.treadY)),
      outerRadius: s.midRadius + half,
      bottomY,
      topY,
      // the headroom asked for more stone than the building has: no vault here
      openToSky: wanted > masonryTopY + 1e-9,
    }
  }

  /**
   * ONE TUBE PER FLIGHT. Each passage is its own tunnel with two ends.
   *
   * This was a single continuous tube for the whole stair while the flights were
   * chained into one helix — it had to be, because a flat end cap in the middle
   * of a continuous climb is a wall of solid stone straight across the passage,
   * and walking the model that is exactly where the climb stopped: at the head of
   * the first flight, facing masonry.
   *
   * The flights are no longer chained. They stack in one sector of the wall, one
   * above the next, so a cap at the end of a flight is not a wall across anything
   * — it is the end of the passage, and you leave through the doorway cut in its
   * inner side. Which is the whole point of the change: this is what makes the
   * stair read as a series of passages rather than one endless spiral.
   *
   * Lead-in and lead-out still carry each tube's caps one step past its bottom
   * and top treads, so no cap stands where anyone walks. A stair in a wall starts
   * at a doorway off the room and ends at a landing, not flush with a tread.
   */
  /**
   * A SECTION WHOLLY ABOVE THE STONE IS NOT A SECTION, it is a sliver.
   *
   * The clamp above holds `topY` down to the masonry, and holds it off `bottomY`
   * by a millimetre so a section can never turn itself inside out. Where a
   * section's FLOOR is already above the stone those two rules fight: the result
   * is a 1 mm-tall cross-section which cuts nothing (there is nothing there to
   * cut) but still claims a passage, and the claim is read. It made the roof
   * climb's head cap a hand's breadth of stone standing at deck level.
   *
   * It only arises at the top of the tower, and only since the terrace was
   * built: the roof flight's last tread IS the deck, one paving course above the
   * masonry it is cut in, and the lead-out landings past it are higher still.
   * They are above the paving, in the open, on the terrace — the stair has left
   * the building by then and comes out through the deck opening. Dropping them
   * is the same rule as the clamp, one step further: a cutter may not remove
   * stone the building has not got, and it may not describe a tunnel there
   * either.
   */
  const inStone = (s: PassageSection) => s.bottomY < masonryTopY - 1e-9

  const tubes: PassageSection[][] = []
  for (const flight of flights) {
    if (flight.length === 0) continue
    // each flight carries its own riser, since storeys round to different ones
    const riser = riserOf(flight)
    /*
     * The platform you enter onto is cut as a landing, not as a stair.
     *
     * ONLY THE FOOT'S, and the head's identical trench is left alone on purpose —
     * see the note on entryLandingTreads() for the measurement and for what
     * raising the head's bed would drag with it at the top of the tower.
     */
    const entryTreads = entryLandingTreads(flight)
    const body = flight.map((step, k) => sectionAt(step, riser, step.azimuthDeg, k < entryTreads))
    if (flight.length < 2) {
      tubes.push(body.filter(inStone))
      continue
    }
    const stepAngle = flight[1].azimuthDeg - flight[0].azimuthDeg
    const last = flight[flight.length - 1]
    const lastAngle = last.azimuthDeg - flight[flight.length - 2].azimuthDeg

    /*
     * THE TUBE HAS TO REACH PAST THE DOORWAY, not one step past the last tread.
     *
     * A doorway is not centred on the end tread: approachAzimuthDeg pushes it
     * half a flight-width ALONG the climb so it stops straddling the treads
     * below, and then it spreads its own half-width either side. Measured, that
     * puts its far edge 13.3° beyond the last tread while a one-step lead-out
     * reached 4.1°. The 9° in between is doorway cut into masonry the passage
     * never reached — a blind rectangular pocket, 1.36 m deep and 2.4 m tall,
     * standing in the wall beside every stair exit. That is what the owner has
     * been calling unhewn.
     *
     * So each end runs out in whole steps until it covers the opening, and the
     * end section repeats the end tread's height, which keeps the lead flat and
     * makes it read as the landing continuing to the door.
     */
    const overrunDeg =
      ((width / 2 + doorwayWidth / 2) / Math.max(0.5, last.midRadius)) * (180 / Math.PI) +
      Math.abs(stepAngle)
    const leadSteps = Math.max(1, Math.ceil(overrunDeg / Math.abs(stepAngle)))

    const leadIn: PassageSection[] = []
    for (let k = leadSteps; k >= 1; k--) {
      leadIn.push(sectionAt(flight[0], riser, flight[0].azimuthDeg - stepAngle * k, true))
    }
    const leadOut: PassageSection[] = []
    for (let k = 1; k <= leadSteps; k++) {
      leadOut.push(sectionAt(last, riser, last.azimuthDeg + lastAngle * k, true))
    }
    tubes.push([...leadIn, ...body, ...leadOut].filter(inStone))
  }
  return tubes
}

/** Clearance kept either side of the flight inside the passage, metres. */
export const PASSAGE_SIDE_CLEARANCE = 0.06
/** See the overlap argument of stairTreadVertices(). */
export const TREAD_OVERLAP_FRACTION = 0.12
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
  /**
   * How far each tread is stretched past its own wedge, as a fraction of that
   * wedge, so consecutive treads INTERPENETRATE instead of meeting exactly.
   *
   * Meeting exactly is the obvious thing to want and it is wrong. Tread i+1 is
   * thicker than a riser — it has to be, or it would be a plank on nothing — so
   * its end face and tread i's end face are coplanar quads sharing the same
   * 0.12 m band of the same plane. The depth buffer cannot separate them, and
   * what shows in-game is a pure-black slit under the nosing of every step, the
   * whole way up the tower. It reads as a hole; it is two surfaces arguing.
   *
   * A little overlap buries both faces inside the neighbouring block. The value
   * is small enough that the treads' visible geometry is unchanged — the nosing
   * still lands where the walking line says it does — and large enough to be far
   * outside float precision at this scale.
   */
  overlapFraction = TREAD_OVERLAP_FRACTION,
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
    const half = (s.angularWidthDeg / 2) * (1 + overlapFraction)
    const span = half * 2

    for (let k = 0; k <= arcSegments; k++) {
      const az = (s.azimuthDeg - half + (span * k) / arcSegments) * DEG
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * "ALONG THE CLIMB" IS NOT THE SAME DIRECTION AT THE TWO ENDS, AND THE SLIT AT
 * A FOOT IS WHAT PAYS FOR IT. Measured 2026-08-16, and NOT acted on — see the
 * bill at the bottom, which is the owner's to settle and not this file's.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE COMPLAINT. [OWNER] 2026-08-16, of the model on screen: «окно при входе на
 * лестницу должно не на кривую направо выходить, а прямо» — the window at the
 * way onto the stair should not come out on a bend to the right, it should come
 * out straight. His screenshot has the reveal running off at an angle across the
 * passage.
 *
 * THE REVEAL IS NOT WHAT IS BENT, and that had to be ruled out before anything
 * else, because it is the obvious suspect and it is innocent. windowCutter()
 * aims the tool along the opening's own bearing and splays its cheeks
 * symmetrically about it, so the cut is radial and square to the passage cheek
 * it is made in — those are the same direction where a tunnel runs tangentially,
 * which this one does. Confirmed on the BUILT shell rather than argued: a
 * horizontal ray fan from (az 206.920, r 4.2, y 5.031), which is the axis of
 * foot-2-3, reaches 3.93/3.94/3.94/3.92 m at 204/206/208/210° and falls away
 * symmetrically either side — 3.45 against 3.41 at 202/212, 3.02 against 2.99 at
 * 200/214, 2.69 against 2.67 at 198/216. Symmetric about 207.0 ± 0.1 against a
 * nominal 206.920. There is no skew in the hole.
 *
 * WHAT WAS BENT IS THE WAY IN, AND IT IS STRAIGHT NOW. 2026-08-17. The lead-in
 * and the lead-out both run AWAY from the flight — see stairPassageSections(),
 * where leadIn walks back from the bottom tread and leadOut on past the top one
 * — so a landing is always on the far side of its end tread from the treads.
 * This function used to walk ALONG THE CLIMB at both ends, which is away from
 * the flight at a head and INTO it at a foot. So at every head the doorway landed
 * on the landing, and at every foot it landed over the flight's own second, third
 * and fourth treads, with the landing — and the slit cut in it — behind the
 * walker's right shoulder:
 *
 *     end        doorway   slit    apart    doorway arc ∩ slit's inner mouth
 *     foot-2-3    190.568  206.920  16.352°   0.257° of 18.23°
 *     foot-3-4    190.772  206.580  15.808°   0.280° of 17.69°
 *     foot-4-6    190.963  206.262  15.299°   0.275° of 17.12°
 *     foot-6-7    191.310  205.684  14.374°   0.198° of 15.97°
 *     foot-7-8    191.468  205.420  13.953°   0.163° of 15.44°
 *     foot-8-9    204.981  218.536  13.555°   0.130° of 14.94°
 *     head-2-3    106.365  102.413   3.952°  12.136° of 17.69°
 *     head-3-4    109.316  105.492   3.825°  11.750° of 17.12°
 *     head-4-6     50.438   46.844   3.594°  10.979° of 15.97°
 *     head-6-7    117.117  113.629   3.488°  10.627° of 15.44°
 *     head-7-8    119.417  116.028   3.389°  10.296° of 14.94°
 *     head-8-9    121.588  118.293   3.295°   9.983° of 14.47°
 *
 * That is the table AS THE FAULT LEFT IT, kept because it is the measurement the
 * repair is measured against. Six of six feet stood OUTSIDE the mouth of the
 * recess they serve; six of six heads stood inside it, more than half way across.
 * Standing in a foot doorway at r 4.2 the slit's outer mouth bore 222.5° against
 * a facing of 190.6 — 31.9° off the shoulder — and that is the picture he sent.
 * The six feet now read 202.628, 202.834 and so on, each one flight width round
 * from the figure above, and stairApproachSide.test.ts holds both columns.
 *
 * THE SLIT CANNOT BE THE THING THAT MOVES, which is why this note is here and
 * not in passageOpenings.ts. Its inner mouth is 18.23° of a 20.44° landing at the
 * lowest end, fitReveal() has already clamped eight of the twelve to fit, and
 * what is left after the 2° of jamb margin is 0.21° at the widest end, 0.07° at
 * the next and nothing at all at the other ten. It can be centred and nothing
 * else. planPassageOpenings() says as much — "the middle is the only position
 * that fits at every end" — and adds that choosing any other position would be
 * choosing one for its result, which is rule 7.
 *
 * THE ONE-LINE CHANGE, AND ITS BILL, WHICH HAS BEEN PAID. Sending the shift away
 * from the flight at both ends moves the six foot doorways 10.166…12.264° — one
 * flight width of arc, by construction — and makes every end read like a head:
 * 3.4–4.1° from its slit, 10.3–12.5° of overlap, and foot-N sitting exactly where
 * head-(N−1) sits, because the two share a landing. It moves NO opening: the
 * slits are placed off the tube's cap and tread bearings, and the tube does not
 * depend on this. Nor any doorway sill, head or rake — bottomY, topY and
 * bottomRake come out identical at all twelve ends. What it cost was 14
 * assertions in three files, and three of those are findings rather than
 * bookkeeping:
 *
 *   · chamberDaylight — the census goes from FOUR chambers of eight seeing the
 *     sky to SEVEN, with only storey 5 left dark, because a foot's slit now
 *     lights the room it opens off instead of only the steps. That retires
 *     chamberDaylight.test.ts's central finding and the argument built on it,
 *     that the quarter turn "is worth exactly two rooms": storeys 3 and 4 come
 *     lit at 90 with no turn at all, and STAIR_FROM_BUTTRESS_DEG has lost its
 *     most expensive consequence.
 *   · WELL.azimuthDeg — 171 was [OWNER] 2026-08-16's «колодец должен стоять рядом
 *     с проходом» turned into arithmetic, tangent to the near jamb of THIS
 *     doorway: 190.772 − 7.245 − 13.003 = 170.52. The doorway is at 202.628 now
 *     and the same derivation gives 182.38 → 182. His sentence is RELATIONAL, so
 *     the well follows its passage; leaving it at 171 would have kept the letter
 *     of his placement and lost all of its meaning. Its bill was re-priced with
 *     it — four passages breached instead of eight, half again as deep.
 *   · junctions — its "doorway inside its passage" check attributed a doorway to
 *     the first tube spanning its height, so foot-8-9 was measured against 7→8's
 *     tube and ran 7.2° off the end of the wrong one. That was the check's
 *     heuristic and not the geometry; it asks the flight now.
 *
 * WHY IT WAS NOT DONE ON 2026-08-16, and why that was wrong. The reasoning then
 * was that a screenshot may not re-decide how many rooms see daylight or move a
 * thing the owner placed by name the day before — the same treatment
 * STAIR_FROM_BUTTRESS_DEG gets. But those are not the same case. That number is
 * a MEASUREMENT nobody has, and this one is a SIGN that contradicts the passage
 * the doorway opens into; the model was not carrying an open question here, it
 * was carrying an error, and an error is not the owner's to ratify. He walked the
 * tower a second time and found it still there.
 *
 * approachOffsetTowardLandingDeg() below is the ruler. It reads +4.94…+5.93° at
 * all twelve ends now, and a negative number from it is the fault returning.
 */
export function approachAzimuthDeg(
  steps: StepPlacement[],
  endTread: StepPlacement,
  width: number,
): number {
  if (steps.length < 2) return endTread.azimuthDeg
  const halfWidthDeg = ((width / Math.max(0.5, endTread.midRadius)) * (180 / Math.PI)) / 2
  const climbDir = Math.sign(steps[1].azimuthDeg - steps[0].azimuthDeg)
  // AWAY FROM THE FLIGHT AT BOTH ENDS, which is against the climb at the bottom
  // tread and along it everywhere else — the sign that was wrong. A doorway
  // partway up a flight (only storey 5's, on the 4→6 run) has no landing to be
  // sent toward and keeps the shift it always had.
  const onward = endTread === steps[0] ? -climbDir : climbDir
  return endTread.azimuthDeg + halfWidthDeg * onward
}

/**
 * WHICH SIDE OF THE END TREAD THE WAY IN STANDS ON. Positive toward the landing.
 *
 * A RULER, NOT A REPAIR, in the sense rotationToDaylightDeg() is one: it reports
 * a quantity the model is currently wrong about and applies nothing. A caller
 * that adds this to a bearing is moving six doorways, a well and a daylight
 * census on its own authority — see the note on approachAzimuthDeg() for what
 * that costs and whose decision it is.
 *
 * Positive means the doorway stands on the landing, which is the far side of the
 * end tread from the flight and the side stairPassageSections() carries its lead
 * out to. Negative means it stands over the flight's own treads, and then the
 * landing — with the slit planPassageOpenings() centres on it — is behind the
 * walker rather than in front of him. As shipped it is +4.94…+5.93° at the six
 * heads and −5.08…−6.13° at the six feet, the same magnitude either way because
 * the magnitude is half a flight width and only the sign is in question.
 *
 * Which end an anchor is, taken by proximity rather than by identity: the
 * doorway partway along the 4→6 run belongs to neither end, and asking a tread
 * in the middle of a flight which end it is should get an answer rather than a
 * throw. It gets the nearer one, which is the truthful answer to a question
 * about a place.
 */
export function approachOffsetTowardLandingDeg(
  steps: StepPlacement[],
  endTread: StepPlacement,
  width: number,
): number {
  if (steps.length < 2) return 0
  const climbDir = Math.sign(steps[1].azimuthDeg - steps[0].azimuthDeg)
  const atFoot =
    Math.abs(endTread.azimuthDeg - steps[0].azimuthDeg) <=
    Math.abs(endTread.azimuthDeg - steps[steps.length - 1].azimuthDeg)
  // the lead runs away from the flight at both ends, so "toward the landing" is
  // against the climb at a foot and along it at a head
  const towardLanding = atFoot ? -climbDir : climbDir
  return (approachAzimuthDeg(steps, endTread, width) - endTread.azimuthDeg) * towardLanding
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
  /**
   * Rake of the sill and the head, metres of Y per metre of tangential offset
   * toward increasing azimuth.
   *
   * A doorway onto a rising stair is not a flat-bottomed hole. See the note on
   * the sill in stairDoorways(): a level sill wide enough to clear the lowest
   * tread under its arc necessarily digs a pit under the highest one.
   */
  bottomRake: number
  /**
   * NO ARCH OVER THIS ONE, because the wall ends before the head does.
   *
   * The same fact PassageSection.openToSky records. The roof exit used to be the
   * one doorway it applied to: its head wanted 2.1 m over a landing at 26.749
   * against masonry stopping at 27.500, so what stood over it was 0.751 m of
   * parapet, an arch struck in that gave a semicircle tangent to the roof plane,
   * and the boolean left a curved lid of stone over the way out.
   *
   * NOTHING SETS IT SINCE 2026-08-14 and the field is kept rather than deleted.
   * The roof exit is no longer a doorway at all — see hasWallAbove() below: a
   * landing at the top of the stone leaves through its ceiling, and the terrace's
   * paving is opened instead. But the case it describes is a property of the
   * rule, not of the roof: any doorway whose head outruns the stone it is cut in
   * is a notch rather than an arch, and the day one appears the cutter must still
   * be told. See doorwayCutter().
   */
  openToSky?: boolean
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
  /**
   * World Y of the top of the stone — see the long note on the same argument to
   * stairPassageSections(). It does two things here. It clamps an arch that
   * outruns its wall, which is what the roof exit used to need: its head came out
   * at 28.849 against masonry stopping at 27.500, so the arch was 1.35 m taller
   * than the wall it was cut in. And, since the terrace was built, it decides
   * whether a doorway exists at all — see hasWallAbove().
   */
  masonryTopY: number,
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

  const doorwayAt = (
    all: StepPlacement[],
    s: StepPlacement,
    floorY: number,
    /**
     * True where the flight ENDS at this floor. Past the top tread there is no
     * more stair to follow, so the threshold is the floor's, not the flight's.
     */
    atHead = false,
  ): StairDoorway => {
    // reach past the room face so the opening is a hole, not a blind recess
    const inner = Math.min(innerFaceRadiusAt(floorY) - 0.25, s.midRadius - doorwayWidth / 2)
    // the same azimuth the ramp up to it uses — see approachAzimuthDeg()
    const azimuthDeg = approachAzimuthDeg(all, s, width)
    const widthDeg = (doorwayWidth / Math.max(0.5, s.midRadius)) * (180 / Math.PI)

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

    /*
     * The sill goes as deep as it must and NOT ONE STEP DEEPER.
     *
     * Two constraints pull against each other and the old fixed drop honoured
     * only one of them.
     *
     * Downward: a doorway is an arc a couple of steps wide, so a sill cut at
     * floor level hangs over the tread just short of the landing — measured,
     * that left 0.16 m over the second-to-last step of a flight and you could
     * not get from the stair onto the floor. The sill must clear every tread
     * that passes under the arc.
     *
     * Upward: the doorway is a straight radial box, so whatever it cuts on the
     * room side it also cuts on the PASSAGE side, where the stone below the
     * treads is what the stair stands on. A flat drop of slab+0.15 sat 0.33 m
     * under the passage floor at the head of a flight and 0.65 m under it at the
     * foot, and the ray test over the built shell found the pit growing step by
     * step: 0.86 m of nothing under the first tread past a doorway, 1.07 under
     * the second, 1.27 under the third.
     *
     * Both are satisfied by taking the lowest tread under the arc and dropping
     * to the passage floor beneath THAT tread — clear of every tread in the
     * opening by construction, and never below the bed the stair rests on. The
     * old flat drop stays as a floor for the value so the room side still has no
     * lip where the arc happens to contain no low tread.
     */
    const riser = flightRiser(all)
    const stepAngle = all.length > 1 ? all[1].azimuthDeg - all[0].azimuthDeg : 1
    /*
     * A doorway now stands on a LANDING at each end of a flight, and a landing is
     * level. Raking its threshold with the flight's average gradient tilts a sill
     * that has no gradient under it — which is how the roof exit came to have a
     * wedge of stone leaning over it, and it would happen at every doorway now.
     * So the rake is measured locally, from the treads the opening actually
     * spans, and comes out zero on a landing without a special case.
     */
    const localRise = (() => {
      const arcHalf = (doorwayWidth / 2 / Math.max(0.5, s.midRadius)) * (180 / Math.PI)
      const near = all.filter((t) => Math.abs(t.azimuthDeg - s.azimuthDeg) <= arcHalf * 1.5)
      if (near.length < 2) return 0
      const ys = near.map((t) => t.treadY)
      return Math.max(...ys) - Math.min(...ys)
    })()
    /*
     * The stair's own gradient, expressed the way the cutter needs it: metres of
     * rise per metre of travel round the arc, positive toward increasing
     * azimuth. `stepAngle` carries the winding's sign, so this comes out
     * negative on a counterclockwise stair without a special case.
     */
    const rake =
      localRise < 1e-6 ? 0 : riser / stepAngle / (Math.max(0.5, s.midRadius) * (Math.PI / 180))

    // where the passage bed sits directly under the doorway's centre line
    const bedAtCentre =
      underfoot.treadY +
      rake * (azimuthDeg - underfoot.azimuthDeg) * Math.max(0.5, s.midRadius) * (Math.PI / 180) -
      treadDepth(riser)
    /*
     * THE SILL IS THE BED. Nothing deeper.
     *
     * It was tempting to drop it to the underside of the room's slab so the slab
     * could never leave a shelf standing in the opening, and that is what the
     * first version of this did. Measured on the built shell, it dug 0.51 m
     * below the bed under the bottom four treads of a flight — a slot beside the
     * first step, at the one place every visitor looks.
     *
     * The premise was wrong. At the foot of a flight the bed sits ABOVE the room
     * floor, not inside the slab: the first tread is a riser up and the bed a
     * tread-depth under it, which comes out 0.18 m proud. So there is no shelf to
     * cut away — there is a low step up into the doorway, which is what a stair
     * doorway has. At the head the bed is below the slab already and the slab
     * covers the notch by itself. Neither end needs the drop.
     *
     * Note that this lip is not a collision problem even though the controller
     * cannot climb a lip of any height: the walking surface here is the ramp
     * chain from stairApproaches(), and the shell carries no collider.
     */
    /*
     * AT A HEAD, THE SILL MAY NOT RISE ABOVE THE FLOOR IT SERVES.
     *
     * The rake is right at both ends — the stair really is climbing past the
     * opening — but at a head it climbs UP TO the floor and stops, so the high
     * end of a raked sill can finish above floor level. On the roof it did:
     * 0.42 m of swing across the opening put the sill 0.12 m proud of the deck
     * and left a wedge of masonry leaning over the stair mouth, in the open,
     * visible from the whole terrace.
     *
     * The whole sill drops by however much that overshoot was, keeping the rake.
     * The cost is digging that same 0.12 m under the bed for the width of one
     * doorway — a threshold notch, where the alternative was a slab standing on
     * the roof.
     *
     * Levelling it instead was tried and is worse: the head of one flight and
     * the foot of the next are only a few degrees apart, so a level sill at the
     * head cuts straight under the first treads of the flight above — measured,
     * 2.39 m of nothing beneath them.
     *
     * No clamp at a foot. There the leftover is a low step up into the doorway,
     * standing in a wall rather than on an open floor, which is what a stair
     * threshold looks like in stone.
     */
    const halfTangential = (s.midRadius + doorwayWidth / 2) * Math.sin((widthDeg / 2) * (Math.PI / 180))
    /*
     * The rake is capped so the sill never leaves the stone the stair sits on.
     *
     * At the stair's own gradient the sill swings about 0.4 m across a doorway,
     * and the low end of that swing is below the bed by the same amount — a slot
     * beside the flight, measured at 0.67 m under the treads four steps past a
     * foot doorway. Held to one tread-depth of swing the threshold still rakes,
     * visibly and in the right direction, but its lowest point is exactly the
     * underside of the steps and never the masonry beneath them.
     */
    const maxSwing = treadDepth(riser)
    const rakeCapped =
      Math.abs(rake) * halfTangential > maxSwing
        ? Math.sign(rake) * (maxSwing / Math.max(0.05, halfTangential))
        : rake
    const sillTop = bedAtCentre + Math.abs(rakeCapped) * halfTangential
    const headClamp = atHead ? Math.max(0, sillTop - (floorY - 0.02)) : 0

    /*
     * ON A LANDING THE SILL IS THE FLOOR, not the bed under it.
     *
     * The bed rule exists so a threshold never hangs over a tread passing under
     * the arch. On a level platform the surface of every tread under the arch IS
     * the floor, so there is nothing to clear, and dropping to the bed cuts a
     * clean 0.33 m below floor level for no reason at all — twelve times, once
     * per end doorway. At the foot that slot reaches 0.03 m past the underside of
     * the storey's slab; on the roof it opens the deck.
     *
     * So: level under the arch, sill at the floor. Sloping under it — which now
     * means only the opening onto storey 5, halfway along the 4→6 run — keeps the
     * bed rule and the rake, because there the treads really do pass by at
     * different heights.
     */
    const onLanding = localRise < 1e-6

    const bottomY = onLanding ? floorY : bedAtCentre - headClamp
    const wantedTop = Math.max(floorY, underfoot.treadY) + height
    return {
      azimuthDeg,
      widthDeg,
      bottomRake: rakeCapped,
      bottomY,
      // the arch, or the top of the stone where the stone runs out first
      topY: Math.max(bottomY + 1e-3, Math.min(wantedTop, masonryTopY)),
      innerRadius: Math.max(0.05, inner),
      outerRadius: s.midRadius + doorwayWidth / 2 + 0.06,
      openToSky: wantedTop > masonryTopY + 1e-9,
    }
  }

  /**
   * A DOORWAY NEEDS WALL ABOVE THE FLOOR IT OPENS ONTO, and at the roof there is
   * none: the floor IS the top of the stone.
   *
   * This is one line and it retires the last piece of the old terrace. While the
   * "parapet" was the whole 3.733 m wall top, the roof exit was a doorway like
   * any other — a hole cut in stone standing over the landing — except that its
   * head wanted 2.1 m and the stone gave 0.751, so it came out as a notch in the
   * top of the tower with `openToSky` set and a 50° breach round it.
   *
   * With the paving carried across the wall the arithmetic says something quite
   * different, and simpler: masonryTopY IS the landing level, so there is no
   * wall to cut. The way out of the roof stair is the opening in the PAVING —
   * the same stairwell cut every storey slab takes — and the door the footage
   * shows (roof/007) is the head-house's, standing on the deck above this level.
   * Nothing here should try to build it.
   *
   * Written as a comparison rather than a special case for the roof, because
   * that is what it is: any flight whose landing is at the top of the stone
   * leaves through its ceiling, not through a wall.
   */
  const hasWallAbove = (floorY: number) => masonryTopY > floorY + 1e-9

  flights.forEach((steps, i) => {
    if (steps.length === 0) return
    for (const end of ['foot', 'head'] as const) {
      const s = end === 'foot' ? steps[0] : steps[steps.length - 1]
      const floorY = floorYOf(i, end)
      if (!hasWallAbove(floorY)) continue
      out.push(doorwayAt(steps, s, floorY, end === 'head'))
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
     * A RADIAL FOOT RAMP FOR EVERY FLIGHT, now that none of them continues
     * another.
     *
     * There used to be a special case here: a flight above the bottom took a
     * TANGENTIAL hand-off from the head of the flight below, because the two were
     * one helix and the walker arrived travelling round it. That is what defeated
     * three earlier attempts and it was the right answer then — a ramp climbing
     * radially is met broadside by someone moving tangentially, and a ramp met
     * broadside is a ledge however gentle its slope.
     *
     * With the flights stacked instead of chained, nobody arrives at a foot along
     * a flight. You come out of the passage below at one end of the sector, cross
     * the chamber, and walk into the next doorway from the room — radially, which
     * is what the bottom flight always did and what has always worked.
     */
    approach(steps[0], floorYOf(i, 'foot'), false)
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
