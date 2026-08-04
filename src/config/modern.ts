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
