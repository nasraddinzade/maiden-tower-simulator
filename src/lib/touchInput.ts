/**
 * Touch input mathematics for the first-person walk.
 *
 * No DOM, no React, no three.js — CLAUDE.md rule 6: the arithmetic that turns a
 * thumb into a velocity and a drag into an angle is testable, the widget that
 * draws the ring is not.
 *
 * World convention (rule 3): metres, Y up, north = −Z, east = +X. Screen
 * convention, which is the one that keeps catching people out: +x is right and
 * +y is DOWN, so pushing the stick forward is a NEGATIVE y.
 */

import { headingToWorld, type Planar } from './playerMovement'
import { NO_INSETS, type Insets, type Rect, type Viewport } from './screenLayout'

/**
 * A stick deflection in screen axes, already clamped to the ring: |v| ≤ 1.
 * `null` anywhere this type appears means no thumb is down at all, which is a
 * different thing from a thumb resting at the centre.
 */
export interface Stick {
  x: number
  y: number
}

/**
 * Screen delta from the spot the thumb first landed → a deflection clamped to
 * the ring.
 *
 * The ring RADIUS IS IN CSS PIXELS AND MUST NOT SCALE WITH THE VIEWPORT, which
 * is the opposite of the rule for look sensitivity below, and the reason is
 * physical: this is a thumb travelling over glass. A CSS pixel is a defined
 * angular size (1/96 in at arm's length, which is what a phone's devicePixelRatio
 * exists to hold constant), so a 56 px ring is the same piece of glass on every
 * phone. Scale it with the viewport and a tablet gets a stick no thumb can reach
 * the rim of.
 */
export function stickVector(dx: number, dy: number, radiusPx: number): Stick {
  if (!(radiusPx > 0)) return { x: 0, y: 0 }
  const mag = Math.hypot(dx, dy)
  if (mag === 0) return { x: 0, y: 0 }
  // clamp the LENGTH, not each axis: clamping x and y separately turns the ring
  // into a square and makes the diagonals 41% faster than the cardinals
  const scale = Math.min(1, mag / radiusPx) / mag
  return { x: dx * scale, y: dy * scale }
}

/**
 * How far the stick is thrown past its deadzone, rescaled to 0…1.
 *
 * The rescale is the point. Take the deflection raw and the walker jumps from
 * standing to `deadzone × walkSpeed` the instant the thumb crosses the
 * threshold; rescaled, the first millimetre past the deadzone is the first
 * millimetre of speed, and the throw is continuous from a standstill.
 */
export function stickThrow(x: number, y: number, deadzone: number): number {
  const mag = Math.min(1, Math.hypot(x, y))
  const dead = Math.min(Math.max(deadzone, 0), 1)
  if (mag <= dead) return 0
  if (dead >= 1) return 0
  return (mag - dead) / (1 - dead)
}

/**
 * Ground speed for a throw.
 *
 * ANALOG, WHICH THE BOOLEAN STICK COULD NOT BE. Until this commit the stick was
 * quantised to the same five booleans the keyboard produces (joystickToInput),
 * so every touch was full walking pace in one of eight directions: there was no
 * way to edge along a 0.9 m stair passage or to stop short of a 5 m drop through
 * an oculus, both of which this building asks for constantly.
 *
 * Continuous and monotone, with `runAt` the deflection where the throw reaches
 * ordinary walking pace — below it a proportional walk, above it a ramp to the
 * run. Putting walking pace short of the rim rather than at it is what leaves a
 * band for the jog: the rim used to be a boolean run flag, and now it is the top
 * of a ramp the thumb can sit anywhere on.
 */
export function stickSpeed(
  throwFraction: number,
  walkSpeed: number,
  runSpeed: number,
  runAt: number,
): number {
  const t = Math.min(1, Math.max(0, throwFraction))
  if (t <= 0) return 0
  // runAt ≥ 1 makes the branch below unreachable, since t is clamped to 1 —
  // which is the correct degenerate behaviour: no run band at all.
  if (t <= runAt) return runAt > 0 ? (walkSpeed * t) / runAt : walkSpeed
  return walkSpeed + ((runSpeed - walkSpeed) * (t - runAt)) / (1 - runAt)
}

export interface StickVelocityOptions {
  walkSpeed: number
  runSpeed: number
  deadzone: number
  runAt: number
}

/**
 * The whole movement mapping: a stick deflection and the direction the walker is
 * facing → ground velocity in world metres per second.
 *
 * The stick's own axes go straight into the local ones the keyboard produces:
 * screen-up is forward is local −Z, screen-right is strafe-right is local +X.
 * So this and moveVelocity() rotate through the same headingToWorld() and a
 * thumb pushed north walks exactly where W walks.
 */
