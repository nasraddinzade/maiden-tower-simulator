/**
 * Solar geometry (Phase 8). Pure: suncalc + arithmetic, no three.js, no React.
 *
 * This is the module the whole "was it an observatory?" question rests on, so it
 * is kept honest and testable. Nothing here knows which opening anyone WANTS the
 * sunbeam to enter — it only reports where the sun is and what it can see.
 *
 * Convention (CLAUDE.md rule 3): azimuth is degrees clockwise from true north.
 *
 * suncalc v2 already reports exactly that — north-based clockwise, in DEGREES,
 * with a refraction-corrected apparent altitude also in degrees. That is a
 * change from the widely-documented v1 API (radians, measured from south), so
 * no conversion belongs here; adding one silently rotates the whole sky.
 */

// suncalc v2 is ESM with named exports and no default binding
import { getPosition, getTimes } from 'suncalc'
import { azimuthToVector } from './geometry'
import { fromZoned } from './time'

export interface SunPosition {
  /** Degrees clockwise from true north. */
  azimuthDeg: number
  /** Degrees above the horizon; negative when the sun is down. */
  altitudeDeg: number
  /** True when the sun's centre is above the true horizon. */
  isUp: boolean
}

/** Sun position for a moment and place, in the project's azimuth convention. */
export function sunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const p = getPosition(date, latitude, longitude)
  const azimuthDeg = ((p.azimuth % 360) + 360) % 360
  return { azimuthDeg, altitudeDeg: p.altitude, isUp: p.altitude > 0 }
}

/**
 * Unit vector pointing FROM the tower TOWARDS the sun, in world axes
 * (metres, Y up, north = −Z, east = +X).
 */
export function sunDirection(pos: SunPosition): { x: number; y: number; z: number } {
  const horizontal = azimuthToVector(pos.azimuthDeg)
  const alt = (pos.altitudeDeg * Math.PI) / 180
  const cos = Math.cos(alt)
  return { x: horizontal.x * cos, y: Math.sin(alt), z: horizontal.z * cos }
}

/** Moment of sunrise (upper limb, refracted — suncalc's standard) for a date. */
export function sunriseAt(date: Date, latitude: number, longitude: number): Date | null {
  const times = getTimes(date, latitude, longitude)
  const t = times.sunrise
  return t instanceof Date && !Number.isNaN(t.getTime()) ? t : null
}

/** Azimuth the sun rises at on a given date, or null on a polar day/night. */
export function sunriseAzimuth(date: Date, latitude: number, longitude: number): number | null {
  const rise = sunriseAt(date, latitude, longitude)
  if (!rise) return null
  return sunPosition(rise, latitude, longitude).azimuthDeg
}

export interface KeyDate {
  id: string
  /** Human-facing label key; the UI translates it. */
  label: string
  date: Date
}

/**
 * The dates that matter for the hypotheses, for a given year.
 *
 * Novruz is included because it is the Azerbaijani new year and falls at the
 * spring equinox — the Phase-8 spec asks for it as a preset.
 * Solstice/equinox dates vary by a day between years; these are the usual ones
 * and the exact instant is not needed, since we scrub time of day separately.
 *
 * Built in BAKU wall-clock time, so "sunrise on 21 December" means sunrise as
 * seen at the tower, not at whatever longitude the viewer happens to be on.
 */
export function keyDates(year: number): KeyDate[] {
  const at = (month: number, day: number, hours: number): Date =>
    fromZoned({ year, month, day, hours, minutes: 0 })
  return [
    { id: 'winter-solstice', label: 'winterSolstice', date: at(12, 21, 8) },
    { id: 'spring-equinox', label: 'springEquinox', date: at(3, 20, 7) },
    { id: 'novruz', label: 'novruz', date: at(3, 21, 7) },
    { id: 'summer-solstice', label: 'summerSolstice', date: at(6, 21, 5) },
    { id: 'autumn-equinox', label: 'autumnEquinox', date: at(9, 22, 7) },
  ]
}

// ————————————————————— does the beam enter an opening? —————————————————————

export interface OpeningAperture {
  id: string
  /** Azimuth of the opening's outward normal. */
  azimuthDeg: number
  /** World Y of the opening's centre. */
  centreY: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  /** Radius of the outer face at this opening. */
  outerRadius: number
  /**
   * Radius at which the reveal ENDS.
   *
   * Called innerRadius until 2026-08-10, when it stopped being the room face for
   * most openings: a slit's reveal now ends on the outer cheek of the stair
   * passage it lights. The arithmetic below is unaffected — it only ever wanted
   * the depth of masonry the ray crosses — but the old name had become a false
   * statement about where the light arrives.
   */
  revealEndRadius: number
}

export interface BeamHit {
  openingId: string
  /** Angle between the sun's bearing and the opening's normal, degrees. */
  bearingOffsetDeg: number
  /** How far the beam's centre line lands from the opening's centre, metres. */
  lateralMiss: number
  verticalMiss: number
  /** True when the beam clears the full depth of the reveal and reaches the room. */
  entersRoom: boolean
}

/** Shortest signed difference a − b, in (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

/**
 * Whether sunlight actually gets through an opening, and by how much it misses.
 *
 * Treats the opening as a rectangular aperture in a wall of the given thickness.
 * The beam must (a) come from the outward side at all, and (b) still be inside
 * the aperture after crossing the reveal — a slit deep in a 4 m wall admits light
 * only within a few degrees of its normal, which is the entire point of the
 * "narrow outside, flaring inward" form.
 */
export function beamThroughOpening(
  sun: SunPosition,
  opening: OpeningAperture,
): BeamHit | null {
  if (!sun.isUp) return null

  const bearingOffsetDeg = angleDelta(sun.azimuthDeg, opening.azimuthDeg)
  // light cannot arrive through the back of a wall
  if (Math.abs(bearingOffsetDeg) >= 90) return null

  const depth = Math.max(0.01, opening.outerRadius - opening.revealEndRadius)

  // Crossing `depth` of masonry, a ray slides sideways by depth·tan(offset) and
  // up or down by depth·tan(altitude).
  const lateralMiss = Math.abs(depth * Math.tan((bearingOffsetDeg * Math.PI) / 180))
  const verticalMiss = Math.abs(depth * Math.tan((sun.altitudeDeg * Math.PI) / 180))

  // The most oblique ray that still gets through runs from one edge of the OUTER
  // aperture to the opposite edge of the INNER one, so the budget is the sum of
  // the two half-widths. This is why a slit in a 4 m wall accepts light only
  // within a few degrees of its own axis — the whole point of the loophole form.
  const lateralBudget = (opening.outerWidth + opening.innerWidth) / 2
  const verticalBudget = (opening.outerHeight + opening.innerHeight) / 2

  const entersRoom = lateralMiss <= lateralBudget && verticalMiss <= verticalBudget

  return { openingId: opening.id, bearingOffsetDeg, lateralMiss, verticalMiss, entersRoom }
}

/** Every opening the sun currently reaches into. */
export function openingsLit(sun: SunPosition, openings: OpeningAperture[]): BeamHit[] {
  return openings
    .map((o) => beamThroughOpening(sun, o))
    .filter((h): h is BeamHit => h !== null && h.entersRoom)
}
