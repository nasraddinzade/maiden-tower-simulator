/**
 * Time in the tower's own timezone. Pure, testable.
 *
 * Two different things are easy to confuse here, and getting them backwards
 * makes the sun wrong:
 *
 *   - The SUN's position depends only on the absolute instant plus the site's
 *     coordinates. suncalc takes a Date, which is an instant, so it is already
 *     correct for Baku whatever timezone the viewer's machine is in.
 *   - The UI, on the other hand, must read and edit BAKU wall-clock time.
 *     Otherwise someone opening the app from Moscow sees "15:00" while it is
 *     16:00 in Baku, and dragging the hour slider moves the sun to the wrong
 *     place for the label it shows.
 *
 * So: the state stays an instant, and everything the viewer sees or drags is
 * converted through here. The offset is read from the runtime rather than
 * hardcoded to +04:00 — Azerbaijan dropped DST in 2016, but a fixed constant
 * would silently rot if that ever changed again.
 */

export const SITE_TIMEZONE = 'Asia/Baku'

export interface WallClock {
  year: number
  /** 1–12, unlike Date's 0–11. */
  month: number
  day: number
  hours: number
  minutes: number
}

function parts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out: Record<string, number> = {}
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return out
}

/** Offset of the zone from UTC at that instant, in minutes (positive east). */
export function zoneOffsetMinutes(date: Date, timeZone = SITE_TIMEZONE): number {
  const p = parts(date, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // drop sub-second so the difference is a clean number of minutes
  return Math.round((asIfUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/** The wall clock a viewer in the zone would read at that instant. */
export function toZoned(date: Date, timeZone = SITE_TIMEZONE): WallClock {
  const p = parts(date, timeZone)
  return { year: p.year, month: p.month, day: p.day, hours: p.hour, minutes: p.minute }
}

/** The instant at which the zone's wall clock reads these values. */
export function fromZoned(wall: WallClock, timeZone = SITE_TIMEZONE): Date {
  const asIfUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hours, wall.minutes)
  // One refinement pass: the offset must be sampled at the resulting instant,
  // not at the naive guess, or a DST boundary lands an hour out.
  let result = new Date(asIfUtc - zoneOffsetMinutes(new Date(asIfUtc), timeZone) * 60000)
  result = new Date(asIfUtc - zoneOffsetMinutes(result, timeZone) * 60000)
  return result
}

/** Day of the year (1–366) as counted in the zone. */
export function zonedDayOfYear(date: Date, timeZone = SITE_TIMEZONE): number {
  const w = toZoned(date, timeZone)
  const start = Date.UTC(w.year, 0, 1)
  const today = Date.UTC(w.year, w.month - 1, w.day)
  return Math.round((today - start) / 86400000) + 1
}

/** Same time of day, moved to the given day of the year in the zone. */
export function withZonedDayOfYear(
  date: Date,
  dayOfYear: number,
  timeZone = SITE_TIMEZONE,
): Date {
  const w = toZoned(date, timeZone)
  const target = new Date(Date.UTC(w.year, 0, 1))
  target.setUTCDate(dayOfYear)
  return fromZoned(
    {
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
      hours: w.hours,
      minutes: w.minutes,
    },
    timeZone,
  )
}

/** Same date, moved to the given time of day in the zone. */
export function withZonedTime(
  date: Date,
  hours: number,
  minutes: number,
  timeZone = SITE_TIMEZONE,
): Date {
  const w = toZoned(date, timeZone)
  return fromZoned({ ...w, hours, minutes }, timeZone)
}

/** Minutes since midnight, as read in the zone. */
export function zonedMinutesOfDay(date: Date, timeZone = SITE_TIMEZONE): number {
  const w = toZoned(date, timeZone)
  return w.hours * 60 + w.minutes
}

/** Zero-padded HH:MM as read in the zone. */
export function formatZonedTime(date: Date, timeZone = SITE_TIMEZONE): string {
  const w = toZoned(date, timeZone)
  return `${String(w.hours).padStart(2, '0')}:${String(w.minutes).padStart(2, '0')}`
}
