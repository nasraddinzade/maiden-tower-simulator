/**
 * What of the inside of the tower an eye outside it can actually see.
 *
 * ————————————————————————— why this file exists —————————————————————————
 *
 * docs/optimization-addendum.md, Phase 11 point 2, asks for portal culling
 * through the oculi and calls it "самая большая победа в этом проекте,
 * потенциально 60-70% draw call'ов". Measured, on this model, at 375×812 with
 * the storey window already running:
 *
 *   hiding the two neighbouring storeys, storey 1   43 → 43 draw calls
 *                                        storey 4   45 → 44
 *                                        storey 6   44 → 42
 *
 * Nought to two. The estimate assumed a renderer that draws whatever it is
 * handed, and three.js is not one: it frustum-culls every object by its bounding
 * sphere before it issues a call, so a storey behind the camera or above the top
 * of the frame has ALREADY cost nothing. The index window in lib/visibility.ts
 * was removing work the renderer was not doing. Neither is any of the interior
 * structure a shadow caster, so nothing of it reaches the shadow pass either.
 *
 * What frustum culling cannot see is STONE. An object inside the frustum but
 * behind a wall is drawn in full, and the tower is a 4 m thick drum with eight
 * closed rooms stacked inside it. Measured from the default view — the camera at
 * (36, 24, 36) the visitor lands on:
 *
 *   the whole interior stack hidden   104 → 81 draw calls, 122 644 → 113 236 tris
 *
 * Twenty-three draw calls and 9 408 triangles, every frame, of eight floors and
 * eight vaults sealed inside an opaque cylinder. That is the win the addendum
 * was pointing at, and it is on the OUTSIDE of the building: the portals that
 * matter are not the oculi between the storeys but the openings through the
 * drum, and the cull is the one the shell already implies.
 *
 * ——————————————————————— the test, and why it holds ———————————————————————
 *
 * An eye outside the drum sees the interior only along a line that clears both
 * faces of an opening. That is the same question lib/sun.ts already answers for
 * sunlight — "a slit deep in a 4 m wall admits light only within a few degrees
 * of its normal" — asked of the eye instead of the sun, and it has the same
 * answer, because a light path is reversible. The arithmetic here is
 * beamThroughOpening()'s, with one term added.
 *
 * THE TERM IS THE ONE THE SUN DOES NOT NEED. The sun's rays are parallel: every
 * ray through the opening arrives at the same bearing, so a beam gets through
 * iff depth·tanθ ≤ (outerWidth + innerWidth)/2 — one edge of the outer aperture
 * to the opposite edge of the inner. An eye at a finite distance sends a
 * different ray through every point of the outer aperture, so it sees through if
 * ANY of them lands inside the inner one. Writing d for the eye's perpendicular
 * distance to the outer face, D for the depth of the reveal, a and b for the
 * outer and inner half-widths, and x for the eye's offset along the face: a ray
 * through outer point u ∈ [−a, a] meets the inner plane at u(1 + D/d) − xD/d.
 * That is increasing in u, so its range is non-empty against [−b, b] exactly
 * when
 *
 *      D·|x|/d  ≤  a + b + a·D/d
 *
 * The left side is D·tanθ, the sun's own quantity. The right side is the sun's
 * budget plus a·D/d, which is positive and falls away as the eye retreats. So
 * this test is the sun's test RELAXED — it can only ever decide that more is
 * visible, never less — and it agrees with it in the limit. That direction is
 * the one that matters: an error here draws geometry nobody can see, which costs
 * a frame; the opposite error would put a hole in the building.
 *
 * The reveal is a linear splay between two rectangles, so the passage is their
 * convex hull and a line that enters the outer and leaves the inner cannot have
 * left the stone in between. The test is therefore exact for the opening as the
 * shell actually cuts it, not an approximation of it.
 *
 * ——————————————————————————— what it is fed ———————————————————————————
 *
 * OpeningAperture, unchanged, from the SAME array that cuts the shell — App
 * builds it once and hands it to the beams and to this. An opening the shell did
 * not cut cannot appear here, and one it did cannot go missing; that is the
 * whole reason buildApertures() takes the cut list rather than re-reading the
 * data file, and the same reason applies twice as hard to a test that decides
 * whether to draw a floor.
 *
 * The doorway is the exception and is handled by the caller, not here: the
 * survey gives its outer width and height and says nothing about how far it
 * opens out on the room side, and guessing an inner dimension for it would make
 * the test STRICTER than the doorway is — the unsafe direction. See
 * ENTRANCE_ADMITS_SIGHT below.
 */

