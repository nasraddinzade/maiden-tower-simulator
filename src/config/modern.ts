/**
 * The modern fabric, as the tower stands in 2026.
 *
 * Kept OUT of config/tower.ts deliberately. The masonry and the insertions are
 * known to completely different standards — the drum is sourced, the steelwork is
 * read off a phone video — and mixing them in one file is how a figure from a
 * 2010s handrail ends up quoted as evidence about a 12th-century tower. Anything
 * here is also what a "original fabric only" view would switch off.
 *
 * Provenance tags follow config/tower.ts. [VIDEO] means measured off a frame of
 * the owner's own 2026 walkthrough, with the method written out; every such
 * figure carries a tolerance and most of them are wide.
 */

import { FLOORS, LIFTS } from './tower'
import { PLAYER } from './player'
import { throughOpeningWalkBand } from '../lib/collision'

/**
 * The free-standing steel spiral that carries visitors from the entry chamber to
 * storey 2 — the only modern stair indoors, and the only lift in the tower that
 * is not a flight in the wall.
 *
 * Measured off the ascent frames at seconds 44–75 and the descent at 375–398.
 * It stands clear in the middle of the chamber, not in any wall passage: dark
 * steel, chequer-plate treads, a slim bright central tube, tubular balusters
 * carrying part-glazed panels, and a round chequer-plate landing at the top.
 *
 * WHAT COULD NOT BE MEASURED, and is derived instead: the number of treads and
 * therefore the total rise. No frame shows the whole flight — the foot is hidden
 * behind a stone kerb and the head runs out of the top of the picture — and the
 * 22-second climb is useless as a proxy because the walker was queueing behind
 * other visitors. The visible part alone is at least 15 risers. So the count here
 * follows from the storey height and the MEASURED riser, and will change by
 * itself if the storey height ever moves. It is not a number anyone invented.
 */
export const MODERN_SPIRAL = {
  /**
   * m — outer radius of the treads. [VIDEO] Ø 2.2 m ±0.4.
   *
   * Read in the entry-passage elevation: the outer handrail's left and right
   * tangents span 790 px about the column axis at 55 px per riser, corrected by
   * 0.89 for the near/far foreshortening measured in the same frame (near-side
   * tread spacing 72 px against 55 px far side puts the camera about 7 radii out).
   */
  outerRadius: 1.1,
  /**
   * m — radius of the central tube. [VIDEO] Ø 115 mm ±30.
   *
   * Its silhouette is 40 px against 55 px per riser at the same depth. That lands
   * on the standard 114.3 mm CHS, which is credible because the treads are also
   * carried on a continuous outer stringer, so the column is not doing all the
   * work. It is about a twentieth of the outer diameter — unusually slim, and the
   * RATIO is what was actually measured; the absolute value inherits the riser's
   * ±14%.
   */
  columnRadius: 0.0575,
  /**
   * m — rise per tread. [VIDEO] 175 mm ±25.
   *
   * Six evenly spaced tread edges on the far side of the helix give a period of
   * 55 ±4 px. Scaled off the only adult at the same depth — a man in a white polo
   * standing beyond the stair — taking adult male head BREADTH as 150–170 mm. His
   * feet are hidden behind a stone parapet, so stature could not be used. He is
   * probably slightly further from the lens than the treads, which biases this
   * high, so the band is widened downward. Cross-check: his shoulder width comes
   * out ~440 mm at the same scale, which is plausible.
   */
  riser: 0.175,
  /**
   * m — going along the walking line. [ASSUMPTION].
   *
   * NOT measured: the only near-plan views are oblique hand-held shots down a
   * helix, and no single foreshortening reconciles the three consecutive tread
   * angles read off them (21°, 27.5°, 39.4°). Fitting an orthographic compression
   * gave anything from 11 to 19 treads per turn. This value sits in that bracket
   * — it puts about 13 treads in a turn — and is a comfortable going for a stair
   * of this radius, but it is a choice, not a measurement.
   */
  going: 0.28,
  /**
   * m — height of the balustrade above the tread nosing. [VIDEO] ~1.0 m ±0.2,
   * and weak: it essentially confirms a code-standard guard rather than
   * establishing one independently. Nothing in the frames contradicts 1 m.
   */
  guardHeight: 1.0,
  /**
   * Rods per tread on the outer arc: one thicker post on each tread's outer
   * corner, with two thinner infill rods between consecutive posts. [VIDEO] —
   * a direct count needing no scale, confirmed on two separate descent frames
   * and two ascent frames.
   */
  rodsPerTread: 3,
  /** m — radius of the balustrade tubes. [ASSUMPTION] a normal 40 mm handrail. */
  rodRadius: 0.02,
  /**
   * Which way it turns, climbing. [VIDEO] — this one is not in doubt the way the
   * masonry stair's winding is: the newel spiral is plainly visible in several
   * frames looking down it.
   */
  winding: 'clockwise' as const,
} as const

