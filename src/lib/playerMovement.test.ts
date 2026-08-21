import { describe, expect, it } from 'vitest'
import {
  applyGravity,
  applyLook,
  clampPitch,
  contactCycleDrift,
  desiredMovement,
  groundNormalOf,
  joystickToInput,
  moveVelocity,
  teleportTarget,
  NO_INPUT,
  UP,
  type MoveInput,
  type Vec3,
} from './playerMovement'
import { PLAYER } from '../config/player'
import { FLOORS, STAIR } from '../config/tower'

const held = (p: Partial<MoveInput>): MoveInput => ({ ...NO_INPUT, ...p })

describe('moveVelocity', () => {
  const W = PLAYER.walkSpeed
  const R = PLAYER.runSpeed

  it('stands still with no keys', () => {
    expect(moveVelocity(NO_INPUT, 0, W, R)).toEqual({ x: 0, z: 0 })
  })

  it('walks north at yaw 0 (north = −Z)', () => {
    const v = moveVelocity(held({ forward: true }), 0, W, R)
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.z).toBeCloseTo(-W, 10)
  })

  it('walks east when facing east', () => {
    // yaw −90° turns the camera to face +X
    const v = moveVelocity(held({ forward: true }), -Math.PI / 2, W, R)
    expect(v.x).toBeCloseTo(W, 10)
    expect(v.z).toBeCloseTo(0, 10)
  })

  it('strafes perpendicular to the facing', () => {
    const v = moveVelocity(held({ right: true }), 0, W, R)
    expect(v.x).toBeCloseTo(W, 10)
    expect(v.z).toBeCloseTo(0, 10)
  })

  it('never exceeds the walk speed on a diagonal', () => {
    const v = moveVelocity(held({ forward: true, right: true }), 0, W, R)
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(W, 10)
  })

  it('cancels opposite keys', () => {
    expect(moveVelocity(held({ forward: true, back: true }), 0, W, R)).toEqual({ x: 0, z: 0 })
    expect(moveVelocity(held({ left: true, right: true }), 0, W, R)).toEqual({ x: 0, z: 0 })
  })

  it('runs faster with Shift, but still at a human pace', () => {
    const walk = moveVelocity(held({ forward: true }), 0, W, R)
    const run = moveVelocity(held({ forward: true, run: true }), 0, W, R)
    expect(Math.hypot(run.x, run.z)).toBeGreaterThan(Math.hypot(walk.x, walk.z))
    // the spec's whole point: nothing near a shooter's 5 m/s
    expect(Math.hypot(run.x, run.z)).toBeLessThan(3.5)
  })

  it('keeps the configured walking speed at exactly 1.4 m/s', () => {
    expect(PLAYER.walkSpeed).toBe(1.4)
  })

  it('preserves speed at every heading', () => {
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.3) {
      const v = moveVelocity(held({ forward: true }), yaw, W, R)
      expect(Math.hypot(v.x, v.z)).toBeCloseTo(W, 10)
    }
  })
})

describe('gravity', () => {
  const { gravity, maxFallSpeed, groundContactBias: bias } = PLAYER

  it('accelerates downward while airborne', () => {
    const v1 = applyGravity(0, 1 / 60, gravity, maxFallSpeed, false, bias)
    const v2 = applyGravity(v1, 1 / 60, gravity, maxFallSpeed, false, bias)
    expect(v1).toBeLessThan(0)
    expect(v2).toBeLessThan(v1)
  })

  it('reaches a terminal speed rather than falling forever faster', () => {
    let v = 0
    for (let i = 0; i < 2000; i++) v = applyGravity(v, 1 / 60, gravity, maxFallSpeed, false, bias)
    expect(v).toBeCloseTo(-maxFallSpeed, 6)
  })

  it('does not accumulate speed while standing', () => {
    let v = 0
    for (let i = 0; i < 100; i++) v = applyGravity(v, 1 / 60, gravity, maxFallSpeed, true, bias)
    expect(v).toBeGreaterThan(-1)
  })
})

