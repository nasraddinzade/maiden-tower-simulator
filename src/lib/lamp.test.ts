import { describe, expect, it } from 'vitest'
import { TONE_SHOULDER, deriveLampFalloff, lampRadianceAt } from './lamp'
import { LAMP, PLAYER } from '../config/player'
import { LIMESTONE_INTERIOR, linearLuminance } from './masonry'
import { FLOORS, STAIR } from '../config/tower'

const ALBEDO = linearLuminance(LIMESTONE_INTERIOR)

describe('deriveLampFalloff', () => {
  const targets = {
    nearDistance: 0.45,
    farDistance: 4.4,
    nearTarget: 0.35,
    farTarget: 0.03,
    albedoLuminance: ALBEDO,
  }

  it('hits both stated conditions exactly', () => {
    const f = deriveLampFalloff(targets)
    expect(lampRadianceAt(targets.nearDistance, f, ALBEDO)).toBeCloseTo(targets.nearTarget, 6)
    expect(lampRadianceAt(targets.farDistance, f, ALBEDO)).toBeCloseTo(targets.farTarget, 6)
  })

  it('comes out gentler than inverse-square, which is the whole point', () => {
    const f = deriveLampFalloff(targets)
    expect(f.decay).toBeLessThan(2)
    expect(f.decay).toBeGreaterThan(0.5) // still a falloff, not a flat flood
  })

  it('falls off monotonically', () => {
    const f = deriveLampFalloff(targets)
    let prev = Infinity
    for (let d = 0.2; d < 12; d += 0.1) {
      const v = lampRadianceAt(d, f, ALBEDO)
      expect(v).toBeLessThan(prev)
      prev = v
    }
  })

  it('refuses a specification it cannot solve', () => {
    expect(() => deriveLampFalloff({ ...targets, farDistance: 0.1 })).toThrow()
    expect(() => deriveLampFalloff({ ...targets, farTarget: 1 })).toThrow()
    expect(() => deriveLampFalloff({ ...targets, albedoLuminance: 0 })).toThrow()
  })
})

describe('the lamp as configured', () => {
  it('lights the passage wall without reaching the tone curve shoulder', () => {
    // half the flight's width: the closest a walker in the passage can be
    const wall = lampRadianceAt(STAIR.width / 2, LAMP, ALBEDO)
    expect(wall).toBeGreaterThan(0.15)
    expect(wall).toBeLessThan(TONE_SHOULDER)
  })

  it('cannot blow out even pressed against the stone', () => {
    // the controller keeps a small gap, so this is nearer than reachable
    const touching = lampRadianceAt(PLAYER.characterOffset + 0.1, LAMP, ALBEDO)
    expect(touching).toBeLessThan(TONE_SHOULDER * 2.2)
  })

  it('still reaches the far wall of the widest chamber', () => {
    const widest = Math.max(...FLOORS.map((f) => f.innerRadiusAtLevel))
    expect(lampRadianceAt(widest, LAMP, ALBEDO)).toBeGreaterThan(0.02)
  })

  it('spans the two distances inside one usable stretch of the curve', () => {
    const widest = Math.max(...FLOORS.map((f) => f.innerRadiusAtLevel))
    const ratio =
      lampRadianceAt(STAIR.width / 2, LAMP, ALBEDO) / lampRadianceAt(widest, LAMP, ALBEDO)
    // ACES at exposure 1 holds roughly 50:1 between visible and clipped
    expect(ratio).toBeLessThan(50)
  })
})
