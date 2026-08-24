import { describe, expect, it } from 'vitest'
import {
  cameraGroundReach,
  cameraHeight,
  clampOrbit,
  frameHeightFraction,
  hullSphereRadius,
  orbitStateOf,
  polarAfterDrag,
  polarFloorLimit,
  type OrbitLimits,
} from './orbitFraming'
import { ORBIT, OPENING_STATE } from '../config/orbit'
import { TOWER } from '../config/tower'
import { GROUND_Y as SITE_GROUND_Y, SITE } from '../config/site'
import { PLAYER } from '../config/player'
import { UI } from '../config/ui'

const LIMITS: OrbitLimits = {
  minDistance: ORBIT.minDistance,
  maxDistance: ORBIT.maxDistance,
  minPolar: ORBIT.minPolar,
  maxPolar: ORBIT.maxPolar,
}

const TARGET_Y = ORBIT.target[1]
/** The screen the audit was driven on. */
const PHONE_H = 812
const DEG = 180 / Math.PI

describe('the fault, as it was measured', () => {
  /**
   * The four drags from the phone audit, against the UNCLAMPED arithmetic. They
   * are here as the record of what the shipped controls did, and as the check
   * that this module models three's own mapping rather than a story about it.
   *
   * The residuals are all the same sign and all about a quarter of a metre: the
   * reading was taken one frame behind, and `enableDamping` is a 5% lag. So the
   * tolerance is 0.55 m, which is the 0.50 the shortest drag lags by, not a band
   * wide enough to hide a wrong model.
   */
  const MEASURED: Array<[px: number, y: number]> = [
    [40, 8.5],
    [60, 0.36],
    [80, -7.21],
    [200, -36.68],
  ]

  it.each(MEASURED)('%i px of upward thumb put the camera at y %f', (px, y) => {
    const polar = polarAfterDrag(OPENING_STATE.polar, px, PHONE_H)
    const got = cameraHeight(TARGET_Y, { distance: OPENING_STATE.distance, polar })
    expect(got).toBeCloseTo(y, 0)
    expect(Math.abs(got - y)).toBeLessThan(0.55)
  })

  it('a full screen height of drag is one full turn, which is the whole sensitivity', () => {
    expect(polarAfterDrag(0, PHONE_H, PHONE_H)).toBeCloseTo(2 * Math.PI, 10)
    // and the same finger on a taller window turns the camera less
    expect(polarAfterDrag(0, 60, 1600)).toBeLessThan(polarAfterDrag(0, 60, PHONE_H))
  })

  it('the unclamped camera went under the pavement inside 66 px of thumb', () => {
    const under = (px: number) =>
      cameraHeight(TARGET_Y, {
        distance: OPENING_STATE.distance,
        polar: polarAfterDrag(OPENING_STATE.polar, px, PHONE_H),
      }) < SITE_GROUND_Y

    expect(under(65)).toBe(false)
    expect(under(66)).toBe(true)
    // and it crossed the target's own datum — y = 0, the floor of storey 1 —
    // at 61 px, which is the figure the audit reported
    const atDatum = (px: number) =>
      cameraHeight(TARGET_Y, {
        distance: OPENING_STATE.distance,
        polar: polarAfterDrag(OPENING_STATE.polar, px, PHONE_H),
      }) < 0
    expect(atDatum(60)).toBe(false)
    expect(atDatum(61)).toBe(true)

    // 66 px is one and a half times the smallest target this project will ask a
    // finger to hit. A gesture that destroys the view must cost more than that.
    expect(66).toBeLessThan(UI.minTouchTarget * 2)
  })

  it('the pinch had no far end: 56.3 m to 349.2 m in one gesture', () => {
    // |position| from the origin, which is what the audit read
    const opened = Math.hypot(36, 24, 36)
    expect(opened).toBeCloseTo(56.3, 1)
    // at 349.2 m the tower fills a twelfth of the frame's height
    expect(frameHeightFraction(TOWER.height, 349.2, 50)).toBeCloseTo(0.0906, 4)
  })
})

