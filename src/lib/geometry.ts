/**
 * Pure geometry/orientation helpers. No three.js, no React — kept dependency-free
 * so it can be unit-tested in isolation (CLAUDE.md rule 6: test the math only).
 *
 * World conventions (CLAUDE.md rule 3):
 *   - units are metres, Y is up
 *   - north = -Z, east = +X, south = +Z, west = -X
 *   - azimuth is measured clockwise from north, as in geography
 */

/** Linear interpolation between a and b for t in [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Clamp x into the inclusive range [min, max]. */
export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x))
}

/**
 * Wall thickness at height y for a wall that tapers linearly from base to top.
 *
 * The Maiden Tower's outer drum is (near-)vertical and the wall thins from the
 * INSIDE going up (docs/maiden-tower-reference.md), so the inner radius grows
 * with height. This returns thickness; the inner radius is derived from it.
 */
export function taperedWallThickness(
  y: number,
  height: number,
  baseThickness: number,
  topThickness: number,
): number {
  const t = clamp(y / height, 0, 1)
  return lerp(baseThickness, topThickness, t)
}

/** A direction in the XZ ground plane. */
export interface GroundDirection {
  x: number
  z: number
}

/**
 * Convert a compass azimuth (degrees, clockwise from north) to a unit
 * direction vector in the XZ plane using the project convention
 * (north = -Z, east = +X):
 *   0°   -> ( 0, -1)  north
 *   90°  -> ( 1,  0)  east
 *   180° -> ( 0,  1)  south
 *   270° -> (-1,  0)  west
 */
export function azimuthToVector(azimuthDeg: number): GroundDirection {
  const a = (azimuthDeg * Math.PI) / 180
  return { x: Math.sin(a), z: -Math.cos(a) }
}
