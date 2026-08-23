import { describe, expect, it } from 'vitest'
import {
  inThumbZone,
  stickSpeed,
  stickThrow,
  stickVector,
  stickVelocity,
  touchLookSensitivity,
} from './touchInput'
import { moveVelocity } from './playerMovement'
import { PLAYER, TOUCH } from '../config/player'

/*
 * CLAUDE.md rule 6: this file is arithmetic. It asserts what a thumb delta
 * becomes — a yaw, a pitch, a velocity — and asserts nothing about a ring drawn
 * on the glass, which is the renderer's business and untestable here.
 *
 * EVERY CLAIM BELOW WAS RUN AGAINST THE OLD CODE FIRST and failed, with the old
 * implementation (joystickToInput + a 1.6× mouse sensitivity) reproduced
 * verbatim:
 *
 *   half deflection walks at half pace          want 0.8235   got 1.4000
 *   a stick 30° east of north walks 30° east    want 30.0°    got 45.0°
 *   one sweep of a 375 px screen is half a turn want 3.1416   got 1.5000
 *   0.9 deflection is part-way up the ramp      want 1.6588   got 2.6000
 *
 * The first two are the boolean stick: a deflection had no magnitude and no
 * direction beyond the eight the keyboard has. The third is the sensitivity that
 * made half a turn 2.1 screen widths. The fourth is `run` having been a flag
 * rather than the top of a ramp.
 */

const W = PLAYER.walkSpeed
const R = PLAYER.runSpeed
const OPTS = {
  walkSpeed: W,
  runSpeed: R,
  deadzone: TOUCH.deadzone,
  runAt: TOUCH.runAt,
}

/** Speed of a ground velocity, m/s. */
const speedOf = (v: { x: number; z: number }) => Math.hypot(v.x, v.z)
/** Compass heading of a ground velocity, degrees clockwise from north (−Z). */
const headingOf = (v: { x: number; z: number }) => (Math.atan2(v.x, -v.z) * 180) / Math.PI

