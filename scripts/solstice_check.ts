import { SITE, FLOORS, TOWER, BUTTRESS, innerRadiusAt } from '../src/config/tower'
import { sunPosition, sunriseAzimuth, openingsLit, beamThroughOpening, keyDates, angleDelta, type OpeningAperture } from '../src/lib/sun'
import windowData from '../src/data/windows.json'
import type { WindowSpec } from '../src/lib/windows'

const { latitude: LAT, longitude: LON } = SITE
const apertures: OpeningAperture[] = (windowData.windows as WindowSpec[]).map((w) => {
  const f = FLOORS[w.floorIndex]
  const centreY = f.floorY + w.heightAboveFloor + w.outerHeight / 2
  return { id: w.id, azimuthDeg: w.azimuthDeg, centreY,
    outerWidth: w.outerWidth, outerHeight: w.outerHeight,
    innerWidth: w.innerWidth, innerHeight: w.innerHeight,
    outerRadius: TOWER.outerRadius, innerRadius: innerRadiusAt(centreY) }
})

console.log('=== sunrise azimuths at Baku (40.3661N) ===')
for (const k of keyDates(2026)) {
  const az = sunriseAzimuth(k.date, LAT, LON)
  console.log(`  ${k.id.padEnd(17)} ${az!.toFixed(1)}°`)
}

console.log('\n=== buttress claim (Ahmadov: points at equinox sunrise) ===')
const eqAz = sunriseAzimuth(new Date(2026, 2, 20), LAT, LON)!
console.log(`  equinox sunrise    ${eqAz.toFixed(1)}°`)
console.log(`  buttress (measured) ${BUTTRESS.azimuthDeg}°  → off by ${Math.abs(angleDelta(BUTTRESS.azimuthDeg, eqAz)).toFixed(1)}°`)

console.log('\n=== Islamov claim: which openings does the WINTER SOLSTICE sunrise reach? ===')
const lit = new Map<string, string>()
for (let m = 0; m < 180; m += 2) {
  const t = new Date(2026, 11, 21, 7, m)
  const sun = sunPosition(t, LAT, LON)
  if (!sun.isUp) continue
  for (const h of openingsLit(sun, apertures)) {
    if (!lit.has(h.openingId))
      lit.set(h.openingId, `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')} (sun az ${sun.azimuthDeg.toFixed(1)}°, alt ${sun.altitudeDeg.toFixed(1)}°)`)
  }
}
if (lit.size === 0) console.log('  NONE — no opening admits the solstice sunrise beam')
else for (const [id, when] of lit) console.log(`  ${id.padEnd(14)} first lit ${when}`)

console.log('\n  per-opening closest approach at solstice sunrise:')
const rise = new Date(2026, 11, 21, 8, 0)
const sunAtRise = sunPosition(rise, LAT, LON)
for (const a of apertures) {
  const h = beamThroughOpening(sunAtRise, a)
  const off = angleDelta(sunAtRise.azimuthDeg, a.azimuthDeg)
  console.log(`    ${a.id.padEnd(14)} az ${String(a.azimuthDeg).padStart(5)}°  offset ${off.toFixed(1).padStart(7)}°  ${h ? (h.entersRoom ? 'LIT' : 'blocked') : 'facing away'}`)
}
