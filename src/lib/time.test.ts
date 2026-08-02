import { describe, expect, it } from 'vitest'
import {
  SITE_TIMEZONE,
  formatZonedTime,
  fromZoned,
  toZoned,
  withZonedDayOfYear,
  withZonedTime,
  zoneOffsetMinutes,
  zonedDayOfYear,
  zonedMinutesOfDay,
} from './time'
import { sunPosition } from './sun'
import { SITE } from '../config/tower'

describe('Baku offset', () => {
  it('is UTC+4 in winter', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(240)
  })

  it('is UTC+4 in summer too — Azerbaijan has no DST since 2016', () => {
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(240)
  })

  it('is read from the runtime, not assumed, for other zones', () => {
    // a zone that does observe DST must differ between January and July
    const jan = zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Europe/Berlin')
    const jul = zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Europe/Berlin')
    expect(jul - jan).toBe(60)
  })
})

describe('toZoned', () => {
  it('reads Baku wall clock from an instant', () => {
    const w = toZoned(new Date('2026-03-21T05:30:00Z'))
    expect(w).toEqual({ year: 2026, month: 3, day: 21, hours: 9, minutes: 30 })
  })

  it('rolls the date over when the offset crosses midnight', () => {
    // 22:00 UTC is already 02:00 the next day in Baku
    const w = toZoned(new Date('2026-03-21T22:00:00Z'))
    expect(w.day).toBe(22)
    expect(w.hours).toBe(2)
  })
})

describe('fromZoned', () => {
  it('is the inverse of toZoned', () => {
    for (const iso of [
      '2026-01-01T00:00:00Z',
      '2026-06-21T02:15:00Z',
      '2026-12-21T20:45:00Z',
    ]) {
      const d = new Date(iso)
      expect(fromZoned(toZoned(d)).getTime()).toBe(d.getTime())
    }
  })

  it('builds the right instant for a Baku wall clock', () => {
    const d = fromZoned({ year: 2026, month: 12, day: 21, hours: 8, minutes: 0 })
    expect(d.toISOString()).toBe('2026-12-21T04:00:00.000Z')
  })

  it('survives a DST boundary in a zone that has one', () => {
    // 03:00 on the spring-forward morning in Berlin
    const d = fromZoned({ year: 2026, month: 3, day: 29, hours: 3, minutes: 0 }, 'Europe/Berlin')
    expect(toZoned(d, 'Europe/Berlin').hours).toBe(3)
  })
})

describe('day and time helpers', () => {
  it('counts the day of the year in Baku', () => {
    expect(zonedDayOfYear(fromZoned({ year: 2026, month: 1, day: 1, hours: 12, minutes: 0 }))).toBe(1)
    expect(zonedDayOfYear(fromZoned({ year: 2026, month: 12, day: 21, hours: 12, minutes: 0 }))).toBe(355)
  })

  it('moves the day without disturbing the time of day', () => {
    const start = fromZoned({ year: 2026, month: 1, day: 5, hours: 14, minutes: 37 })
    const moved = withZonedDayOfYear(start, 200)
    expect(zonedDayOfYear(moved)).toBe(200)
    expect(toZoned(moved).hours).toBe(14)
    expect(toZoned(moved).minutes).toBe(37)
  })

  it('moves the time without disturbing the date', () => {
    const start = fromZoned({ year: 2026, month: 6, day: 10, hours: 1, minutes: 0 })
    const moved = withZonedTime(start, 23, 45)
    const w = toZoned(moved)
    expect(w.day).toBe(10)
    expect(w.hours).toBe(23)
    expect(w.minutes).toBe(45)
  })

  it('reports minutes since Baku midnight', () => {
    const d = fromZoned({ year: 2026, month: 5, day: 2, hours: 8, minutes: 20 })
    expect(zonedMinutesOfDay(d)).toBe(8 * 60 + 20)
  })

  it('formats the Baku clock zero-padded', () => {
    expect(formatZonedTime(fromZoned({ year: 2026, month: 5, day: 2, hours: 7, minutes: 5 }))).toBe('07:05')
  })
})

/**
 * The point of the whole module: the sun must follow the real instant, while the
 * clock the viewer reads is Baku's. These two must not drift apart.
 */
describe('the clock and the sun agree', () => {
  it('puts the sun near its highest at Baku solar noon', () => {
    // Baku sits at 49.84°E; solar noon there is about 12:40 local
    const noon = fromZoned({ year: 2026, month: 6, day: 21, hours: 12, minutes: 40 })
    const sun = sunPosition(noon, SITE.latitude, SITE.longitude)
    expect(sun.altitudeDeg).toBeGreaterThan(70)
    expect(Math.abs(sun.azimuthDeg - 180)).toBeLessThan(20)
  })

  it('has the sun below the horizon at Baku midnight, all year', () => {
    for (const month of [1, 4, 6, 9, 12]) {
      const midnight = fromZoned({ year: 2026, month, day: 15, hours: 0, minutes: 0 })
      expect(sunPosition(midnight, SITE.latitude, SITE.longitude).isUp).toBe(false)
    }
  })

  it('is unaffected by the machine’s own timezone', () => {
    // the instant is absolute, so the same wall clock in Baku gives the same sun
    const a = fromZoned({ year: 2026, month: 12, day: 21, hours: 8, minutes: 0 })
    const b = new Date('2026-12-21T04:00:00Z')
    expect(sunPosition(a, SITE.latitude, SITE.longitude).azimuthDeg).toBeCloseTo(
      sunPosition(b, SITE.latitude, SITE.longitude).azimuthDeg,
      10,
    )
  })

  it('uses the site timezone by default', () => {
    expect(SITE_TIMEZONE).toBe('Asia/Baku')
  })
})
