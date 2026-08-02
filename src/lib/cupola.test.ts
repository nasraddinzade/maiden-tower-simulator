import { describe, expect, it } from 'vitest'
import { cupolaProfile, domeHeightAt, domeSphereRadius, oculiAreClear } from './cupola'
import { FLOORS, TOWER } from '../config/tower'

describe('domeSphereRadius', () => {
  it('matches the spherical-cap formula on a hemisphere', () => {
    // rise equal to the span ⇒ a hemisphere ⇒ sphere radius equals the span
    expect(domeSphereRadius(3, 3)).toBeCloseTo(3, 10)
  })
  it('grows without bound as the dome flattens', () => {
    const flat = domeSphereRadius(4, 0.05)
    const less = domeSphereRadius(4, 0.5)
    expect(flat).toBeGreaterThan(less)
    expect(flat).toBeGreaterThan(100)
  })
  it('rejects a non-positive rise', () => {
    expect(() => domeSphereRadius(4, 0)).toThrow()
    expect(() => domeSphereRadius(4, -1)).toThrow()
  })
})

describe('domeHeightAt', () => {
  const span = 4
  const rise = 0.9

  it('is the full rise on the axis', () => {
    expect(domeHeightAt(0, span, rise)).toBeCloseTo(rise, 10)
  })
  it('is zero at the springing', () => {
    expect(domeHeightAt(span, span, rise)).toBeCloseTo(0, 10)
  })
  it('falls monotonically from the axis to the springing', () => {
    let prev = Infinity
    for (let r = 0; r <= span; r += 0.1) {
      const h = domeHeightAt(r, span, rise)
      expect(h).toBeLessThanOrEqual(prev + 1e-12)
      prev = h
    }
  })
  it('stays below the rise everywhere (it is a cap, not a cone)', () => {
    for (let r = 0; r <= span; r += 0.25) {
      expect(domeHeightAt(r, span, rise)).toBeLessThanOrEqual(rise + 1e-12)
    }
  })
})

describe('cupolaProfile', () => {
  const span = 4
  const oculus = 1.2
  const rise = 0.9
  const profile = cupolaProfile(span, oculus, rise, 16)

  it('runs from the oculus rim to the springing', () => {
    expect(profile[0].r).toBeCloseTo(oculus, 10)
    // the last point is the bearing skirt; the dome surface ends one before it
    expect(profile[profile.length - 2].r).toBeCloseTo(span, 10)
  })
  it('lands exactly on the springing plane at the wall', () => {
    expect(profile[profile.length - 2].y).toBeCloseTo(0, 10)
  })
  it('carries a skirt past the wall face, so the join cannot show', () => {
    const skirt = profile[profile.length - 1]
    expect(skirt.r).toBeGreaterThan(span)
    expect(skirt.y).toBeLessThan(0)
  })
  it('omits the skirt when asked for a bare dome', () => {
    const bare = cupolaProfile(span, oculus, rise, 24, 0)
    expect(bare[bare.length - 1].r).toBeCloseTo(span, 10)
    expect(bare[bare.length - 1].y).toBeCloseTo(0, 10)
  })
  it('never rises above the crown', () => {
    for (const p of profile) expect(p.y).toBeLessThanOrEqual(rise + 1e-12)
  })
  it('descends monotonically outward', () => {
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i].y).toBeLessThanOrEqual(profile[i - 1].y + 1e-12)
      expect(profile[i].r).toBeGreaterThan(profile[i - 1].r)
    }
  })
  it('refuses an oculus wider than the span', () => {
    expect(() => cupolaProfile(2, 2, 0.5)).toThrow()
    expect(() => cupolaProfile(2, 3, 0.5)).toThrow()
  })
})

describe('cupolas against the tower config', () => {
  it('springs below the crown by exactly the configured rise', () => {
    for (const f of FLOORS) {
      expect(f.ceilingY - f.cupolaSpringY).toBeCloseTo(TOWER.cupolaRise, 10)
    }
  })

  it('keeps every cupola shallow — rise well under its half-span', () => {
    for (const f of FLOORS) {
      expect(TOWER.cupolaRise).toBeLessThan(f.cupolaSpanRadius / 2)
    }
  })

  it('leaves the oculus comfortably inside every span', () => {
    for (const f of FLOORS) {
      expect(f.oculusRadius).toBeLessThan(f.cupolaSpanRadius)
    }
  })

  it('springs from a wider circle higher up (the wall thins with height)', () => {
    for (let i = 1; i < FLOORS.length; i++) {
      expect(FLOORS[i].cupolaSpanRadius).toBeGreaterThan(FLOORS[i - 1].cupolaSpanRadius)
    }
  })

  it('keeps the cupola inside its own storey', () => {
    for (const f of FLOORS) {
      expect(f.cupolaSpringY).toBeGreaterThan(f.floorY)
      expect(f.ceilingY).toBeLessThanOrEqual(f.floorY + f.clearHeight + 1e-12)
    }
  })

  it('pierces every floor above the ground storey, and only those', () => {
    expect(FLOORS[0].hasFloorOpening).toBe(false)
    for (let i = 1; i < FLOORS.length; i++) expect(FLOORS[i].hasFloorOpening).toBe(true)
  })

  it('leaves the sky visible up the axis from storey 1 (Phase-3 acceptance)', () => {
    expect(oculiAreClear(FLOORS)).toBe(true)
    /*
     * A sight line fits, and so does a good part of the opening's width. The
     * 1.0 m this used to ask for was calibrated to the old 1.2 m placeholder;
     * the oculus is now photo-measured at 0.75 ± 0.15, so 1.0 m of clear column
     * is wider than the hole itself and asking for it tests nothing real.
     */
    expect(oculiAreClear(FLOORS, 0.5)).toBe(true)
    expect(oculiAreClear(FLOORS, TOWER.oculusRadius + 0.05)).toBe(false)
  })
})