describe('stickVector', () => {
  it('is zero at the origin', () => {
    expect(stickVector(0, 0, TOUCH.stickRadiusPx)).toEqual({ x: 0, y: 0 })
  })

  it('reaches full deflection exactly at the ring', () => {
    const v = stickVector(0, -TOUCH.stickRadiusPx, TOUCH.stickRadiusPx)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10)
    expect(v.y).toBeCloseTo(-1, 10)
  })

  it('clamps the LENGTH, so a diagonal does not outrun a cardinal', () => {
    const r = TOUCH.stickRadiusPx
    const diagonal = stickVector(4 * r, -4 * r, r)
    const cardinal = stickVector(4 * r, 0, r)
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 10)
    expect(Math.hypot(cardinal.x, cardinal.y)).toBeCloseTo(1, 10)
  })

  it('keeps the direction the thumb dragged in', () => {
    const v = stickVector(30, -40, TOUCH.stickRadiusPx)
    // 50 px of drag inside a 56 px ring: not yet clamped, so it is the raw ratio
    expect(v.x).toBeCloseTo(30 / TOUCH.stickRadiusPx, 10)
    expect(v.y).toBeCloseTo(-40 / TOUCH.stickRadiusPx, 10)
  })

  it('answers zero for a ring with no radius rather than dividing by it', () => {
    expect(stickVector(10, 10, 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('stickThrow', () => {
  it('is zero inside the deadzone', () => {
    expect(stickThrow(0.1, 0.05, TOUCH.deadzone)).toBe(0)
  })

  it('starts from zero at the deadzone edge, not from the deadzone value', () => {
    // the rescale: crossing the threshold must not jump the walker to 15% pace
    const justPast = stickThrow(0, -(TOUCH.deadzone + 1e-6), TOUCH.deadzone)
    expect(justPast).toBeGreaterThan(0)
    expect(justPast).toBeLessThan(1e-5)
  })

  it('is one at full deflection', () => {
    expect(stickThrow(0, -1, TOUCH.deadzone)).toBeCloseTo(1, 10)
  })

  it('rises linearly across the live band', () => {
    const mid = TOUCH.deadzone + (1 - TOUCH.deadzone) / 2
    expect(stickThrow(mid, 0, TOUCH.deadzone)).toBeCloseTo(0.5, 10)
  })
})

describe('stickSpeed', () => {
  it('stands still at no throw', () => {
    expect(stickSpeed(0, W, R, TOUCH.runAt)).toBe(0)
  })

  it('reaches ordinary walking pace at the run threshold, not at the rim', () => {
    expect(stickSpeed(TOUCH.runAt, W, R, TOUCH.runAt)).toBeCloseTo(W, 10)
  })

  it('reaches the jog at the rim', () => {
    expect(stickSpeed(1, W, R, TOUCH.runAt)).toBeCloseTo(R, 10)
  })

  it('is proportional below the threshold — half throw, half pace', () => {
    expect(stickSpeed(TOUCH.runAt / 2, W, R, TOUCH.runAt)).toBeCloseTo(W / 2, 10)
  })

  it('is monotone and continuous across the threshold', () => {
    let previous = -1
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const s = stickSpeed(t, W, R, TOUCH.runAt)
      expect(s).toBeGreaterThanOrEqual(previous)
      previous = s
    }
    const below = stickSpeed(TOUCH.runAt - 1e-6, W, R, TOUCH.runAt)
    const above = stickSpeed(TOUCH.runAt + 1e-6, W, R, TOUCH.runAt)
    expect(above - below).toBeLessThan(1e-4)
  })

  it('clamps a throw pushed past the rim to the jog rather than beyond it', () => {
    expect(stickSpeed(3, W, R, TOUCH.runAt)).toBeCloseTo(R, 10)
    expect(stickSpeed(-3, W, R, TOUCH.runAt)).toBe(0)
  })

  it('degrades to a walk-only stick when the threshold is at the rim', () => {
    expect(stickSpeed(1, W, R, 1)).toBeCloseTo(W, 10)
  })
})

describe('stickVelocity', () => {
  it('stands still with the thumb resting at the centre', () => {
    expect(stickVelocity({ x: 0, y: 0 }, 0, OPTS)).toEqual({ x: 0, z: 0 })
  })

  it('walks north at yaw 0 when the thumb pushes up the screen', () => {
    // screen +y is DOWN, so forward is negative y — the axis that catches people
    const v = stickVelocity({ x: 0, y: -1 }, 0, OPTS)
    expect(v.x).toBeCloseTo(0, 10)
    expect(v.z).toBeCloseTo(-R, 10)
  })

  it('walks east when facing east, exactly as the keys do', () => {
    const yaw = -Math.PI / 2
    const stick = stickVelocity({ x: 0, y: -TOUCH.runAt * (1 - TOUCH.deadzone) - TOUCH.deadzone }, yaw, OPTS)
    const keys = moveVelocity(
      { forward: true, back: false, left: false, right: false, run: false },
      yaw,
      W,
      R,
    )
    expect(stick.x).toBeCloseTo(keys.x, 6)
    expect(stick.z).toBeCloseTo(keys.z, 6)
  })

  it('holds any heading, not the eight the keyboard has', () => {
    // THE OLD STICK ANSWERED 45° HERE. Booleans have eight directions.
    for (const deg of [7, 30, 61, 118, 200, 344]) {
      const a = (deg * Math.PI) / 180
      const v = stickVelocity({ x: Math.sin(a), y: -Math.cos(a) }, 0, OPTS)
      const heading = ((headingOf(v) % 360) + 360) % 360
      expect(heading).toBeCloseTo(deg, 6)
    }
  })

  it('turns with the walker: the same thumb push at yaw 90° walks west', () => {
    const v = stickVelocity({ x: 0, y: -1 }, Math.PI / 2, OPTS)
    expect(v.x).toBeCloseTo(-R, 10)
    expect(v.z).toBeCloseTo(0, 10)
  })

  it('gives a throttle: half throw is half pace', () => {
    const half = TOUCH.deadzone + (TOUCH.runAt / 2) * (1 - TOUCH.deadzone)
    expect(speedOf(stickVelocity({ x: 0, y: -half }, 0, OPTS))).toBeCloseTo(W / 2, 6)
  })

  it('is speed-independent of heading — no fast diagonals', () => {
    const speeds = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const a = (deg * Math.PI) / 180
      return speedOf(stickVelocity({ x: Math.sin(a), y: -Math.cos(a) }, 0.7, OPTS))
    })
    for (const s of speeds) expect(s).toBeCloseTo(speeds[0], 10)
  })

  it('ignores a thumb resting inside the deadzone', () => {
    expect(stickVelocity({ x: 0.1, y: -0.05 }, 0, OPTS)).toEqual({ x: 0, z: 0 })
  })
})

describe('touchLookSensitivity', () => {
  /** The reference phone: 375 CSS px is the short side of a portrait handset. */
  const PHONE = 375

  it('turns half a turn for one sweep across the short side', () => {
    // THE OLD PATH GAVE 1.5 rad HERE — 2.1 screen widths for half a turn.
    const perPixel = touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad)
    expect(perPixel * PHONE).toBeCloseTo(Math.PI, 10)
  })

  it('is faster per pixel than the mouse, because a thumb has less room', () => {
    expect(touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad)).toBeGreaterThan(
      PLAYER.lookSensitivity,
    )
  })

  it('puts the whole pitch range inside one sweep', () => {
    // floor to zenith without lifting the thumb: 2 × maxPitchRad of travel
    const perPixel = touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad)
    expect((2 * PLAYER.maxPitchRad) / perPixel).toBeLessThan(PHONE)
  })

  it('feels the same when the phone is turned sideways', () => {
    // a visitor turns the phone to look at a building; the SHORT side is the
    // reference either way round, so the gesture does not change under them
    const portrait = touchLookSensitivity(Math.min(375, 812), TOUCH.turnPerSweepRad)
    const landscape = touchLookSensitivity(Math.min(812, 375), TOUCH.turnPerSweepRad)
    expect(landscape).toBe(portrait)
  })

  it('turns more slowly per pixel on a bigger screen', () => {
    const tablet = touchLookSensitivity(768, TOUCH.turnPerSweepRad)
    expect(tablet).toBeLessThan(touchLookSensitivity(PHONE, TOUCH.turnPerSweepRad))
  })

  it('answers zero for a viewport that has not been measured yet', () => {
    // a frame can arrive with size 0 while layout settles; dividing by it would
    // spin the camera on the visitor's first frame
    expect(touchLookSensitivity(0, TOUCH.turnPerSweepRad)).toBe(0)
    expect(touchLookSensitivity(Number.NaN, TOUCH.turnPerSweepRad)).toBe(0)
    expect(touchLookSensitivity(-375, TOUCH.turnPerSweepRad)).toBe(0)
  })
})