import { azimuthToVector } from './geometry'
import type { OpeningAperture } from './sun'

export interface Point3 {
  x: number
  y: number
  z: number
}

/** A frustum plane, ax + by + cz + d ≥ 0 inside. Normals point inward. */
export interface Plane {
  a: number
  b: number
  c: number
  d: number
}

/**
 * The six frustum planes of a view-projection matrix, Gribb–Hartmann.
 *
 * `m` is column-major with the same layout three.js uses for Matrix4.elements,
 * so `m[i + 4 * j]` is row i, column j.
 */
export function frustumPlanes(m: readonly number[]): Plane[] {
  const row = (i: number) => [m[i], m[i + 4], m[i + 8], m[i + 12]] as const
  const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)]
  const make = (s: readonly number[], t: readonly number[], sign: 1 | -1): Plane => {
    const a = t[0] + sign * s[0]
    const b = t[1] + sign * s[1]
    const c = t[2] + sign * s[2]
    const d = t[3] + sign * s[3]
    const len = Math.hypot(a, b, c) || 1
    return { a: a / len, b: b / len, c: c / len, d: d / len }
  }
  return [
    make(r0, r3, 1), // left
    make(r0, r3, -1), // right
    make(r1, r3, 1), // bottom
    make(r1, r3, -1), // top
    make(r2, r3, 1), // near
    make(r2, r3, -1), // far
  ]
}

/** Whether any part of a sphere is on the inside of every plane. */
export function sphereInFrustum(
  planes: readonly Plane[],
  centre: Point3,
  radius: number,
): boolean {
  for (const p of planes) {
    if (p.a * centre.x + p.b * centre.y + p.c * centre.z + p.d < -radius) return false
  }
  return true
}

/** The centre of an opening's OUTER face, in world coordinates. */
export function outerFaceCentre(opening: OpeningAperture): Point3 {
  const n = azimuthToVector(opening.azimuthDeg)
  return { x: n.x * opening.outerRadius, y: opening.centreY, z: n.z * opening.outerRadius }
}

/**
 * A sphere that contains the opening's outer face, for the frustum test. The
 * diagonal half-length, so the sphere cannot be smaller than the rectangle.
 */
export function outerFaceRadius(opening: OpeningAperture): number {
  return Math.hypot(opening.outerWidth, opening.outerHeight) / 2
}

/**
 * Whether an eye at `eye` can see through this opening into the tower.
 *
 * See the head of the file for the derivation. Returns false when the eye is on
 * or behind the outer face — an eye inside the wall is not outside the building,
 * and the caller has already dealt with that case.
 */
export function eyeSeesThrough(eye: Point3, opening: OpeningAperture): boolean {
  const n = azimuthToVector(opening.azimuthDeg)
  const centre = outerFaceCentre(opening)
  const vx = eye.x - centre.x
  const vy = eye.y - centre.y
  const vz = eye.z - centre.z

  // perpendicular distance out from the face; the eye must be in front of it
  const d = vx * n.x + vz * n.z
  if (d <= 0) return false

  // the face's own axes: horizontal tangent, and world up
  const lateral = Math.abs(vx * -n.z + vz * n.x)
  const vertical = Math.abs(vy)

  const depth = Math.max(0.01, opening.outerRadius - opening.revealEndRadius)

  const lateralBudget = (opening.outerWidth + opening.innerWidth) / 2 + (opening.outerWidth / 2) * (depth / d)
  const verticalBudget =
    (opening.outerHeight + opening.innerHeight) / 2 + (opening.outerHeight / 2) * (depth / d)

  return (depth * lateral) / d <= lateralBudget && (depth * vertical) / d <= verticalBudget
}

