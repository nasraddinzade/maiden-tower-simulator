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

/** A direction or a displacement in world space. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** World up (CLAUDE.md rule 3). */
export const UP: Vec3 = { x: 0, y: 1, z: 0 }

function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-9) return UP
  return { x: v.x / len, y: v.y / len, z: v.z / len }
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
 * `grounded` resets the fall so standing still does not accumulate speed, and
 * replaces it with `contactBias` — a small speed toward the surface, which is
 * what keeps the controller reporting `grounded` at all. Its DIRECTION is not
 * decided here: see desiredMovement().
 */
export function applyGravity(
  verticalVelocity: number,
  dt: number,
  gravity: number,
  maxFallSpeed: number,
  grounded: boolean,
  contactBias: number,
): number {
  if (grounded && verticalVelocity <= 0) return -Math.abs(contactBias)
  const next = verticalVelocity - gravity * dt
  return Math.max(next, -maxFallSpeed)
}

/**
 * The surface the walker is standing on, out of the contacts the character
 * controller resolved. Anything steeper than the climb angle is a wall, not a
 * floor, and is thrown away.
 *
 * NULL, NOT UP, when nothing qualifies. A grounded step can resolve no contact
 * at all — the movement was absorbed, or snapToGround alone kept `grounded`
 * true — and answering UP there would put a vertical bias under a walker still
 * standing on a 34° tread, which is one turn of the old ratchet. So the caller
 * holds the surface it last stood on and only leaving the ground resets it.
 * Worth a tenth: standing on the flight under the real animation loop, where
 * the frame time jitters and those steps happen, 0.00076…0.00093 m/s answering
 * UP against 0.00065…0.00082 m/s holding the last normal. Small because the
 * case is rare, kept because it is free and it is the truthful answer.
 *
 * Walked and counted rather than assumed: on the masonry flight, on the modern
 * spiral, on a chamber floor and on the roof deck the controller reports at
 * most ONE contact per step, so the choice among several is arithmetic that has
 * never yet been exercised. When it is — a tread nosing and its ramp at the
 * same instant — the flattest of them wins, because that is the one whose
 * normal the settling body is nearest to travelling along, and the error of
 * choosing it is to under-correct toward the old vertical behaviour rather than
 * to push the walker uphill.
 */
export function groundNormalOf(
  contacts: readonly Vec3[],
  maxSlopeClimbAngleRad: number,
): Vec3 | null {
  const minY = Math.cos(maxSlopeClimbAngleRad)
  let best: Vec3 | null = null
  for (const c of contacts) {
    const n = normalise(c)
    if (n.y < minY) continue
    if (!best || n.y > best.y) best = n
  }
  return best
}

/**
 * How far HORIZONTALLY one push-off-and-settle cycle carries a body that is
 * shoved `nudge` metres along `normal` and then comes back down along
 * `descent`. Metres per cycle; the sign is dropped, it is a distance.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THIS IS THE SLIDE. 2026-08-21.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * A walker standing still on the 34.3° masonry flight crept downhill, and the
 * repository blamed the "slight downward bias" that used to be a literal −0.1
 * inside applyGravity. Instrumented on the controller instead — desired in,
 * computed out, one line per step, standing on that flight at 60 Hz:
 *
 *   desired  (0.0000, −1.6667, 0.0000) mm      contact normal
 *   computed (−0.5063, +0.7734, +0.2487) mm    (−0.5063, 0.8257, 0.2487)
 *
 * The walker asked to move 1.67 mm straight DOWN and was moved 0.56 mm
 * SIDEWAYS. Every horizontal figure in that trace is the contact normal times
 * one millimetre, to four decimal places, on every frame: it is
 * PLAYER.normalNudgeFactor, the same solver parameter as the shake in 54ace67,
 * applied as an absolute displacement ALONG THE CONTACT NORMAL. Not a
 * projection of the bias — rapier's own minSlopeSlideAngle removes that, and
 * the arithmetic proves it: 1.667·sinθ·cosθ would be 0.78 mm and the trace
 * shows 0.56, which is 0.001·sinθ.
 *
 * SO THE TWO DIRECTIONS DID NOT MATCH. The nudge pushes the capsule off the
 * stone along the NORMAL; gravity's bias and snapToGround bring it back along
 * −Y. On a flat floor those are one line and the cycle closes on itself, which
 * is why the floors were always clean. On a slope they differ by the pitch, and
 * every cycle banks the difference: `nudge · sin θ` downhill, and nothing in
 * the loop ever gives it back. Standing is not special — walking gets the same
 * push, it is just outrun by the 1.4 m/s.
 *
 * MEASURED AGAINST THIS FUNCTION, on the flight, one contact per frame at
 * 60 Hz: 0.001 × sin 34.36° = 0.5641 mm per cycle, 0.03384 m/s. The live world
 * gave 0.03359 m/s over ten seconds. Nothing else is needed to explain it.
 */
