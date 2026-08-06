/**
 * The hotspot markers must point at features the model actually builds.
 *
 * This is not decoration. The hotspot layer is on by default, so its markers and
 * the panels they open are what a visitor reads, and each panel claims to show
 * where the model can be checked against a photograph. A marker on blank masonry
 * makes that claim false, and nothing in the render loop would ever complain.
 *
 * Two markers were placed by hand and had drifted off the config:
 *   - the stair marker sat at a written-down 240° on storey 2, while the only
 *     stair feature that storey has — the doorway onto the 2→3 flight — is at
 *     about 194°. 46° of drum apart, roughly 3.5 m of wall;
 *   - the cupola/oculus marker hung in storey 3, whose vault OPENINGS declares
 *     CLOSED, one storey below the nearest real opening.
 *
 * Both are pure geometry, so both are testable, and a test would have caught
 * either the day the openings were surveyed off the 2026 footage.
 */

import { describe, expect, it } from 'vitest'
import { FLOORS, LIFTS, STAIR, WALL_LIFTS, innerRadiusAt } from '../config/tower'
import { HOTSPOTS, type HotspotId } from '../data/hotspots'
import { approachAzimuthDeg, planAllFlights } from './staircase'

const marker = (id: HotspotId) => {
  const h = HOTSPOTS.find((x) => x.id === id)
  if (!h) throw new Error(`no hotspot ${id}`)
  return h
}

/** Compass azimuth of a world position about the tower axis (north = -Z). */
function azimuthOf([x, , z]: [number, number, number]): number {
  return (Math.atan2(x, -z) * 180) / Math.PI
}

/** Signed difference between two azimuths, wrapped into (-180, 180]. */
function angularGapDeg(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

/** The storey a point at height y stands in. */
function storeyAt(y: number) {
  return FLOORS.find((f) => y >= f.floorY && y <= f.ceilingY) ?? null
}

describe('hotspot markers agree with the config', () => {
  it('hangs the oculus marker in a vault the config actually pierces', () => {
    const h = marker('cupola-oculus')
    const storey = storeyAt(h.position[1])
    expect(storey, 'the marker floats outside every storey').not.toBeNull()
    expect(
      storey!.oculusRadius,
      `storey ${storey!.floorNumber}'s vault is closed — the panel would describe a hole in solid stone`,
    ).toBeGreaterThan(0)
  })

  it('does not put the oculus marker in the modern stair well', () => {
    // storey 1's vault IS pierced, but by the shaft the 2010s steel spiral rises
    // through. config/tower.ts is explicit that it is not an oculus, and a panel
    // about a stone cupola must not open under it.
    const wells = new Set(
      LIFTS.filter((l) => l.kind === 'modernSpiral').map((l) => l.fromFloorNumber - 1),
    )
    const storey = storeyAt(marker('cupola-oculus').position[1])
    expect(wells.has(storey!.index)).toBe(false)
  })

  it('puts the stair marker at the doorway onto the flight, not somewhere on the drum', () => {
    const h = marker('staircase')
    const storey = storeyAt(h.position[1])
    expect(storey, 'the marker floats outside every storey').not.toBeNull()

    const flights = planAllFlights(STAIR, WALL_LIFTS, innerRadiusAt)
    // every way onto or off the wall stair at this storey: feet of flights that
    // leave it, heads of flights that arrive at it
    const doorways: number[] = []
    flights.forEach((steps, i) => {
      if (steps.length === 0) return
      const lift = WALL_LIFTS[i]
      if (lift.fromFloorNumber === storey!.floorNumber) {
        doorways.push(approachAzimuthDeg(steps, steps[0], STAIR.width))
      }
      if (lift.toFloorNumber === storey!.floorNumber) {
        doorways.push(approachAzimuthDeg(steps, steps[steps.length - 1], STAIR.width))
      }
    })
    expect(doorways.length, `storey ${storey!.floorNumber} has no wall stair at all`).toBeGreaterThan(0)

    const az = azimuthOf(h.position)
    const nearest = Math.min(...doorways.map((d) => angularGapDeg(az, d)))
    // 3° at the marker's radius is under 0.2 m — the marker is meant to sit in
    // the opening, not merely near it. The old hardcoded 240 missed by 46°.
    expect(nearest, `nearest stair doorway is ${nearest.toFixed(1)}° away`).toBeLessThan(3)
  })

  it('keeps every interior marker inside the room it belongs to', () => {
    for (const h of HOTSPOTS.filter((x) => x.interior)) {
      const r = Math.hypot(h.position[0], h.position[2])
      expect(r, `${h.id} is buried in the masonry`).toBeLessThanOrEqual(
        innerRadiusAt(h.position[1]),
      )
    }
  })
})
