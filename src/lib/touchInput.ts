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
  /** Fraction of the viewport width the zone reaches in from the left edge. */
  widthFraction: number
  /** Fraction of the viewport height the zone reaches up from the bottom edge. */
  heightFraction: number
}

/**
 * Is this touch point in the movement zone?
 *
 * A ZONE, NOT A SPOT, and not the whole left half either. The stick appears
 * wherever inside it the thumb lands, because a thumb reaching for a fixed
 * circle has to look at the screen to find it and a visitor walking a building
 * is looking at the building. The zone is bounded rather than being the entire
 * left half so that the upper left is still somewhere to drag to LOOK — a
 * left-handed visitor, or anyone whose eye is drawn to something on that side,
 * otherwise finds half the screen turns into a joystick.
 */
export function inThumbZone(
  x: number,
  y: number,
  width: number,
  height: number,
  zone: ThumbZone,
): boolean {
  return x >= 0 && x <= width * zone.widthFraction && y >= height * (1 - zone.heightFraction) && y <= height
}
