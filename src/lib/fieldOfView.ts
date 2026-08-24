/**
 * How wide the view is, as arithmetic.
 *
 * three.js's `PerspectiveCamera.fov` is the VERTICAL angle, and a viewport that
 * is taller than it is wide turns a generous vertical into a horizontal slot:
 * 50° vertical on a 375×812 phone is 24.3° across. What a person standing in a
 * building needs held is the horizontal — that is the axis a wall leaves the
 * frame on — so this converts the other way and hands the renderer the vertical
 * the aspect implies.
 *
 * The rule itself, its three numbers and the reasoning for each are in
 * config/camera.ts. Everything here is pure and degrees in, degrees out, so the
 * whole policy can be asserted without a canvas.
 */

import type { FovRule } from '../config/camera'

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/**
 * The vertical angle that a given horizontal angle implies at this aspect.
 *
 *     tan(v/2) = tan(h/2) / aspect
 *
 * which is the same relation three.js's projection matrix is built from, read
 * from the other end.
 */
export function verticalFromHorizontal(horizontalDeg: number, aspect: number): number {
  return 2 * Math.atan(Math.tan((horizontalDeg * DEG) / 2) / aspect) * RAD
}

/** The inverse: what a vertical angle comes out as across the frame. */
export function horizontalFromVertical(verticalDeg: number, aspect: number): number {
  return 2 * Math.atan(Math.tan((verticalDeg * DEG) / 2) * aspect) * RAD
}

/**
 * The vertical fov to give three.js for a viewport of this shape.
 *
 * Hold the horizontal, derive the vertical, then clamp it at both ends. The two
 * clamps are not tidying: the floor is what guarantees no screen ever loses
 * field it has today, and the ceiling is what stops a portrait phone asking for
 * a 120° vertical. See config/camera.ts for both.
 *
 * A viewport with no area — a canvas measured before layout, a tab restored at
 * zero height — has no aspect ratio to reason from, so it gets the floor, which
 * is the value the app shipped with. It is a frame nobody is looking at either
 * way; what matters is that it is a number and not a NaN, because a NaN reaches
 * the projection matrix and the scene disappears until the next resize.
 */
export function verticalFovFor(aspect: number, rule: FovRule): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return rule.verticalMinDeg
  const derived = verticalFromHorizontal(rule.horizontalDeg, aspect)
  return Math.min(Math.max(derived, rule.verticalMinDeg), rule.verticalMaxDeg)
}

/**
 * What the frame actually gets across, once the clamps have had their say.
 *
 * Not always `rule.horizontalDeg`: wider than the crossover the floor binds and
 * the horizontal opens past it (an ultrawide desktop keeps its 95.7°), and on a
 * portrait phone the ceiling binds and the horizontal falls short of it (49.6°
 * rather than 70°). This is the number to quote when asking what a visitor can
 * see, and it is what the tests compare against the shipped camera.
 *
 * A viewport with no area gets the angle the rule holds rather than the floor's
 * horizontal: with no aspect there is no frame to have collapsed it.
 */
export function horizontalFovFor(aspect: number, rule: FovRule): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return rule.horizontalDeg
  return horizontalFromVertical(verticalFovFor(aspect, rule), aspect)
}