export interface InteriorSightOptions {
  /**
   * The doorway, which has no surveyed inner dimensions and is therefore not
   * tested through the reveal at all — only for which way it faces. See
   * ENTRANCE_ADMITS_SIGHT.
   */
  entrance?: { azimuthDeg: number; centreY: number; outerRadius: number; width: number; height: number }
  /**
   * Radius of a cylinder that contains ALL the masonry — the drum AND the beak.
   *
   * NOT the drum's radius, and the difference is a hole in the tower. The
   * buttress projects 10.7 m past the wall ([OSM], config/tower.ts), so a camera
   * 14 m from the axis on the beak's bearing is standing INSIDE the building.
   * Every surface around it is then a back face, the shell is drawn FrontSide,
   * and the eye looks straight through the stone into the rooms — measured, at
   * azimuth 105° and 14 m out: 45% of the frame changes when the interior is
   * dropped. A test that only knew the drum called that camera "outside" and
   * culled what it could plainly see.
   */
  hullRadius: number
  /** Y range the building occupies, so a camera beside it is not "inside" it. */
  bottomY: number
  topY: number
}

/**
 * THE DOORWAY IS NOT PUT THROUGH THE REVEAL TEST, and the reason is rule 1.
 *
 * ENTRANCE gives width 1.1 and height 2.035 at the outer face — both measured —
 * and nothing at all about the room side. The reveal test needs both faces, and
 * an inner dimension invented for it would be an invented dimension doing real
 * work: too small and the test decides the doorway shows nothing when it shows a
 * strip of the entry chamber's floor, which is a hole in the model on a public
 * site. Front-facing and in frame is what can be said about it without making
 * anything up, and it is the safe half of what could be said. The cost is that
 * the cull stops firing from the west, which is the one bearing from which the
 * doorway genuinely does show the inside.
 */
export const ENTRANCE_ADMITS_SIGHT =
  'the doorway is tested for facing only — no surveyed inner dimension exists to test its reveal against'

/**
 * Whether the interior structure has to be drawn for a camera outside the drum.
 *
 * True whenever anything might be visible; the only false is a proof that
 * nothing is. Every uncertainty resolves to true.
 */
export function interiorVisibleFromOutside(
  eye: Point3,
  planes: readonly Plane[],
  openings: readonly OpeningAperture[],
  options: InteriorSightOptions,
): boolean {
  // A camera inside the building — or inside the beak, which reaches 10.7 m
  // further out than the wall — is not looking through anything. Orbit controls
  // will happily fly through masonry, and from in there the answer is always yes.
  const fromAxis = Math.hypot(eye.x, eye.z)
  if (fromAxis <= options.hullRadius && eye.y >= options.bottomY && eye.y <= options.topY) {
    return true
  }
  // Nothing to prove anything with. Draw it.
  if (openings.length === 0) return true

  if (options.entrance) {
    const e = options.entrance
    const n = azimuthToVector(e.azimuthDeg)
    const centre = { x: n.x * e.outerRadius, y: e.centreY, z: n.z * e.outerRadius }
    const facing = (eye.x - centre.x) * n.x + (eye.z - centre.z) * n.z > 0
    if (facing && sphereInFrustum(planes, centre, Math.hypot(e.width, e.height) / 2)) return true
  }

  for (const o of openings) {
    if (!eyeSeesThrough(eye, o)) continue
    if (sphereInFrustum(planes, outerFaceCentre(o), outerFaceRadius(o))) return true
  }
  return false
}