/**
 * The lift the spiral serves, and the rise it therefore has to make.
 * Derived, never hard-coded — see the note on the tread count above.
 */
export const MODERN_SPIRAL_LIFT = LIFTS.find((l) => l.kind === 'modernSpiral') ?? null

/** m — floor-to-floor rise the spiral climbs, or 0 if the lift table has none. */
export const MODERN_SPIRAL_RISE = MODERN_SPIRAL_LIFT
  ? MODERN_SPIRAL_LIFT.toY - MODERN_SPIRAL_LIFT.fromY
  : 0

/**
 * Treads, rounded so the risers come out equal across the storey. With the
 * measured 175 mm riser and the current storey height this is about 22, and the
 * flight turns rather more than one full revolution — which agrees with the one
 * thing the footage does say about the count, that at least 15 risers are visible
 * in a single frame and the run is longer than that.
 */
export const MODERN_SPIRAL_TREADS = Math.max(
  1,
  Math.round(MODERN_SPIRAL_RISE / MODERN_SPIRAL.riser),
)

/**
 * CONFLICT, recorded rather than resolved.
 *
 * The opening this stair rises through — storey 1's vault, storey 2's floor —
 * measures Ø ~1.8 m ±0.3, while the stair itself measures Ø ~2.2 m ±0.4. Taken
 * at face value the stair is wider than the hole it comes up through, which
 * cannot be. The two ranges do overlap (1.5–2.1 against 1.8–2.6), so both could
 * be near 2.0 m, and both were scaled off assumed reference sizes in different
 * frames. Neither is adjusted to fit the other here.
 */
export const MODERN_SPIRAL_VS_OPENING = {
  spiralDiameter: MODERN_SPIRAL.outerRadius * 2,
  openingDiameter: FLOORS[0].oculusRadius * 2,
  get overlaps() {
    return this.spiralDiameter - 0.4 <= this.openingDiameter + 0.3
  },
}

/**
 * Radius of the well this flight rises through: the vault of the storey it
 * STARTS in is the thing pierced, and its opening is the hole in the floor it
 * arrives on. Read off the lift rather than written as an index, so the day the
 * spiral serves different storeys the well follows it.
 */
export const MODERN_SPIRAL_WELL_RADIUS = MODERN_SPIRAL_LIFT
  ? (FLOORS[MODERN_SPIRAL_LIFT.fromFloorNumber - 1]?.oculusRadius ?? 0)
  : 0

/**
 * WHERE A BODY MAY BE ON THIS STAIR — and it is not the middle of the treads.
 *
 * THE OWNER COULD NOT WALK THE TOP OF HIS OWN SPIRAL, and the thing standing in
 * the way was the rim of the hole it comes up through. Walked and measured
 * before anything was touched: climbing the flight on its drawn walking line the
 * capsule stopped dead at feet 2.089–2.276 m, r 0.581, three runs out of three,
 * and aiming it one metre further in freed it instantly and it climbed the same
 * treads to the top. The obstruction is radial and it is at r 0.900 — the
 * surveyed opening — meeting a 0.300 m capsule that the character controller
 * inflates by its 0.020 m skin.
 *
 * IT WAS A MILLIMETRE, NOT A NEAR MISS, and that is why nothing about the flight
 * being "roughly right" would have helped. The drawn walking line is
 * columnRadius + (outerRadius − columnRadius)/2 = 0.57875. The widest a body
 * fits inside the well is 0.900 − 0.300 − 0.020 = 0.58000. The stair was
 * built 1.25 mm inside the only corridor there is, and the collider then offered
 * a band 0.55 m wide about that line — 0.274 m of it outside the wall of the
 * well, which is to say a quarter of a metre of somewhere to stand that a body
 * does not fit in. A walker nudged out there by the ramp chain's own joints
 * jams, and jams for good: the rim will not let them out and the flight will not
 * let them up.
 *
 * WHY THE STAIR IS NOT MOVED INSTEAD. The two diameters are BOTH surveyed and
 * they contradict each other — MODERN_SPIRAL_VS_OPENING, a few lines up, records
 * that and refuses to reconcile them. It still refuses. What changes here is
 * only where a BODY is allowed to be, which is neither of those two figures and
 * never was: it is the walker's own width taken off the hole. The drawn stair,
 * the drawn treads and the drawn well are all exactly what they were, and the
 * conflict is still recorded rather than resolved.
 *
 * WHAT IT COSTS, stated because it is real: the band comes out 0.2225 m wide on
 * a tread drawn 1.0425 m wide, so most of the visible tread carries no collider
 * and a walker who gets out there falls through drawn steel. That trade is not
 * new — the collider was already narrower than the tread, for the lip argument
 * in ModernSpiralStair — but it is now much narrower, and the same argument says
 * why it is bearable: a chain of yawed boxes cannot follow a tight helix without
 * leaving lips at the joints, the lip scales with the band's half-width and with
 * the pitch, and both fall here. 0.079 m before, 0.040 m now.
 */
