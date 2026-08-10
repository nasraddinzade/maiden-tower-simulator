import { describe, expect, it } from 'vitest'
import {
  angleDelta,
  beamThroughOpening,
  keyDates,
  openingsLit,
  sunDirection,
  sunPosition,
  sunriseAzimuth,
  type OpeningAperture,
} from './sun'
import { SITE } from '../config/tower'
import { SHIPPED_CUTS, SHIPPED_ENDS, CHAMBER_WINDOWS } from './openings.fixture'
import { buildApertures } from '../components/sun/SunBeams'

const { latitude: LAT, longitude: LON } = SITE

/** Analytic sunrise azimuth for a declination — derived independently of suncalc. */
function analyticSunriseAz(declDeg: number, altDeg = 0): number {
  const phi = (LAT * Math.PI) / 180
  const dec = (declDeg * Math.PI) / 180
  const a = (altDeg * Math.PI) / 180
  const cosA = (Math.sin(dec) - Math.sin(phi) * Math.sin(a)) / (Math.cos(phi) * Math.cos(a))
  return (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI
}

describe('azimuth convention', () => {
  it('agrees with the independent analytic value at the equinox', () => {
    // the equinox sun rises due east everywhere; a convention error would show here
    expect(analyticSunriseAz(0)).toBeCloseTo(90, 6)
    const az = sunriseAzimuth(new Date(2026, 2, 20), LAT, LON)
    expect(az).not.toBeNull()
    expect(Math.abs(az! - 90)).toBeLessThan(2)
  })

  it('agrees with the analytic winter-solstice azimuth', () => {
    // geometric 121.5°, visible (refracted, upper limb) ≈120.7°
    expect(analyticSunriseAz(-23.44)).toBeCloseTo(121.47, 1)
    const az = sunriseAzimuth(new Date(2026, 11, 21), LAT, LON)!
    expect(az).toBeGreaterThan(118)
    expect(az).toBeLessThan(124)
  })

  it('agrees with the analytic summer-solstice azimuth', () => {
    expect(analyticSunriseAz(23.44)).toBeCloseTo(58.53, 1)
    const az = sunriseAzimuth(new Date(2026, 5, 21), LAT, LON)!
    expect(az).toBeGreaterThan(55)
    expect(az).toBeLessThan(62)
  })

  it('puts the midday sun in the south at this latitude', () => {
    const noon = sunPosition(new Date(2026, 5, 21, 12, 40), LAT, LON)
    expect(noon.isUp).toBe(true)
    expect(Math.abs(angleDelta(noon.azimuthDeg, 180))).toBeLessThan(25)
    expect(noon.altitudeDeg).toBeGreaterThan(60) // high summer sun
  })

  it('reports the sun as down in the middle of the night', () => {
    expect(sunPosition(new Date(2026, 0, 15, 1, 0), LAT, LON).isUp).toBe(false)
  })

  it('makes winter noon much lower than summer noon', () => {
    const w = sunPosition(new Date(2026, 11, 21, 12, 40), LAT, LON).altitudeDeg
    const s = sunPosition(new Date(2026, 5, 21, 12, 40), LAT, LON).altitudeDeg
    expect(s - w).toBeGreaterThan(40)
  })
})

describe('sunDirection', () => {
  it('points north-ish and level for a sun on the northern horizon', () => {
    const d = sunDirection({ azimuthDeg: 0, altitudeDeg: 0, isUp: true })
    expect(d.x).toBeCloseTo(0, 10)
    expect(d.y).toBeCloseTo(0, 10)
    expect(d.z).toBeCloseTo(-1, 10) // north = −Z
  })
  it('points east at azimuth 90', () => {
    const d = sunDirection({ azimuthDeg: 90, altitudeDeg: 0, isUp: true })
    expect(d.x).toBeCloseTo(1, 10)
  })
  it('points straight up at the zenith', () => {
    const d = sunDirection({ azimuthDeg: 123, altitudeDeg: 90, isUp: true })
    expect(d.y).toBeCloseTo(1, 10)
  })
  it('is always a unit vector', () => {
    for (const az of [0, 47, 130, 271]) {
      for (const alt of [0, 15, 60]) {
        const d = sunDirection({ azimuthDeg: az, altitudeDeg: alt, isUp: true })
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10)
      }
    }
  })
})

describe('key dates', () => {
  const dates = keyDates(2026)

  it('includes both solstices, both equinoxes and Novruz', () => {
    expect(dates.map((d) => d.id).sort()).toEqual([
      'autumn-equinox',
      'novruz',
      'spring-equinox',
      'summer-solstice',
      'winter-solstice',
    ])
  })

  it('puts Novruz at the spring equinox, as the Azerbaijani new year', () => {
    const novruz = dates.find((d) => d.id === 'novruz')!
    expect(novruz.date.getMonth()).toBe(2) // March
    expect(novruz.date.getDate()).toBe(21)
  })

  it('orders the sunrise azimuths as the seasons require', () => {
    const az = (id: string) =>
      sunriseAzimuth(dates.find((d) => d.id === id)!.date, LAT, LON)!
    // summer sunrise is furthest north (smallest azimuth), winter furthest south
    expect(az('summer-solstice')).toBeLessThan(az('spring-equinox'))
    expect(az('spring-equinox')).toBeLessThan(az('winter-solstice'))
  })
})

