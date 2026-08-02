import { describe, expect, it } from 'vitest'
import {
  applyGravity,
  applyLook,
  clampPitch,
  joystickToInput,
  moveVelocity,
  teleportTarget,
  NO_INPUT,
  type MoveInput,
} from './playerMovement'
import { PLAYER } from '../config/player'
import { FLOORS } from '../config/tower'

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
  const { gravity, maxFallSpeed } = PLAYER

  it('accelerates downward while airborne', () => {
    const v1 = applyGravity(0, 1 / 60, gravity, maxFallSpeed, false)
    const v2 = applyGravity(v1, 1 / 60, gravity, maxFallSpeed, false)
    expect(v1).toBeLessThan(0)
    expect(v2).toBeLessThan(v1)
  })

  it('reaches a terminal speed rather than falling forever faster', () => {
    let v = 0
    for (let i = 0; i < 2000; i++) v = applyGravity(v, 1 / 60, gravity, maxFallSpeed, false)
    expect(v).toBeCloseTo(-maxFallSpeed, 6)
  })

  it('does not accumulate speed while standing', () => {
    let v = 0
    for (let i = 0; i < 100; i++) v = applyGravity(v, 1 / 60, gravity, maxFallSpeed, true)
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