describe('the clamp holds the camera above ground', () => {
  it('no drag of any length gets the camera below the floor', () => {
    let lowest = Infinity
    for (let px = -2000; px <= 2000; px += 1) {
      const polar = polarAfterDrag(OPENING_STATE.polar, px, PHONE_H)
      const s = clampOrbit({ distance: OPENING_STATE.distance, polar }, LIMITS)
      lowest = Math.min(lowest, cameraHeight(TARGET_Y, s))
    }
    expect(lowest).toBeGreaterThanOrEqual(ORBIT.cameraFloorY - 1e-9)
    // and at the opening distance it stops well clear of it
    expect(lowest).toBeGreaterThan(7)
  })

  it('nor at any distance the dolly can reach, which is the case the constant is set for', () => {
    const span = ORBIT.maxDistance - ORBIT.minDistance
    const steps = 400
    let lowest = Infinity
    for (let i = 0; i <= steps; i += 1) {
      const d = ORBIT.minDistance + (span * i) / steps
      for (let deg = -180; deg <= 360; deg += 0.5) {
        const s = clampOrbit({ distance: d, polar: deg / DEG }, LIMITS)
        lowest = Math.min(lowest, cameraHeight(TARGET_Y, s))
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(ORBIT.cameraFloorY - 1e-9)
    // the worst case is the far limit, and there it lands exactly on the floor
    expect(lowest).toBeCloseTo(ORBIT.cameraFloorY, 6)
  })

  it('the floor is the walker eye height above the paving, not the paving', () => {
    expect(ORBIT.cameraFloorY).toBeCloseTo(SITE_GROUND_Y + PLAYER.eyeHeight, 10)
    expect(ORBIT.cameraFloorY).toBeGreaterThan(SITE_GROUND_Y)
  })

  it('the limit binds exactly at the far end and has room to spare at the near one', () => {
    const atFar = cameraHeight(TARGET_Y, { distance: ORBIT.maxDistance, polar: ORBIT.maxPolar })
    expect(atFar).toBeCloseTo(ORBIT.cameraFloorY, 10)
    const atNear = cameraHeight(TARGET_Y, { distance: ORBIT.minDistance, polar: ORBIT.maxPolar })
    expect(atNear).toBeGreaterThan(ORBIT.cameraFloorY + 10)
  })

  it('polarFloorLimit is monotone: the further out, the sooner the camera must stop', () => {
    const near = polarFloorLimit(TARGET_Y, ORBIT.cameraFloorY, 40)
    const far = polarFloorLimit(TARGET_Y, ORBIT.cameraFloorY, 120)
    expect(far).toBeLessThan(near)
    // and it never asks for less than level, since the floor is below the target
    expect(far).toBeGreaterThan(Math.PI / 2)
  })
})

describe('the clamp keeps the camera outside the stone', () => {
  /**
   * Every corner of the built hull, as a distance from the target. The near
   * limit has to clear all of them, in every azimuth, because minDistance is
   * spherical and cannot tell azimuths apart.
   */
  const CORNERS = [
    { r: ORBIT.hullReach, y: SITE_GROUND_Y },
    { r: ORBIT.hullReach, y: TOWER.topY },
    { r: TOWER.outerRadius, y: SITE_GROUND_Y },
    { r: TOWER.outerRadius, y: TOWER.topY },
  ]

  it('the near limit clears every corner of the drum and the beak', () => {
    for (const c of CORNERS) {
      expect(ORBIT.minDistance).toBeGreaterThan(Math.hypot(c.r, c.y - TARGET_Y))
    }
  })

  it('and it is the BOTTOM of the beak that sets it, not the top', () => {
    const bottom = Math.hypot(ORBIT.hullReach, TARGET_Y - SITE_GROUND_Y)
    const top = Math.hypot(ORBIT.hullReach, TOWER.topY - TARGET_Y)
    expect(bottom).toBeGreaterThan(top)
    expect(ORBIT.minDistance).toBeCloseTo(bottom + ORBIT.hullClearance, 10)
  })

  it('the beak decides it, and the drum alone would have been 6 m short', () => {
    const drumOnly = hullSphereRadius(TOWER.outerRadius, SITE_GROUND_Y, TOWER.topY, TARGET_Y)
    expect(ORBIT.minDistance - drumOnly).toBeGreaterThan(6)
  })

  it('the near plane is inside the clearance, so nothing enters the frustum', () => {
    // the `<Canvas>` opens at near 0.1; the clearance has to be more than that
    expect(ORBIT.hullClearance).toBeGreaterThan(0.1)
  })
})

describe('the clamp keeps the building in the frame', () => {
  it('the camera never leaves the ground the tower stands on', () => {
    let furthest = 0
    for (let deg = 0; deg <= 180; deg += 0.5) {
      const s = clampOrbit({ distance: 1e6, polar: deg / DEG }, LIMITS)
      furthest = Math.max(furthest, cameraGroundReach(s))
    }
    expect(furthest).toBeLessThanOrEqual(SITE.radius + 1e-9)
  })

  it('at the far limit the tower still fills a quarter of the frame', () => {
    // 50° is the vertical field the `<Canvas>` ships; the rule itself is in
    // metres and does not depend on it (see config/orbit.ts → MAX_DISTANCE)
    expect(frameHeightFraction(TOWER.height, ORBIT.maxDistance, 50)).toBeGreaterThan(0.25)
  })

  it('the pole guard costs 1.5% of the plan and returns 5 m of elevation', () => {
    expect(Math.cos(ORBIT.minPolar)).toBeGreaterThan(0.98)
    expect(TOWER.height * Math.sin(ORBIT.minPolar)).toBeGreaterThan(5)
  })
})

describe('the reset lands somewhere the controls will leave it', () => {
  it('the opening framing is strictly inside every limit', () => {
    expect(OPENING_STATE.distance).toBeGreaterThan(ORBIT.minDistance)
    expect(OPENING_STATE.distance).toBeLessThan(ORBIT.maxDistance)
    expect(OPENING_STATE.polar).toBeGreaterThan(ORBIT.minPolar)
    expect(OPENING_STATE.polar).toBeLessThan(ORBIT.maxPolar)
  })

  it('so clamping it changes nothing — a reset does not bounce', () => {
    const clamped = clampOrbit(OPENING_STATE, LIMITS)
    expect(clamped.distance).toBeCloseTo(OPENING_STATE.distance, 12)
    expect(clamped.polar).toBeCloseTo(OPENING_STATE.polar, 12)
  })

  it('the opening framing is the one the Canvas ships', () => {
    expect(ORBIT.opening.position).toEqual([36, 24, 36])
    expect(ORBIT.opening.target).toBe(ORBIT.target)
    expect(ORBIT.target[1]).toBeCloseTo(TOWER.topY / 2, 12)
    expect(OPENING_STATE.distance).toBeCloseTo(51.933, 3)
    expect(OPENING_STATE.polar * DEG).toBeCloseTo(78.62, 2)
  })

  it('clamping is a fixed point: what comes out is already legal', () => {
    const wild = [
      { distance: 0, polar: 0 },
      { distance: 1e9, polar: Math.PI },
      { distance: -5, polar: -3 },
      { distance: 349.2, polar: 2.92 },
    ]
    for (const w of wild) {
      const once = clampOrbit(w, LIMITS)
      const twice = clampOrbit(once, LIMITS)
      expect(twice).toEqual(once)
      expect(cameraHeight(TARGET_Y, once)).toBeGreaterThanOrEqual(ORBIT.cameraFloorY - 1e-9)
    }
  })

  it('orbitStateOf inverts a position into the frame the limits are stated in', () => {
    const s = orbitStateOf([0, TARGET_Y + 30, 0], ORBIT.target)
    expect(s.distance).toBeCloseTo(30, 12)
    expect(s.polar).toBeCloseTo(0, 12)
    const level = orbitStateOf([30, TARGET_Y, 0], ORBIT.target)
    expect(level.polar).toBeCloseTo(Math.PI / 2, 12)
  })
})