export function stickVelocity(
  stick: Stick,
  yawRad: number,
  o: StickVelocityOptions,
): Planar {
  const mag = Math.hypot(stick.x, stick.y)
  if (mag === 0) return { x: 0, z: 0 }
  const speed = stickSpeed(stickThrow(stick.x, stick.y, o.deadzone), o.walkSpeed, o.runSpeed, o.runAt)
  if (speed === 0) return { x: 0, z: 0 }
  // direction only — the magnitude has already become a speed
  return headingToWorld(stick.x / mag, stick.y / mag, yawRad, speed)
}

/**
 * Radians of view per CSS pixel of drag, for a display whose SHORT side is
 * `shortSidePx`.
 *
 * MEASURED, AND IT IS WHY THIS IS NOT A CONSTANT. The mouse sensitivity
 * (0.0025 rad/px) times the 1.6 the touch path used to multiply it by is
 * 0.004 rad/px, so half a turn took 785 px of drag — 2.1 screen widths on a
 * 375 px phone. A visitor could not turn round to look at the room behind them
 * without three separate swipes.
 *
 * The reference length is the SHORT side of the display, not the width, so the
 * gesture feels the same when the phone is turned sideways to look at a
 * building — which is the first thing anyone does with a tower. Portrait and
 * landscape on the same phone give the same rad/px; a tablet, whose glass is
 * bigger and whose arm swings further, turns proportionally slower per pixel.
 *
 * Zero for a degenerate viewport: a viewport can measure 0 for a frame while
 * layout settles, and dividing by it would spin the camera. Zero turns nothing,
 * which is the safe answer for one frame.
 */
export function touchLookSensitivity(shortSidePx: number, turnPerSweepRad: number): number {
  if (!Number.isFinite(shortSidePx) || shortSidePx <= 0) return 0
  return turnPerSweepRad / shortSidePx
}

export interface ThumbZone {
  /** Fraction of the usable width the zone asks for, in from the leading edge. */
  widthFraction: number
  /** Fraction of the usable height the zone asks for, up from the bottom edge. */
  heightFraction: number
  /** Smallest span worth calling a zone; below it the stick is a spot to aim at. */
  minSpanPx: number
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * WHERE THE STICK MAY STAND, AS A RECTANGLE THE INTERFACE CANNOT REACH INTO.
 * 2026-08-24.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * A ZONE, NOT A SPOT, and that part is unchanged: the stick appears wherever
 * inside it the thumb lands, because a thumb reaching for a fixed circle has to
 * look at the screen to find it, and a visitor walking a building is looking at
 * the building. The zone is bounded rather than being the whole leading half so
 * that the upper leading corner is still somewhere to drag to LOOK.
 *
 * WHAT CHANGED IS THAT THE ZONE NOW KNOWS WHAT ELSE IS ON THE SCREEN. It used to
 * be two fractions of the canvas and nothing else, and measured at 812×375 that
 * put four fifths of it under the interface — a thumb at (100, 300) landed on
 * the datum notice and walked 0 m, one at (60, 350) landed on the exit-walk
 * button and left walk mode. The fractions were never wrong; they were answering
 * a question nobody had asked them, which is "how much of the glass", when the
 * question is "which part of the glass is mine".
 *
 * THREE THINGS BOUND IT, and all three are hard:
 *
 *   · THE SAFE AREA. A cutout or a rounded corner is glass a thumb cannot press,
 *     so the zone starts inside it. env() is not readable from script, so the
 *     insets are measured off a probe element and handed in — see
 *     hooks/useViewport.ts → useSafeAreaInsets().
 *   · THE INTERFACE'S OWN RECTANGLES, whatever they are. Not a list of controls
 *     kept in step by hand: the same compactChrome() the components lay
 *     themselves out from, so a strip that appears is a strip the zone already
 *     stands clear of.
 *   · THE RING'S RADIUS. The ring is planted where the thumb lands, so a plant
 *     within one radius of any of the above puts part of the ring where the
 *     thumb cannot follow it — off the glass, or over a button. This function
 *     returns the rectangle the RING may occupy; stickPlantRect() insets it by
 *     the radius to get the points a thumb may plant at.
 *
 * HOW IT RESOLVES, and the order is the honest part: vertically first, then
 * horizontally, both leaning toward the bottom leading corner where the hand is.
 * The vertical pass cuts the column the zone wants into free bands and takes the
 * LOWEST one that is big enough to be a zone; the horizontal pass does the same
 * across the band that survived, taking the most leading. Exact for a layout
 * whose chrome is a band along one edge, which is what the compact layout is;
 * for anything else it is conservative rather than optimal — it may hand back a
 * smaller rectangle than the largest free one, and it never hands back one that
 * overlaps.
 */
export function thumbZoneRect(
  v: Viewport,
  zone: ThumbZone,
  obstacles: Rect[] = [],
  insets: Insets = NO_INSETS,
): Rect {
  const left = insets.left
  const right = v.width - insets.right
  const top = insets.top
  const bottom = v.height - insets.bottom
  const usableW = Math.max(0, right - left)
  const usableH = Math.max(0, bottom - top)
  // what the fractions ask for, floored at a zone worth landing in and capped at
  // what there is: the floor is why a short landscape phone still gets a stick
  const wantW = Math.min(usableW, Math.max(usableW * zone.widthFraction, zone.minSpanPx))
  const wantH = Math.min(usableH, Math.max(usableH * zone.heightFraction, zone.minSpanPx))
  if (wantW <= 0 || wantH <= 0) return { x: left, y: bottom, w: 0, h: 0 }

  const live = obstacles.filter((r) => r.w > 0 && r.h > 0)

  // ── vertically: the lowest free band worth a zone, in the column it wants ──
  const inColumn = live.filter((r) => r.x < left + wantW && r.x + r.w > left)
  const [y0, y1] = freeSpan(
    inColumn.map((r) => [r.y, r.y + r.h]),
    top,
    bottom,
    zone.minSpanPx,
    'end',
  )
  const h = Math.max(0, Math.min(wantH, y1 - y0))
  const y = y1 - h

  // ── horizontally: the same, across the band that survived ─────────────────
  const inBand = live.filter((r) => r.y < y + h && r.y + r.h > y)
  const [x0, x1] = freeSpan(
    inBand.map((r) => [r.x, r.x + r.w]),
    left,
    right,
    zone.minSpanPx,
    'start',
  )
  const w = Math.max(0, Math.min(wantW, x1 - x0))

  return { x: x0, y, w, h }
}

/**
 * The interval [lo, hi] with the blocked ones taken out of it, resolved to the
 * ONE span the zone gets: the last one — the lowest, or the most leading — that
 * is at least `minSpan` long, and failing that the longest there is.
 *
 * The preference is the hand, not the arithmetic. A zone put in the tallest gap
 * on the screen would sit wherever the interface happened to leave room,
 * including the middle of the view, and a thumb does not reach the middle of the
 * view; a zone put in the lowest gap ends up in a 8 px slot between two strips
 * if that is what the bottom edge borders. Taking the lowest gap that is big
 * enough to be a zone at all is both of those answers where they agree and
 * neither where they do not.
 */
function freeSpan(
  blocked: [number, number][],
  lo: number,
  hi: number,
  minSpan: number,
  prefer: 'start' | 'end',
): [number, number] {
  const clipped = blocked
    .map(([a, b]): [number, number] => [Math.max(lo, a), Math.min(hi, b)])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0])

  const free: [number, number][] = []
  let cursor = lo
  for (const [a, b] of clipped) {
    if (a > cursor) free.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < hi) free.push([cursor, hi])
  if (free.length === 0) return [hi, hi]

  const worth = free.filter(([a, b]) => b - a >= minSpan)
  if (worth.length > 0) return prefer === 'end' ? worth[worth.length - 1] : worth[0]
  return free.reduce((best, span) => (span[1] - span[0] > best[1] - best[0] ? span : best))
}