describe('looking around', () => {
  it('clamps pitch below vertical so the view never rolls over', () => {
    expect(clampPitch(10, PLAYER.maxPitchRad)).toBe(PLAYER.maxPitchRad)
    expect(clampPitch(-10, PLAYER.maxPitchRad)).toBe(-PLAYER.maxPitchRad)
    expect(Math.abs(clampPitch(10, PLAYER.maxPitchRad))).toBeLessThan(Math.PI / 2)
  })

  it('turns right for a positive dx', () => {
    const { yaw } = applyLook(0, 0, 100, 0, PLAYER.lookSensitivity, PLAYER.maxPitchRad)
    expect(yaw).toBeLessThan(0) // yaw decreases turning right, matching three.js
  })

  it('keeps pitch inside the limit however hard you drag', () => {
    let pitch = 0
    for (let i = 0; i < 500; i++) {
      pitch = applyLook(0, pitch, 0, -100, PLAYER.lookSensitivity, PLAYER.maxPitchRad).pitch
    }
    expect(pitch).toBeCloseTo(PLAYER.maxPitchRad, 10)
  })
})

describe('debug teleport (keys 1..8)', () => {
  it('lands on every storey without dropping the player through the oculus', () => {
    for (const f of FLOORS) {
      const t = teleportTarget(f.floorY, f.innerRadiusAtLevel, f.oculusRadius, PLAYER.radius)
      const r = Math.hypot(t.x, t.z)
      expect(t.y).toBeGreaterThan(f.floorY)
      // clear of the opening…
      expect(r).toBeGreaterThan(f.oculusRadius + PLAYER.radius)
      // …and not inside the wall
      expect(r).toBeLessThan(f.innerRadiusAtLevel - PLAYER.radius)
    }
  })
})

describe('touch joystick', () => {
  it('ignores small wobbles inside the deadzone', () => {
    expect(joystickToInput(0.05, 0.05)).toEqual(NO_INPUT)
  })
  it('pushes forward when the stick goes up', () => {
    expect(joystickToInput(0, -1).forward).toBe(true)
  })
  it('maps the four quadrants the same way the keys do', () => {
    expect(joystickToInput(1, 0).right).toBe(true)
    expect(joystickToInput(-1, 0).left).toBe(true)
    expect(joystickToInput(0, 1).back).toBe(true)
  })
  it('carries the run flag through', () => {
    expect(joystickToInput(0, -1, 0.15, true).run).toBe(true)
  })
})

/*
 * THE SLIDE ON A FLIGHT. See lib/playerMovement.ts → contactCycleDrift for the
 * trace these numbers come from. Every assertion below is arithmetic; nothing
 * here renders or steps a physics world (CLAUDE.md rule 6).
 */

/** Unit normal of a plane pitched `deg` from horizontal, falling toward +X. */
const slopeNormal = (deg: number): Vec3 => ({
  x: -Math.sin(deg * (Math.PI / 180)),
  y: Math.cos(deg * (Math.PI / 180)),
  z: 0,
})

/** The pitch of the masonry flights: the derived riser over the derived going. */
const FLIGHT_DEG = (Math.atan2(STAIR.riserTarget, STAIR.goingTarget) * 180) / Math.PI
const DOWN: Vec3 = { x: 0, y: -1, z: 0 }
const NO_PLANAR = { x: 0, z: 0 }