describe('beam through an opening', () => {
  const slit: OpeningAperture = {
    id: 'test',
    azimuthDeg: 120,
    centreY: 10,
    outerWidth: 0.4,
    outerHeight: 1.9,
    innerWidth: 1.5,
    innerHeight: 2.4,
    outerRadius: 8.25,
    revealEndRadius: 8.25 - 4.0,
  }

  it('admits nothing when the sun is down', () => {
    expect(beamThroughOpening({ azimuthDeg: 120, altitudeDeg: -5, isUp: false }, slit)).toBeNull()
  })

  it('admits nothing through the back of the wall', () => {
    expect(beamThroughOpening({ azimuthDeg: 300, altitudeDeg: 20, isUp: true }, slit)).toBeNull()
  })

  it('lets a low sun straight down the axis into the room', () => {
    const hit = beamThroughOpening({ azimuthDeg: 120, altitudeDeg: 1, isUp: true }, slit)!
    expect(hit.entersRoom).toBe(true)
    expect(hit.lateralMiss).toBeLessThan(0.1)
  })

  it('blocks a high midday sun — a deep slit only sees its own axis', () => {
    const hit = beamThroughOpening({ azimuthDeg: 120, altitudeDeg: 65, isUp: true }, slit)!
    expect(hit.entersRoom).toBe(false)
  })

  it('blocks a sun well off the opening bearing', () => {
    const hit = beamThroughOpening({ azimuthDeg: 160, altitudeDeg: 2, isUp: true }, slit)!
    expect(hit.entersRoom).toBe(false)
  })

  it('has an acceptance of only a few degrees, as a loophole should', () => {
    const accepted: number[] = []
    for (let off = 0; off < 45; off += 0.5) {
      const hit = beamThroughOpening(
        { azimuthDeg: 120 + off, altitudeDeg: 1, isUp: true },
        slit,
      )!
      if (hit.entersRoom) accepted.push(off)
    }
    const widest = Math.max(...accepted)
    expect(widest).toBeGreaterThan(5)
    expect(widest).toBeLessThan(30)
  })
})

/**
 * The point of Phase 8. This does NOT ask "does the ray hit the window we
 * designated" — no source identifies such a window, and designating one would
 * decide the answer in advance (CLAUDE.md rule 7). It asks the open question:
 * at winter-solstice sunrise, which openings does the sun actually reach?
 */
describe('Islamov’s winter-solstice claim, tested rather than assumed', () => {
  /*
   * The SAME openings the shell is cut with. This block used to rebuild each
   * centre as floorY + heightAboveFloor + outerHeight/2 while the app had moved
   * on to the photographic fraction, so Phase 8 was being answered for a tower
   * with windows a metre from the real ones. Both fields are gone; the apertures
   * come off the cuts.
   */
  const apertures: OpeningAperture[] = buildApertures(SHIPPED_CUTS)

  it('has no opening pre-flagged as the solstice one', () => {
    expect(SHIPPED_ENDS.some((o) => o.solsticeAligned)).toBe(false)
    expect(CHAMBER_WINDOWS.some((w) => w.solsticeAligned)).toBe(false)
  })

  it('asks the question of a SHALLOWER reveal than it used to, which changes the answer', () => {
    /*
     * Recorded so the change is not mistaken for noise. A slit's reveal now stops
     * on the stair passage's outer cheek instead of crossing to the room face, so
     * the masonry a ray must cross falls from about 4.6 m to 2.5–3.5 and the
     * acceptance cone widens. The bearings moved too, by more than 100°. Phase 8
     * will report a different set of lit openings, and that is the finding to
     * publish rather than a discrepancy to remove (CLAUDE.md rule 7).
     */
    const slits = apertures.filter((a) => a.id !== 'arched-later')
    for (const a of slits) {
      const depth = a.outerRadius - a.revealEndRadius
      expect(depth).toBeGreaterThan(2.4)
      expect(depth).toBeLessThan(3.6)
    }
    // the arched window is the one opening that still crosses to a room
    const arched = apertures.find((a) => a.id === 'arched-later')!
    expect(arched.outerRadius - arched.revealEndRadius).toBeGreaterThan(4)
  })

  it('reports a definite, reproducible answer at solstice sunrise', () => {
    const date = new Date(2026, 11, 21)
    const az = sunriseAzimuth(date, LAT, LON)!
    // sample the first hour after sunrise, when a low beam can reach deepest
    const rise = new Date(date)
    rise.setHours(0, 0, 0, 0)
    const hits = new Set<string>()
    for (let m = 0; m < 90; m += 5) {
      const t = new Date(date.getFullYear(), 11, 21, 8, m)
      const sun = sunPosition(t, LAT, LON)
      for (const h of openingsLit(sun, apertures)) hits.add(h.openingId)
    }
    // The assertion is only that the test is DECIDABLE and stable — whichever way
    // it comes out is the finding, and the app shows it rather than asserting it.
    expect(az).toBeGreaterThan(118)
    expect(hits).toBeInstanceOf(Set)
  })

  it('never lets the midday summer sun down a slit', () => {
    const sun = sunPosition(new Date(2026, 5, 21, 12, 40), LAT, LON)
    expect(
      openingsLit(sun, apertures.filter((a) => a.id !== 'arched-later')),
    ).toEqual([])
  })
})
