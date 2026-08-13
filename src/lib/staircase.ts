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
   * THIS STRETCH OF PASSAGE HAS NO VAULT, because the building has run out.
   *
   * Set where `tread + headroom` came out above the top of the masonry, which in
   * this model happens over the last third of the roof climb and nowhere else.
   * `topY` is then the top of the stone rather than a crown, and the two are not
   * the same kind of thing: one is where a vault springs to, the other is where
   * the building stops. Anything that draws or cuts these sections has to know
   * which it has been handed — a pointed vault whose crown is exactly the roof
   * surface is tangent to it, and tangency is the CSG case this model has twice
   * lost a floor to.
   *
   * It is NOT a claim that the tower's roof is open over its stair. It is a claim
   * about this model's own arithmetic, which cannot roof that stretch at all. See
   * ROOF_QUESTION in config/tower.ts.
   *
   * [2026-08-14] AND THE TOWER'S ROOF IS NOT OPEN OVER ITS STAIR. The owner's roof
   * footage shows the stair arriving at deck level through a door, under a modern
   * head-house, with the parapet running on unbroken past it (roof/007, up/250).
   * So this flag is now known to be false of the building as well as true of the
   * model. It stays because the model still cannot roof that stretch: the paving
   * has to cross the wall for the breach to close, and the paving cannot cross the
   * wall until the parapet has a thickness, which no source gives.
   */
  openToSky?: boolean
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
   * WHAT IT DOES NOT DO, and this must not be claimed for it. Over the last
   * third of the roof climb the treads rise past `topY − headroom`, so the
   * passage has less than its headroom of stone above it and then none at all:
   * the cut goes clean through the parapet ring for about 50° of arc and the
   * final steps come out under open sky. That breach is REAL — it is in the
   * built shell, you can stand on the deck and look into it. Clamping the cutter
   * neither closes it nor excuses it.
   *
   * WHETHER THE TOWER'S ROOF IS LIKE THAT WAS ANSWERED ON 2026-08-14 AND THE
   * ANSWER IS NO. The owner's roof footage shows the paving crossing the whole
   * thickness of the wall to a thin parapet on the outer edge, the parapet
   * unbroken all the way round, and the stair arriving at deck level through a
   * door under a modern head-house (roof/007, roof/016, up/250). The breach is
   * therefore a known defect rather than a suspected one — and it still cannot be
   * closed here, because closing it means carrying the paving out over the wall
   * and nothing gives the parapet a thickness to carry it to. Until that one
   * number arrives, moving the deck, the parapet or the headroom to make the
   * picture tidy would be fitting a measured stack to a view (CLAUDE.md rule 1).
   * ROOF_QUESTION in config/tower.ts is now that single question.
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
  const tubes: PassageSection[][] = []
  for (const flight of flights) {
    if (flight.length === 0) continue
    // each flight carries its own riser, since storeys round to different ones
    const riser = riserOf(flight)
    const body = flight.map((step) => sectionAt(step, riser))
    if (flight.length < 2) {
      tubes.push(body)
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
    tubes.push([...leadIn, ...body, ...leadOut])
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
   * The same fact PassageSection.openToSky records, and the roof exit is the one
   * doorway it applies to: its head wants 2.1 m over a landing at 26.749 and the
   * masonry stops at 27.500, so what stands over it is 0.751 m of parapet. An
   * arch struck in that gives a semicircle whose crown lands exactly on the roof
   * plane — tangent to it, coincident along a line, and the boolean then leaves a
   * curved lid of stone over the way out. It is a notch in the top of the wall,
   * and the cutter should say so. See doorwayCutter().
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
   * stairPassageSections(). The roof exit is the one doorway it touches: its
   * head came out at 28.849 against masonry that stops at 27.500, so the arch
   * was 1.35 m taller than the wall it is cut in. Like the passage's own crown
   * it removed nothing up there; like it, it was a claim about a building.
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

  flights.forEach((steps, i) => {
    if (steps.length === 0) return
    for (const end of ['foot', 'head'] as const) {
      const s = end === 'foot' ? steps[0] : steps[steps.length - 1]
      out.push(doorwayAt(steps, s, floorYOf(i, end), end === 'head'))
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
