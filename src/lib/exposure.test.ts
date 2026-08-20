import { describe, expect, it } from 'vitest'
import {
  TONE_SHOULDER,
  channelResponse,
  daylightFraction,
  deriveKeyIntensity,
  peakChannelResponse,
} from './exposure'
import { LIMESTONE_INTERIOR, LIMESTONE_LIGHT, linearLuminance } from './masonry'
import { SUN } from '../config/lighting'
import { LAMP } from '../config/player'
import { lampRadianceAt } from './lamp'
import { STAIR } from '../config/tower'

/*
 * Rule 6: this file tests arithmetic only. It says nothing about how anything
 * looks; it says that the numbers the renderer is handed mean what the comments
 * beside them claim they mean.
 */

const LAMP_COLOUR = '#ffd9a8'

describe('peakChannelResponse', () => {
  it('is the largest channel, not the luminance — which is the whole point', () => {
    const peak = peakChannelResponse(LAMP_COLOUR, LIMESTONE_INTERIOR)
    const lum = linearLuminance(LIMESTONE_INTERIOR)
    const channels = channelResponse(LAMP_COLOUR, LIMESTONE_INTERIOR)
    expect(peak).toBe(Math.max(...channels))
    // a warm lamp on warm stone: red runs well above the luminance that used to
    // stand in for it, and the ratio is what the picture was out by
    expect(peak / lum).toBeGreaterThan(1.2)
  })

  it('agrees with luminance for a neutral light on a neutral surface', () => {
    // grey lit by white: every channel carries the same value, so peak IS it
    const peak = peakChannelResponse('#ffffff', '#808080')
    expect(peak).toBeCloseTo(linearLuminance('#808080'), 12)
  })
})

describe('deriveKeyIntensity', () => {
  it('puts the reference stone exactly on the target in its brightest channel', () => {
    const intensity = deriveKeyIntensity(SUN.dayColour, LIMESTONE_LIGHT)
    const peak = peakChannelResponse(SUN.dayColour, LIMESTONE_LIGHT)
    // three's Lambert: radiance = albedo/π · irradiance, head-on
    expect((peak / Math.PI) * intensity).toBeCloseTo(TONE_SHOULDER, 12)
  })

  it('refuses a surface that reflects nothing and a target of nothing', () => {
    expect(() => deriveKeyIntensity('#000000', LIMESTONE_LIGHT)).toThrow()
    expect(() => deriveKeyIntensity(SUN.dayColour, LIMESTONE_LIGHT, 0)).toThrow()
  })
})

describe('the sun as configured', () => {
  /*
   * THE PROPERTY THAT WAS BROKEN. With intensity 1 the sunlit drum reflected
   * 0.402/π = 0.128 — an eighth of the usable range — while the sky the same
   * frame draws sits near 1.6. Measured on screen: stone byte 60, sky byte 238.
   */
  it('lets the building reach the top of the tone curve at all', () => {
    const peak = peakChannelResponse(SUN.dayColour, LIMESTONE_LIGHT)
    const sunlit = (peak / Math.PI) * SUN.fullIntensity
    expect(sunlit).toBeCloseTo(TONE_SHOULDER, 6)
  })

  it('does not push the same stone past the shoulder at any sun height', () => {
    const peak = peakChannelResponse(SUN.dayColour, LIMESTONE_LIGHT)
    for (let alt = 0; alt <= 90; alt += 1) {
      const sunlit = (peak / Math.PI) * SUN.fullIntensity * daylightFraction(alt)
      expect(sunlit).toBeLessThanOrEqual(TONE_SHOULDER + 1e-12)
    }
  })

  it('reddens without brightening: both colours clip in the same channel', () => {
    expect(peakChannelResponse(SUN.lowColour, LIMESTONE_LIGHT)).toBeCloseTo(
      peakChannelResponse(SUN.dayColour, LIMESTONE_LIGHT),
      12,
    )
  })
})

describe('daylightFraction', () => {
  it('is nothing below the horizon and does not snap on at it', () => {
    expect(daylightFraction(-0.1)).toBe(0)
    expect(daylightFraction(0)).toBe(0)
    expect(daylightFraction(0.001)).toBeGreaterThan(0.14)
  })

  it('rises with the sun and then holds, never exceeding full', () => {
    let prev = 0
    for (let alt = 0.5; alt <= 90; alt += 0.5) {
      const v = daylightFraction(alt)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
    expect(daylightFraction(90)).toBe(1)
  })
})

describe('the lamp and the sun share one white point', () => {
  /*
   * THE OTHER PROPERTY THAT WAS BROKEN, and this is the one that showed. The
   * lamp's near target says 0.35 — mid-curve, where a change of angle still
   * changes the pixel. Read on the stone the wall is actually drawn with, in the
   * channel that clips, it was delivering 1.13 — past the shoulder — and the
   * wall at the head landing of the climb 2→3 measured R 226 flat, σ 9.6.
   */
  it('delivers the lamp’s stated near-field brightness on the stone the wall is made of', () => {
    // the drum carries the EXTERIOR palette on both faces — App.tsx -> shellMat
    const wall = peakChannelResponse(LAMP.colour, LIMESTONE_LIGHT)
    expect(lampRadianceAt(STAIR.width / 2, LAMP, wall)).toBeCloseTo(0.35, 6)
  })

  it('keeps the lamp clear of the shoulder even pressed against the stone', () => {
    const wall = peakChannelResponse(LAMP.colour, LIMESTONE_LIGHT)
    // nearer than the character controller will ever let the walker get
    expect(lampRadianceAt(0.12, LAMP, wall)).toBeLessThan(TONE_SHOULDER)
  })

  it('is dimmer than the lamp it replaces at every distance a walker uses', () => {
    // the pair before this change, measured off the running model
    const previous = { intensity: 3.7390875707609035, decay: 1.0804533083441075 }
    const wall = peakChannelResponse(LAMP.colour, LIMESTONE_LIGHT)
    for (const d of [0.45, 1, 2, 4.4, 8]) {
      expect(lampRadianceAt(d, LAMP, wall)).toBeLessThanOrEqual(
        lampRadianceAt(d, previous, wall) * 1.06,
      )
    }
  })

  it('leaves the sun brighter than the carried lamp at a room’s width', () => {
    // an instrument must not out-light the building it is there to show
    const wall = peakChannelResponse(LAMP.colour, LIMESTONE_LIGHT)
    const lampAtRoomWidth = lampRadianceAt(4, LAMP, wall)
    const sunlit = (peakChannelResponse(SUN.dayColour, LIMESTONE_LIGHT) / Math.PI) * SUN.fullIntensity
    expect(sunlit).toBeGreaterThan(lampAtRoomWidth * 5)
  })
})