describe('standing on a slope', () => {
  it('measures the flight this tower actually has, near 34°', () => {
    // not a magic number: it is atan(0.2 / 0.3), the two figures the stair is
    // planned from, and the live model reads its ramp normals at 34.36°
    expect(FLIGHT_DEG).toBeCloseTo(33.69, 2)
  })

  it('a nudge along the normal, undone straight down, banks nudge·sinθ every cycle', () => {
    // the fault, as it stood: rapier lifts the capsule off the stone along the
    // CONTACT NORMAL and gravity's bias plus snapToGround bring it back along −Y
    const k = PLAYER.normalNudgeFactor
    for (const deg of [10, 20, FLIGHT_DEG, 38, 45]) {
      const drift = contactCycleDrift(slopeNormal(deg), k, DOWN)
      expect(drift).toBeCloseTo(k * Math.sin(deg * (Math.PI / 180)), 12)
    }
    // and on the level the two lines are one, which is why the floors were clean
    expect(contactCycleDrift(UP, k, DOWN)).toBeCloseTo(0, 12)
  })

  it('returning along the normal instead banks nothing, at any climbable pitch', () => {
    const k = PLAYER.normalNudgeFactor
    for (let deg = 0; deg <= PLAYER.maxSlopeClimbAngleDeg; deg += 2.5) {
      const n = slopeNormal(deg)
      const move = desiredMovement({
        planar: NO_PLANAR,
        verticalVelocity: -PLAYER.groundContactBias,
        dt: 1 / 60,
        grounded: true,
        groundNormal: n,
        nudge: k,
      })
      expect(contactCycleDrift(n, k, move)).toBeCloseTo(0, 12)
    }
  })

  it('the standing walker is pushed INTO the stone and nowhere else', () => {
    const n = slopeNormal(FLIGHT_DEG)
    const move = desiredMovement({
      planar: NO_PLANAR,
      verticalVelocity: -PLAYER.groundContactBias,
      dt: 1 / 60,
      grounded: true,
      groundNormal: n,
      nudge: PLAYER.normalNudgeFactor,
    })
    // antiparallel to the normal: no component along the surface at all
    const len = Math.hypot(move.x, move.y, move.z)
    expect((move.x * n.x + move.y * n.y + move.z * n.z) / len).toBeCloseTo(-1, 12)
  })

  it('is bit-for-bit the old vertical bias on a level floor', () => {
    const move = desiredMovement({
      planar: { x: 0.7, z: -0.4 },
      verticalVelocity: -PLAYER.groundContactBias,
      dt: 1 / 60,
      grounded: true,
      groundNormal: UP,
      nudge: PLAYER.normalNudgeFactor,
    })
    expect(move.x).toBe(0.7 / 60)
    expect(move.z).toBe(-0.4 / 60)
    expect(move.y).toBeCloseTo(-PLAYER.groundContactBias / 60, 15)
  })

  it('never asks for less than the nudge it has to give back', () => {
    // a bias is a speed and a nudge is a displacement: they only meet at one
    // frame rate, and below it the capsule climbs its own nudge and ratchets
    for (const hz of [30, 60, 90, 120, 144, 240]) {
      const move = desiredMovement({
        planar: NO_PLANAR,
        verticalVelocity: -PLAYER.groundContactBias,
        dt: 1 / hz,
        grounded: true,
        groundNormal: slopeNormal(FLIGHT_DEG),
        nudge: PLAYER.normalNudgeFactor,
      })
      expect(Math.hypot(move.x, move.y, move.z)).toBeGreaterThanOrEqual(
        PLAYER.normalNudgeFactor - 1e-15,
      )
    }
  })

  it('falls straight down once the stone is gone', () => {
    const move = desiredMovement({
      planar: NO_PLANAR,
      verticalVelocity: -4.2,
      dt: 1 / 60,
      grounded: false,
      groundNormal: slopeNormal(FLIGHT_DEG),
      nudge: PLAYER.normalNudgeFactor,
    })
    expect(move.x).toBe(0)
    expect(move.z).toBe(0)
    expect(move.y).toBeCloseTo(-4.2 / 60, 15)
  })
})

describe('which surface the walker is standing on', () => {
  const climb = PLAYER.maxSlopeClimbAngleDeg * (Math.PI / 180)

  it('says NOTHING when the controller resolved nothing, rather than saying level', () => {
    // the caller keeps the surface it last stood on; answering UP here would
    // put a vertical bias under a walker still standing on a 34° tread
    expect(groundNormalOf([], climb)).toBeNull()
  })

  it('throws away a wall, which is a contact but not a floor', () => {
    const wall: Vec3 = { x: 1, y: 0, z: 0 }
    expect(groundNormalOf([wall], climb)).toBeNull()
  })

  it('rejects anything steeper than the walker can climb', () => {
    expect(groundNormalOf([slopeNormal(PLAYER.maxSlopeClimbAngleDeg + 1)], climb)).toBeNull()
    expect(groundNormalOf([slopeNormal(PLAYER.maxSlopeClimbAngleDeg - 1)], climb)).not.toBeNull()
  })

  it('keeps a tread at the flight’s own pitch', () => {
    const n = slopeNormal(FLIGHT_DEG)
    const got = groundNormalOf([n], climb)!
    expect(got.y).toBeCloseTo(n.y, 12)
    expect(got.x).toBeCloseTo(n.x, 12)
  })

  it('normalises whatever it is handed', () => {
    const got = groundNormalOf([{ x: 0, y: 3, z: 0 }], climb)!
    expect(Math.hypot(got.x, got.y, got.z)).toBeCloseTo(1, 12)
  })

  it('takes the flattest of several, which under-corrects rather than pushing uphill', () => {
    const got = groundNormalOf([slopeNormal(40), slopeNormal(12), slopeNormal(31)], climb)!
    expect(got.y).toBeCloseTo(Math.cos(12 * (Math.PI / 180)), 12)
  })
})