export function contactCycleDrift(normal: Vec3, nudge: number, descent: Vec3): number {
  const n = normalise(normal)
  const d = normalise(descent)
  const horizontal = Math.hypot(n.x, n.z)
  // how much of the descent goes INTO the surface: the rate the gap closes
  const closing = -(n.x * d.x + n.y * d.y + n.z * d.z)
  // a descent that does not close the gap never settles; the push stands whole
  if (closing <= 1e-9) return Math.abs(nudge) * horizontal
  const travel = nudge / closing
  return Math.hypot(n.x * nudge + d.x * travel, n.z * nudge + d.z * travel)
}

export interface DesiredMovement {
  /** Ground velocity from moveVelocity(), m/s. */
  planar: Planar
  /** Vertical velocity from applyGravity(), m/s. Negative is down. */
  verticalVelocity: number
  /** Frame time, seconds. */
  dt: number
  /** What the character controller reported after the previous step. */
  grounded: boolean
  /** The surface under the walker, from groundNormalOf(). */
  groundNormal: Vec3
  /** PLAYER.normalNudgeFactor — the displacement the solver adds along a contact normal. */
  nudge: number
}

/**
 * The displacement to hand the character controller for one frame.
 *
 * IN CONTACT THE BIAS RUNS ALONG THE GROUND'S OWN NORMAL, not along −Y, and
 * that one change is the whole repair. The bias exists to spend the solver's
 * nudge — to put the capsule back on the stone it was just pushed off, so the
 * next step still resolves a contact and `grounded` stays true. Spend it along
 * the line it was applied on and the cycle closes exactly: contactCycleDrift
 * returns zero on every slope, and on a level floor the vector is bit-for-bit
 * what this controller has always sent. It is not a projection ONTO the
 * surface — that would still leave the nudge standing, since the nudge is
 * perpendicular to the surface and has no tangential part to remove. It is a
 * return along the same line.
 *
 * AND THE STEP HAS A FLOOR UNDER IT, because a bias is a SPEED and the nudge is
 * a DISPLACEMENT, and the two only meet at one frame rate. 0.1 m/s is 1.67 mm
 * at 60 Hz and covers the millimetre; at 240 Hz it is 0.42 mm and does not, so
 * the capsule climbs its own nudge, leaves contact, and the ratchet turns again
 * on the way back. The old controller had the same disease from the other end —
 * its creep on the flight DOUBLED from 0.0338 m/s at 60 Hz to 0.0677 at 240,
 * a visitor sliding faster on a faster screen — and returning along the normal
 * without a floor does not cure it: built that way and walked, the flight gives
 * 0.000000 m/s at 60 Hz, 0.005641 at 120 and 0.039225 at 240, which at 240 is
 * worse than the fault it replaces. With the floor: 0.000000 at all three.
 * So the grounded step is `max(bias·dt, nudge)`. The bias is what it was, and
 * the nudge is the least it can be — not a chosen number, but the exact amount
 * the solver moved the capsule and therefore the exact amount owed back.
 *
 * Airborne, gravity is vertical and this returns what it always did: a fall is
 * a fall, and the walker's own planar velocity is horizontal by construction.
 */
export function desiredMovement(p: DesiredMovement): Vec3 {
  const { planar, verticalVelocity, dt, grounded, groundNormal, nudge } = p
  const x = planar.x * dt
  const z = planar.z * dt
  if (!grounded || verticalVelocity > 0) return { x, y: verticalVelocity * dt, z }
  const n = normalise(groundNormal)
  const step = Math.max(Math.abs(verticalVelocity) * dt, Math.abs(nudge))
  return { x: x - n.x * step, y: -n.y * step, z: z - n.z * step }
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
