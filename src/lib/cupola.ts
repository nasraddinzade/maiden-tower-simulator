/**
 * Pure geometry for the shallow stone cupolas and the annular floors.
 * three.js-free so it can be unit-tested (CLAUDE.md rule 6).
 *
 * [ref]: "Каждый ярус перекрыт пологим каменным куполом ('stone cupola')
 * с центральным круглым отверстием (окулюс) — ярусы связаны вертикально."
 */

/**
 * Radius of the sphere whose cap forms a shallow dome of the given span and rise.
 *
 * For a spherical cap: r² = 2·R·h − h², so R = (r² + h²) / (2h),
 * where r is the springing radius (half-span) and h the rise. A smaller rise
 * gives a larger sphere, i.e. a flatter dome.
 */
export function domeSphereRadius(spanRadius: number, rise: number): number {
  if (rise <= 0) throw new Error('cupola rise must be positive')
  return (spanRadius * spanRadius + rise * rise) / (2 * rise)
}

/**
 * Height of the dome surface above its springing level, at horizontal distance
 * `r` from the axis. Returns the rise at r = 0 and 0 at r = spanRadius.
 */
export function domeHeightAt(r: number, spanRadius: number, rise: number): number {
  const R = domeSphereRadius(spanRadius, rise)
  // centre of the sphere sits R − rise below the crown, i.e. at springing − (R − rise)
  const inside = R * R - r * r
  if (inside <= 0) return 0
  return Math.sqrt(inside) - (R - rise)
}

export interface ProfilePoint {
  /** Distance from the tower axis. */
  r: number
  /** Height above the cupola's springing level. */
  y: number
}

/**
 * Meridian profile of one cupola, from the oculus rim inwards-out to the
 * springing, ready to be revolved (three.js LatheGeometry consumes it as
 * Vector2(r, y) with y later offset to world height).
 *
 * Points run from the oculus rim (small r, high y) to the springing
 * (large r, y = 0) so the revolved surface faces downward into the room.
 */
export function cupolaProfile(
  spanRadius: number,
  oculusRadius: number,
  rise: number,
  segments = 24,
  /**
   * How far the springing course is bedded INTO the wall, metres.
   *
   * A stone dome is built into the masonry, not butted against its face, and
   * the model needs it for a second reason: the wall is a cone and the dome a
   * surface of revolution drawn with a different segment count, so a rim that
   * merely touches leaves a sliver of daylight all the way round, which reads
   * in-game as a ring of triangular teeth at every ceiling. A skirt that runs
   * past the face cannot show one whatever the polygon counts are.
   */
  embed = 0.25,
): ProfilePoint[] {
  if (oculusRadius >= spanRadius) {
    throw new Error('oculus must be smaller than the cupola span')
  }
  const pts: ProfilePoint[] = []
  for (let i = 0; i <= segments; i++) {
    const r = oculusRadius + ((spanRadius - oculusRadius) * i) / segments
    pts.push({ r, y: domeHeightAt(r, spanRadius, rise) })
  }
  // the springing course, sloping down and out into the wall
  if (embed > 0) pts.push({ r: spanRadius + embed, y: -embed })
  return pts
}

/**
 * Opening radius actually used, given a requested value and the span it sits in.
 *
 * The oculus radius is a single placeholder shared by every storey, while the
 * spans differ (the wall thins with height). Clamping keeps a large placeholder
 * from swallowing a narrow span and inverting the profile. Shared by the
 * renderer and the tests so both agree on what is really built.
 */
export function effectiveOpeningRadius(requested: number, spanRadius: number): number {
  return Math.min(requested, spanRadius * MAX_OPENING_FRACTION)
}

/** An opening may not eat more than this share of its span. */
export const MAX_OPENING_FRACTION = 0.8

/**
 * True when a vertical ray on the tower axis passes cleanly through every
 * opening — i.e. the oculi are coaxial and unobstructed, so the sky is visible
 * from the floor of storey 1 (the Phase-3 acceptance check).
 *
 * Both the cupolas and the floor slabs are surfaces of revolution that start at
 * the opening radius, so a ray closer to the axis than every effective opening
 * intersects nothing.
 */
export function oculiAreClear(
  openings: Array<{ oculusRadius: number; cupolaSpanRadius: number; innerRadiusAtLevel: number }>,
  rayRadius = 0,
): boolean {
  return openings.every((o) => {
    const cupola = effectiveOpeningRadius(o.oculusRadius, o.cupolaSpanRadius)
    const slab = effectiveOpeningRadius(o.oculusRadius, o.innerRadiusAtLevel)
    return cupola > rayRadius && slab > rayRadius
  })
}
