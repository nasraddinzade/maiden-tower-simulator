import { describe, expect, it } from 'vitest'
import { TOWER } from '../config/tower'
import { SHADOW, shadowMapSize } from '../config/lighting'
import {
  CASTER_SEED,
  angleBetween,
  casterSignature,
  foldCaster,
  redrawAngleRad,
  shadowExtentMetres,
  shadowNeedsRedraw,
  shadowTexelMetres,
} from './shadowRefresh'

/** A unit vector `theta` radians away from +Z, turned about +X. */
function tilted(theta: number) {
  return { x: 0, y: Math.sin(theta), z: Math.cos(theta) }
}

const DEG = Math.PI / 180

describe('shadow map extent and texel', () => {
  it('spans the same square the shadow camera has always been given', () => {
    // TowerShell's light has always been framed at outerRadius × 3.2; this only
    // moves the number out of the component, so the extent must not change.
    expect(shadowExtentMetres(TOWER.outerRadius, SHADOW.extentRadii)).toBeCloseTo(26.4, 10)
    expect(SHADOW.extentMetres).toBeCloseTo(26.4, 10)
  })

  it('puts 25.8 mm of ground under a desktop texel and 51.6 under a mobile one', () => {
    const desktop = shadowTexelMetres(SHADOW.extentMetres, SHADOW.mapSizeDesktop)
    const mobile = shadowTexelMetres(SHADOW.extentMetres, SHADOW.mapSizeMobile)
    expect(desktop).toBeCloseTo(0.0257813, 7)
    expect(mobile).toBeCloseTo(0.0515625, 7)
    // Halving the map doubles the texel and quarters the depth buffer. That is
    // the whole trade, stated: 16.8 MB of shadow depth becomes 4.2 MB.
    expect(mobile / desktop).toBeCloseTo(2, 12)
    expect(SHADOW.mapSizeDesktop ** 2 / SHADOW.mapSizeMobile ** 2).toBe(4)
  })

  it('picks the map by profile, and the mobile profile gets the smaller one', () => {
    expect(shadowMapSize(false)).toBe(2048)
    expect(shadowMapSize(true)).toBe(1024)
  })
})

