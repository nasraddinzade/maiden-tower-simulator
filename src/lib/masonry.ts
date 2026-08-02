/**
 * Masonry appearance (Phase 7). Pure functions + the measured palette, so the
 * numbers can be asserted and the shader stays a thin consumer.
 *
 * PALETTE — MEASURED, NOT INVENTED (the Phase-7 spec is explicit about this).
 * Sampled from reference-photos/exterior/ by averaging crops of clean drum
 * masonry, splitting the rows into the brightest and darkest fifths:
 *
 *   Baku Maiden Tower 004 7736.jpg  light #b5966d   mortar #8e6b42   ratio 1.39
 *   Torre de la Doncella … DD 06.jpg light #9f8b6d  mortar #77644a   ratio 1.39
 *   Giz galasi.JPG                   light #725d46  mortar #2f2b19   ratio 2.41
 *   OldCityBaku8362.jpg              light #7c664a  mortar #423527   ratio 1.90
 *
 * The first two were taken in flat overcast light and are therefore closest to
 * albedo; the last two are warm raking light, which darkens the joints and
 * inflates the ratio. That distinction matters:
 *
 * [ref] describes "чёрно-белая полосатость" — strong black-and-white banding.
 * In flat light the albedo ratio is only about 1.4:1. So most of that striping
 * is SHADOW cast by projecting courses, not pigment. Baking a 2.4:1 contrast
 * into the base colour would look wrong the moment the sun goes behind cloud.
 * The albedo contrast here is therefore modest, and the relief is left to do
 * the rest once Phase 8 puts a real sun in the sky.
 */

/** Mean colour of a sunlit course, from the flat-light photographs. */
export const LIMESTONE_LIGHT = '#aa906d'
/** Mean colour of the mortar joint / recessed course. */
export const LIMESTONE_MORTAR = '#836846'
/** Interior stone: [ref] calls it darker and more weathered than the outside. */
export const LIMESTONE_INTERIOR = '#6d6152'

/** Albedo contrast between course and joint, as measured in flat light. */
export const MEASURED_ALBEDO_RATIO = 1.39

/**
 * Height of one masonry course.
 *
 * [ASSUMPTION] — the Phase-7 spec's ~0.35 m stands. Attempts to measure it
 * photogrammetrically did NOT converge: detecting joint spacing gave 0.43 m when
 * scaled off the top rim, but 0.14–0.19 m once the scale was corrected for the
 * lower crop height and the cylinder's near face, and the joint detector found
 * no clean periodicity (spacings ranged 5–57 px). A noisy measurement is not an
 * improvement on a stated assumption, so the spec's value is kept and exposed
 * for tuning rather than silently replaced.
 */
export const COURSE_HEIGHT = 0.35

/**
 * Banding factor at world height y: 0 in the joint, 1 on the face of a course.
 * A smooth pulse rather than a hard edge, so it does not alias at distance.
 */
export function courseBand(y: number, period: number, jointFraction = 0.28): number {
  if (period <= 0) return 1
  const t = ((y % period) + period) % period / period
  // joint occupies the bottom `jointFraction` of each course
  const edge = jointFraction
  if (t >= edge) return 1
  // smoothstep across the joint so the transition is soft
  const u = t / edge
  return u * u * (3 - 2 * u)
}

/**
 * Strength of the diamond tooling, 0 at the base and 1 at the top.
 * [ref]: the diamond dressing is decorative high up and plain lower down.
 */
export function diamondIntensityAt(y: number, towerHeight: number): number {
  const t = Math.min(1, Math.max(0, y / towerHeight))
  return t * t // stays plain over the lower half, then ramps
}

/**
 * Diamond (lozenge) pattern value in [0,1] for a point on the wall, given the
 * distance around the wall and the height. Diamonds are just the two diagonal
 * families beating against each other.
 */
export function diamondPattern(u: number, v: number, scale: number): number {
  const a = Math.abs(((u + v) * scale) % 1 - 0.5) * 2
  const b = Math.abs(((u - v) * scale) % 1 - 0.5) * 2
  return Math.min(a, b)
}