export const MODERN_SPIRAL_WALK_BAND = throughOpeningWalkBand({
  newelRadius: MODERN_SPIRAL.columnRadius,
  openingRadius: MODERN_SPIRAL_WELL_RADIUS,
  walkerRadius: PLAYER.radius,
  skin: PLAYER.characterOffset,
})

// ————————————————— the glass guards round the openings —————————————————

/**
 * The frameless glass guard standing round each pierced floor opening.
 *
 * config/tower.ts's OPENINGS table was measured AGAINST this thing. Every one of
 * those three diameters is a RATIO read off a frame — the opening's width against
 * "the frameless glass guard round each opening", taken as 1.00–1.10 m. So the
 * guard is the ruler the holes were measured with, and until now it was the one
 * object in that sentence the model did not build: the openings were drawn as
 * bare holes in a walking surface, 1.4 to 2.4 m across.
 *
 * Which fixes what the height below may and may not be quoted as. It is NOT an
 * independent measurement of the guard, and reading it as one would be circular
 * — it is the assumed reference size, exactly like the 150–170 mm head breadth
 * that scales MODERN_SPIRAL.riser. What supports it is only that 1.00–1.10 m is
 * the ordinary height for a guard, and that the two others in this model —
 * EXTERNAL_STAIR.guardHeight 1.05 [ASSUMPTION] and MODERN_SPIRAL.guardHeight
 * 1.0 ±0.2 [VIDEO] — were arrived at down separate routes and land in the band.
 */
export const OPENING_GUARD = {
  /**
   * m — height of the pane above the floor. [ASSUMPTION] 1.00–1.10 m, midpoint.
   *
   * The band is config/tower.ts's own; the midpoint is this file's choice,
   * because nothing in the footage picks a value inside it. Moving it moves the
   * drawn guard and the collider together, and does NOT move the openings —
   * those diameters are frozen numbers in the OPENINGS table, not expressions in
   * this constant. If the guard is ever really measured, the openings have to be
   * re-derived by hand.
   */
  height: 1.05,
  /**
   * m — pane thickness. [ESTIMATE].
   *
   * Nothing measures it and the footage could not: a pane seen edge-on across a
   * chamber is a pixel or two. 20 mm is the ordinary thickness of a frameless
   * laminated toughened guard, and frameless is what the frames show — glass
   * standing off the floor with no posts and no cap rail, which is why none are
   * drawn either. It is here only because a drawn ring must have SOME thickness.
   * Nothing depends on it: guardRingBoxes pins the collider's face to the
   * OPENING's edge rather than to the pane, so whether this is 12 mm or 25 mm
   * changes where the walker is stopped by nothing at all.
   */
  thickness: 0.02,
} as const

/** Storeys the modern spiral arrives in — the well it rises through is theirs. */
const SPIRAL_WELL_FLOOR_INDICES = new Set(
  LIFTS.filter((l) => l.kind === 'modernSpiral').map((l) => l.toFloorNumber - 1),
)

export interface GuardedOpening {
  /** 0-based index of the storey whose FLOOR the hole is in. */
  floorIndex: number
  /** World Y of that floor's walking surface — the guard stands on it. */
  floorY: number
  /** Radius of the hole, from the vault BELOW, which is the one that cuts it. */
  radius: number
}

/**
 * Which openings actually get a guard, and where each one stands.
 *
 * Two exclusions are doing the work, and both are geometry rather than taste.
 *
 * A guard stands on a FLOOR, never under a vault. OPENINGS is keyed by the
 * storey whose vault is pierced — 1, 4 and 7 — but the fall is off the floor
 * ABOVE each of those: storeys 2, 5 and 8, which is what hasFloorOpening marks.
 * Ringing the vaults would hang three glass collars in the ceilings.
 *
 * And storey 2 is then dropped, which is the judgement call here. That hole is
 * the well the modern steel spiral rises through, and the spiral is WIDER than
 * it: MODERN_SPIRAL_VS_OPENING records the conflict a few lines up — Ø 2.2 m
 * ±0.4 of stair coming up through Ø 1.8 m ±0.3 of hole. A ring standing on the
 * opening's edge therefore stands inside the flight, and a walker arriving at
 * the top tread arrives inside the ring. It would not guard them; it would cage
 * them, on the one stair that is the only link from the entry chamber to storey
 * 2 — the visitor route's first turn. The real well must be guarded with a gap
 * at the landing, and finding where that gap is means replanning the flight to
 * get the last tread's azimuth. That is a separate job. Until it is done the
 * well is left open, as it already was, rather than sealed in the wrong place.
 */
export const GUARDED_OPENINGS: GuardedOpening[] = FLOORS.filter(
  (f) => f.hasFloorOpening && !SPIRAL_WELL_FLOOR_INDICES.has(f.index),
).map((f) => ({
  floorIndex: f.index,
  floorY: f.floorY,
  radius: FLOORS[f.index - 1].oculusRadius,
}))