describe('inThumbZone', () => {
  const W_PX = 375
  const H_PX = 812
  const zone = { widthFraction: TOUCH.zoneWidthFraction, heightFraction: TOUCH.zoneHeightFraction }
  const inZone = (x: number, y: number) => inThumbZone(x, y, W_PX, H_PX, zone)

  it('takes a thumb resting at the bottom left', () => {
    expect(inZone(60, 740)).toBe(true)
  })

  it('leaves the right side for looking', () => {
    expect(inZone(300, 740)).toBe(false)
  })

  it('leaves the UPPER left for looking too', () => {
    // where the walk button and the hint sit; half the screen must not become
    // a joystick just because the visitor is left-handed
    expect(inZone(60, 120)).toBe(false)
  })

  it('lands the boundary on the zone, not beside it', () => {
    expect(inZone(W_PX * TOUCH.zoneWidthFraction, H_PX)).toBe(true)
    expect(inZone(W_PX * TOUCH.zoneWidthFraction + 1, H_PX)).toBe(false)
    expect(inZone(0, H_PX * (1 - TOUCH.zoneHeightFraction))).toBe(true)
    expect(inZone(0, H_PX * (1 - TOUCH.zoneHeightFraction) - 1)).toBe(false)
  })

  it('is a zone in every orientation the visitor may hold the phone', () => {
    for (const [w, h] of [
      [375, 812], // portrait phone
      [812, 375], // landscape phone — the way a tower gets looked at
      [768, 1024], // tablet
    ] as const) {
      expect(inThumbZone(w * 0.1, h * 0.9, w, h, zone)).toBe(true)
      expect(inThumbZone(w * 0.9, h * 0.9, w, h, zone)).toBe(false)
      expect(inThumbZone(w * 0.1, h * 0.1, w, h, zone)).toBe(false)
    }
  })

  it('leaves room for two thumbs at once', () => {
    // the whole point of the split: a move point and a look point that are both
    // valid at the same instant, neither of them cancelling the other
    const move = { x: 60, y: 740 }
    const look = { x: 300, y: 500 }
    expect(inZone(move.x, move.y)).toBe(true)
    expect(inZone(look.x, look.y)).toBe(false)
  })
})
