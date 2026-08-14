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
 * straight, no winders, a fabricated steel flight with chequer treads and curved
 * balustrades either side. STRAIGHT, but not radial — it is laid against the
 * drum like a chord and turns a quarter circle onto the door at the top. See
 * ENTRANCE_APPROACH below, which is where that was got wrong.
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
  /**
   * m — the standards are flat STRAPS, not tubes. [PHOTO], section [ESTIMATE].
   *
   * A later reading of the exterior set calls the balustrade the stair's most
   * characteristic feature and says the model had the wrong object: what the
   * photographs show is a dense fan of closely-spaced flat steel straps, not a
   * dozen round tubes. So the section is a strap of about 50 × 12 mm — the
   * ordinary flat for this kind of fabricated guard — and the count goes from
   * twelve a side to about forty.
   *
   * The section is still unmeasurable for the same reason the tube's was: the
   * straps are two or three pixels across wherever they appear and there is no
   * object of known size in frame. What changed is the KIND of thing, which the
   * photographs do settle, not its size, which they do not.
   */
  strapWidth: 0.05,
  strapThickness: 0.012,
  /** m — radius of the handrail itself, which IS a tube. [ASSUMPTION] */
  railRadius: 0.02,
  /**
   * Standards per tread, each side. [PHOTO] for the density, [ESTIMATE] for the
   * exact number.
   *
   * One per tread was the old value, and it was written down as the weakest
   * thing in this file because nothing counted them. Something does now: the
   * reading puts roughly forty to forty-five a side against the twelve one-per-
   * tread gives. Over twelve treads that is between three and four each, and 3.5
   * is not a thing you can build, so it is 4 — forty-eight a side, at the top of
   * the read range rather than the middle, because a fan reads as a fan.
   */
  postsPerTread: 4,
} as const

/** m — total rise of the external flight, 12 × 0.165. */
export const EXTERNAL_STAIR_RISE = EXTERNAL_STAIR.risers * EXTERNAL_STAIR.riser

/**
 * WHICH WAY THE FLIGHT RUNS, and the landing it runs to.
 *
 * The flight used to be laid on the entrance's own radius — foot and head at
 * azimuth 270, the run taken straight out of the radius, the walker climbing
 * head-on at the door. It does not do that and never did. It runs ALONG the
 * drum and turns onto the door at the top, and the turn is what this object is
 * for. The construction is argued where it is computed, in lib/externalStair.ts.
 *
 * WHAT THE PHOTOGRAPHS SETTLE. reference-photos/exterior/"Torre de la Doncella,
 * Baku, Azerbaiyán, 2016-09-26, DD 06.jpg" shows the whole approach in one
 * frame: a straight flight climbing across the face of the wall, a landing at
 * its head standing in front of the doorway, and — the detail that cannot be
 * read any other way — the handrail raking up the flight, breaking to
 * HORIZONTAL exactly where flight meets landing, and running on flat across the
 * front of the door to die into the stone past the far jamb. A radial flight
 * has no landing, nothing for a rail to level off along, and nowhere to turn.
 * "Qiz qalasi 1.jpg" is the same arrangement from a different bearing, and the
 * owner's own ascent frame at second 2 is the same thing from the foot: the
 * drum recedes to one side while the flight climbs across it to a doorway that
 * is NOT at the end of the climb but square to it.
 *
 * WHICH SIDE, which is the half of this that could have been got backwards. In
 * every photograph that shows the door the flight descends to the LEFT of it,
 * and left is not an accident of where photographers stand: the visible arc of
 * a drum always runs from higher azimuth on the image left to lower on the
 * right, so a flight on the far side of the door would show on the right in all
 * of them and shows on the right in none. DD 06 fixes the compass on its own —
 * the buttress and the boulevard stand at its right edge, which is the east and
 * south of the tower, so the flight's foot lies NORTH of west. Hence +1: the
 * flight descends toward INCREASING azimuth, 270 → about 296.
 *
 * WHAT THEY DO NOT SETTLE is any length. Nothing has put a tape across this
 * stair and no frame of it contains an object of known size, exactly as the
 * width note above records. So the landing is not measured; it is DERIVED from
 * the one relation the photographs do fix — its outer edge and the flight's
 * outer stringer are one straight line, and it is about as long as it is deep.
 * A landing shorter than the flight is wide could not be turned on and would
 * not cover the 1.1 m doorway it serves.
 */
export const ENTRANCE_APPROACH = {
  /**
   * +1 = the flight descends toward increasing azimuth, i.e. clockwise in plan
   * from the door. [PHOTO], and the one thing here that is not derived.
   */
  handedness: 1,
  /**
   * m — how far the landing reaches along the wall. [DERIVED] from the width:
   * square, because the photographs show it roughly so and because a
   * quarter-turn landing has to be at least the flight's width in both
   * directions. Its depth is not a separate figure — it IS the width, the
   * walking surface simply carrying on past the door.
   */
  landingLength: EXTERNAL_STAIR.width,
} as const

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
  /**
   * m — how far beyond the FOOT of the entrance flight the player starts.
   *
   * It used to be measured from the tower's outer face along the entrance's
   * radius, which was the same thing while the flight ran that way. It is not
   * the same thing now: see the note on OUTDOOR_START.
   */
  spawnDistance: 14,
  /** m — thickness of the ground slab, so it is a solid to stand on. */
  thickness: 0.6,
} as const
