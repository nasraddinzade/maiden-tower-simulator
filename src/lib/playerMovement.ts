/**
 * Pure movement maths for the first-person controller (Phase 6).
 * No three.js, no rapier, no React — so it can be unit-tested (CLAUDE.md rule 6).
 *
 * World convention (CLAUDE.md rule 3): metres, Y up, north = −Z, east = +X.
 * Yaw is measured the same way as a three.js camera rotation about Y: at yaw 0
 * the camera looks along −Z (north).
 */

export interface MoveInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  run: boolean
}

export interface Planar {
  x: number
  z: number
}

/** No keys held. */
export const NO_INPUT: MoveInput = {
  forward: false,
  back: false,
  left: false,
  right: false,
  run: false,
}

/**
 * Ground velocity for the given key state and camera yaw.
 *
 * Diagonals are normalised, so holding two keys never outruns one — the classic
 * bug that makes a walk speed meaningless.
 */
export function moveVelocity(
  input: MoveInput,
  yawRad: number,
  walkSpeed: number,
  runSpeed: number,
): Planar {
  // local axes: forward is −Z rotated by yaw, right is +X rotated by yaw
  const sin = Math.sin(yawRad)
  const cos = Math.cos(yawRad)

  let localX = 0
  let localZ = 0
  if (input.forward) localZ -= 1
  if (input.back) localZ += 1
  if (input.left) localX -= 1
  if (input.right) localX += 1

  const len = Math.hypot(localX, localZ)
  if (len === 0) return { x: 0, z: 0 }
  localX /= len
  localZ /= len

  const speed = input.run ? runSpeed : walkSpeed
  // Rotate the local vector into world space the way three.js rotates a camera
  // about Y: local (x, z) → (x·cos + z·sin, −x·sin + z·cos). Check: at yaw 0 the
  // forward vector (0, −1) stays north (0, −1); at yaw −90° it becomes east (1, 0).
  return {
    x: (localX * cos + localZ * sin) * speed,
    z: (-localX * sin + localZ * cos) * speed,
  }
}

/**
 * Vertical velocity after one step of gravity, clamped to a terminal speed.
 * `grounded` resets the fall so standing still does not accumulate speed.
 */
export function applyGravity(
  verticalVelocity: number,
  dt: number,
  gravity: number,
  maxFallSpeed: number,
  grounded: boolean,
): number {
  if (grounded && verticalVelocity <= 0) return -0.1 // slight downward bias keeps contact
  const next = verticalVelocity - gravity * dt
  return Math.max(next, -maxFallSpeed)
}

/** Clamp a pitch angle so the view cannot tip past vertical. */
export function clampPitch(pitch: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, pitch))
}

/** Apply a pointer delta to yaw/pitch. Positive dx turns right. */
export function applyLook(
  yaw: number,
  pitch: number,
  dx: number,
  dy: number,
  sensitivity: number,
  pitchLimit: number,
): { yaw: number; pitch: number } {
  return {
    yaw: yaw - dx * sensitivity,
    pitch: clampPitch(pitch - dy * sensitivity, pitchLimit),
  }
}

/**
 * Where the debug teleport (keys 1..8) should drop the player on a storey:
 * on the floor, offset from the axis so they do not land in the oculus, and
 * clear of the wall.
 */
export function teleportTarget(
  floorY: number,
  innerRadius: number,
  oculusRadius: number,
  capsuleRadius: number,
): { x: number; y: number; z: number } {
  const inner = oculusRadius + capsuleRadius + 0.3
  const outer = innerRadius - capsuleRadius - 0.3
  // stand midway between the oculus rim and the wall, or as close as it fits
  const r = outer > inner ? (inner + outer) / 2 : Math.max(inner, 0)
  return { x: r, y: floorY + 0.1, z: 0 }
}

/** Normalised joystick vector → the same MoveInput the keyboard produces. */
export function joystickToInput(x: number, y: number, deadzone = 0.15, run = false): MoveInput {
  const mag = Math.hypot(x, y)
  if (mag < deadzone) return { ...NO_INPUT, run }
  return {
    forward: y < -deadzone,
    back: y > deadzone,
    left: x < -deadzone,
    right: x > deadzone,
    run,
  }
}