/**
 * The points a thumb may plant the stick at: the zone less the ring's radius on
 * every side, so that the ring around any of them lies inside the zone.
 *
 * Zero width or height means there is no stick on this screen at all — the ring
 * does not fit in what the interface left. That is the honest answer rather than
 * a stick half off the glass, and screenLayout's viewport table asserts it never
 * happens on anything a visitor is likely to hold.
 */
export function stickPlantRect(zone: Rect, ringRadiusPx: number): Rect {
  const w = zone.w - 2 * ringRadiusPx
  const h = zone.h - 2 * ringRadiusPx
  if (w <= 0 || h <= 0) return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2, w: 0, h: 0 }
  return { x: zone.x + ringRadiusPx, y: zone.y + ringRadiusPx, w, h }
}

/**
 * Is this touch point somewhere the stick may be planted?
 *
 * The rectangle is stickPlantRect()'s, in the same CSS coordinates the touch
 * arrives in. An empty rectangle takes nothing — a screen with no room for a
 * ring has no movement zone, and every touch on it is a look.
 */
export function inThumbZone(x: number, y: number, plant: Rect): boolean {
  if (plant.w <= 0 || plant.h <= 0) return false
  return x >= plant.x && x <= plant.x + plant.w && y >= plant.y && y <= plant.y + plant.h
}

/** One line for the dev console: what the thumb was actually left. See App.tsx. */
export function describeThumbZone(zone: Rect, plant: Rect, ringRadiusPx: number): string {
  const r = (n: number) => Math.round(n)
  if (plant.w <= 0 || plant.h <= 0) {
    return `thumb zone ${r(zone.w)}×${r(zone.h)} at (${r(zone.x)}, ${r(zone.y)}) — NO ROOM for a ${
      2 * ringRadiusPx
    } px ring, no stick`
  }
  return (
    `thumb zone ${r(zone.w)}×${r(zone.h)} at (${r(zone.x)}, ${r(zone.y)}) — ` +
    `a ${2 * ringRadiusPx} px ring may be planted anywhere in ${r(plant.w)}×${r(plant.h)} ` +
    `at (${r(plant.x)}, ${r(plant.y)})`
  )
}