describe('angleBetween', () => {
  it('is zero for the same direction and a right angle for perpendicular ones', () => {
    expect(angleBetween({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 })).toBe(0)
    expect(angleBetween({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(Math.PI / 2, 12)
    expect(angleBetween({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 })).toBeCloseTo(Math.PI, 12)
  })

  it('keeps its digits at the angles this gate actually decides on', () => {
    /*
     * THE THRESHOLD IS 1.1e-4 rad, so the arithmetic has to survive there.
     * `acos(a·b)` cannot: near a dot product of 1 the cosine is flat, half the
     * mantissa is gone before the acos is taken, and at 1e-5 rad it returns a
     * figure wrong in the third digit. atan2(|a×b|, a·b) is exact at both ends.
     * This test is the reason the implementation is not one line of acos.
     */
    for (const theta of [1e-6, 1e-5, 1e-4, 1e-3]) {
      expect(angleBetween(tilted(0), tilted(theta))).toBeCloseTo(theta, 15)
    }
  })

  it('does not need unit vectors', () => {
    expect(angleBetween({ x: 0, y: 0, z: 90 }, { x: 0, y: 90, z: 0 })).toBeCloseTo(Math.PI / 2, 12)
  })
})

describe('redrawAngleRad', () => {
  it('is one texel across the deepest the shadow camera can see', () => {
    const desktop = redrawAngleRad(
      shadowTexelMetres(SHADOW.extentMetres, SHADOW.mapSizeDesktop),
      SHADOW.cameraFar,
    )
    const mobile = redrawAngleRad(
      shadowTexelMetres(SHADOW.extentMetres, SHADOW.mapSizeMobile),
      SHADOW.cameraFar,
    )
    expect(desktop).toBeCloseTo(1.14583e-4, 9)
    expect(mobile).toBeCloseTo(2.29167e-4, 9)
    // In degrees: 0.00657° and 0.01313°. The sun covers 15° an hour, so the
    // gate opens 1.6 s and 3.1 s into a real move — it suppresses the 59 frames
    // in 60 where the sun did not move at all, never the 20 s tick.
    expect(desktop / DEG).toBeCloseTo(0.0065651, 7)
    expect(mobile / DEG).toBeCloseTo(0.0131303, 7)
  })
})

describe('shadowNeedsRedraw', () => {
  const desktopAngle = redrawAngleRad(
    shadowTexelMetres(SHADOW.extentMetres, SHADOW.mapSizeDesktop),
    SHADOW.cameraFar,
  )
  const mobileAngle = redrawAngleRad(
    shadowTexelMetres(SHADOW.extentMetres, SHADOW.mapSizeMobile),
    SHADOW.cameraFar,
  )
  const state = (theta: number, casters = 1) => ({ direction: tilted(theta), casters })

  it('redraws when nothing has been drawn yet', () => {
    expect(shadowNeedsRedraw(null, state(0), desktopAngle)).toBe(true)
  })

  it('DOES NOT redraw when neither the sun nor the model has moved', () => {
    // This single line is the 33 draw calls and 55 983 triangles a frame.
    expect(shadowNeedsRedraw(state(0), state(0), desktopAngle)).toBe(false)
  })

  it('ignores a sun move smaller than a texel', () => {
    expect(shadowNeedsRedraw(state(0), state(0.001 * DEG), desktopAngle)).toBe(false)
    expect(shadowNeedsRedraw(state(0), state(0.001 * DEG), mobileAngle)).toBe(false)
  })

  it('lets the coarser mobile map sit through a move the desktop map redraws for', () => {
    expect(shadowNeedsRedraw(state(0), state(0.01 * DEG), desktopAngle)).toBe(true)
    expect(shadowNeedsRedraw(state(0), state(0.01 * DEG), mobileAngle)).toBe(false)
  })

  it('redraws on any move either map can show', () => {
    expect(shadowNeedsRedraw(state(0), state(0.1 * DEG), desktopAngle)).toBe(true)
    expect(shadowNeedsRedraw(state(0), state(0.1 * DEG), mobileAngle)).toBe(true)
    // A 20 s tick of the live clock moves the sun 0.083°, which is well over both.
    expect(shadowNeedsRedraw(state(0), state((15 / 3600) * 20 * DEG), mobileAngle)).toBe(true)
  })

  it('redraws when the casters change under a still sun', () => {
    // Walking in, a storey culled, the cutaway, the shell switched off: the sun
    // is where it was and the map is wrong anyway.
    expect(shadowNeedsRedraw(state(0, 1), state(0, 2), desktopAngle)).toBe(true)
  })
})

describe('casterSignature', () => {
  it('is the same for the same casters in the same order', () => {
    const a = [
      { id: 12, geometryId: 3 },
      { id: 40, geometryId: 9 },
    ]
    expect(casterSignature(a)).toBe(casterSignature(a.slice()))
  })

  it('changes when a caster appears, leaves, or swaps its geometry', () => {
    const base = [
      { id: 12, geometryId: 3 },
      { id: 40, geometryId: 9 },
    ]
    const added = [...base, { id: 41, geometryId: 11 }]
    const gone = base.slice(0, 1)
    const rebuilt = [
      { id: 12, geometryId: 3 },
      { id: 40, geometryId: 10 },
    ]
    const sig = casterSignature(base)
    expect(casterSignature(added)).not.toBe(sig)
    expect(casterSignature(gone)).not.toBe(sig)
    expect(casterSignature(rebuilt)).not.toBe(sig)
  })

  it('notices a reordering, because the shadow pass draws in scene order', () => {
    const a = [
      { id: 12, geometryId: 3 },
      { id: 40, geometryId: 9 },
    ]
    const b = [
      { id: 40, geometryId: 9 },
      { id: 12, geometryId: 3 },
    ]
    expect(casterSignature(b)).not.toBe(casterSignature(a))
  })

  it('folds one caster at a time to the same figure the whole list gives', () => {
    // The component folds during traverseVisible and never builds the array;
    // the two paths must not be allowed to drift.
    const list = [
      { id: 7, geometryId: 2 },
      { id: 8, geometryId: 2 },
      { id: 9, geometryId: 5 },
    ]
    let h = CASTER_SEED
    for (const c of list) h = foldCaster(h, c.id, c.geometryId)
    expect(h).toBe(casterSignature(list))
  })

  it('stays a 32-bit unsigned integer, so === is a safe comparison', () => {
    let h = CASTER_SEED
    for (let i = 0; i < 500; i++) h = foldCaster(h, i * 7919, i * 104729)
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})
