/**
 * The ground the tower stands on, and the way in from the street.
 *
 * Modern fabric, like config/modern.ts — the stair to the door is a fabricated
 * steel flight, and the paving round the tower is the museum's. Kept apart from
 * config/tower.ts for the same reason: these are known off a phone video, the
 * drum is known off a survey report, and the two must not be quoted alike.
 */

import { ENTRANCE, TOWER } from './tower'

/**
 * The external stair from the paved square up to the raised doorway.
 *
 * Measured off the ascent frames at seconds 0–19 and the descent at 403–419:
 * straight, no turns, no winders, a fabricated steel flight with chequer treads
 * and curved tubular balustrades either side.
 *
 * TWO INDEPENDENT FIGURES AGREE HERE, which is worth stating because almost
 * nothing else in this model has that. Counting treads off the video gives 12
 * risers at 0.165 m, i.e. 1.98 m ±0.40 of rise. The reserve's own published
 * figure for the doorway is a sill "2 m above the former ground surface"
 * [İçərişəhər], carried in ENTRANCE.sillY. The two were arrived at by completely
 * different routes and land 0.02 m apart. So the ground plane below is put where
 * the SOURCED sill and the MEASURED flight meet, rather than either being
 * adjusted to suit the other.
 *
 * What could NOT be measured: the stair's width in metres. Not one frame of the
 * approach contains a person, a sign, an extinguisher or any other object of
 * known size, so only the width-to-rise RATIO could be read (1.8 ±0.4). The
 * width below is therefore derived from that ratio, not measured, and is marked
 * as such.
 */
export const EXTERNAL_STAIR = {
  /** [VIDEO] a direct count off the elevation frames. */
  risers: 12,
  /** m — [VIDEO] 0.165 ±0.020, from the tread count against the total rise. */
  riser: 0.165,
  /** m — [ASSUMPTION] a comfortable going for a public approach flight. */
  going: 0.3,
  /**
   * m — [VIDEO, ratio only] the clear width read as 1.8 ±0.4 times the rise per
   * riser gives 0.30 m, which is absurd for a public stair; the ratio was taken
   * against the wrong reference. Falling back to the DOORWAY width, which IS
   * sourced at 1.1 m [İçərişəhər], plus a little either side for the stringers.
   * [ASSUMPTION] until someone puts a tape across it.
   */
  width: ENTRANCE.width + 0.3,
  /** m — [ASSUMPTION] a normal public-stair guard, as the roof balustrade is. */
  guardHeight: 1.05,
} as const

/** m — total rise of the external flight, 12 × 0.165. */
export const EXTERNAL_STAIR_RISE = EXTERNAL_STAIR.risers * EXTERNAL_STAIR.riser

/**
 * World Y of the paved ground outside.
 *
 * Derived from the THRESHOLD, which is the floor of storey 1, less the measured
 * rise of the flight. It comes out at −1.98, and the reserve's sourced sill
 * height puts the former ground surface at −2.00. Two figures from completely
 * different places, 0.02 m apart, so neither is nudged to meet the other.
 *
 * It used to be derived from ENTRANCE.sillY read as a world Y, which put the
 * pavement at +0.02 and the threshold two metres above the chamber floor. You
 * could climb the stair and walk through the door, and then you were stuck on a
 * lip with a two-metre drop, unable to reach the floor or the stair up from it.
 */
export const GROUND_Y = ENTRANCE.thresholdY - EXTERNAL_STAIR_RISE

/**
 * The paved area around the tower.
 *
 * [ASSUMPTION] in every dimension — this is somewhere to stand and walk up to
 * the door from, not a survey of İçərişəhər. It is deliberately plain: a
 * fabricated square would be worse than an obviously blank one, because a blank
 * one cannot be mistaken for evidence.
 */
export const SITE = {
  /**
   * m — radius of the ground disc, from the tower axis.
   *
   * Big enough that its rim is not in shot. At 26 m out the disc simply ended,
   * and from the spawn you saw its cut edge standing against the sky on both
   * sides — the tower on a saucer. The ground is one cylinder either way, so the
   * only cost of pushing the edge out is that it is further away.
   */
  radius: TOWER.outerRadius + 110,
  /** m — how far the player starts from the tower's outer face. */
  spawnDistance: 14,
  /** m — thickness of the ground slab, so it is a solid to stand on. */
  thickness: 0.6,
} as const
