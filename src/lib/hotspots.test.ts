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
import { SHIPPED_ENDS, SHIPPED_TUBES } from './openings.fixture'
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
        doorways.push(approachAzimuthDeg(steps, steps[0], STAIR.width, STAIR.doorwayWidth))
      }
      if (lift.toFloorNumber === storey!.floorNumber) {
        doorways.push(
          approachAzimuthDeg(steps, steps[steps.length - 1], STAIR.width, STAIR.doorwayWidth),
        )
      }
    })
    expect(doorways.length, `storey ${storey!.floorNumber} has no wall stair at all`).toBeGreaterThan(0)

    const az = azimuthOf(h.position)
    const nearest = Math.min(...doorways.map((d) => angularGapDeg(az, d)))
    // 3° at the marker's radius is under 0.2 m — the marker is meant to sit in
    // the opening, not merely near it. The old hardcoded 240 missed by 46°.
    expect(nearest, `nearest stair doorway is ${nearest.toFixed(1)}° away`).toBeLessThan(3)
  })

  it('keeps every interior marker in a place a visitor can stand', () => {
    /*
     * "Inside the room" was the whole rule until 2026-08-10. It is not any more:
     * the tower's openings are at the ends of the stair passages, so a marker for
     * one has to stand ON THE LANDING, which is inside the masonry by definition.
     * The rule that survives is the one that mattered — a marker must be
     * somewhere a visitor can actually be — so a marker is either in a chamber or
     * in a stair passage, and never in solid stone.
     */
    for (const h of HOTSPOTS.filter((x) => x.interior)) {
      const r = Math.hypot(h.position[0], h.position[2])
      const y = h.position[1]
      if (r <= innerRadiusAt(y)) continue
      const az = azimuthOf(h.position)
      const inPassage = SHIPPED_TUBES.some((tube) =>
        tube.some(
          (sec) =>
            angularGapDeg(az, sec.azimuthDeg) < 3 &&
            r >= sec.innerRadius &&
            r <= sec.outerRadius &&
            y >= sec.bottomY &&
            y <= sec.topY,
        ),
      )
      expect(inPassage, `${h.id} is buried in the masonry at r ${r.toFixed(2)}, y ${y.toFixed(2)}`).toBe(
        true,
      )
    }
  })

  it('stands each window marker on an opening that is actually built', () => {
    /*
     * THE TEST THAT WAS MISSING, and its absence is why a stale azimuth survived.
     *
     * 'slits' and the marker now called 'passage-slit' both carried a written
     * 141° — the single-ladder reading of the photographs, already superseded on
     * 2026-08-09 when the lower column moved to 170, and superseded again by
     * [OWNER] on 2026-08-10. Nothing failed, because a marker on blank masonry
     * renders exactly like a marker on an opening and the panel it opens claims
     * "here is where the model can be checked against a photograph".
     */
    const built = SHIPPED_ENDS.filter((o) => o.built)
    expect(built.length).toBeGreaterThan(0)
    for (const id of ['slits', 'passage-slit'] as const) {
      const h = HOTSPOTS.find((x) => x.id === id)!
      const az = azimuthOf(h.position)
      const nearest = built.reduce((best, o) =>
        angularGapDeg(az, o.azimuthDeg) < angularGapDeg(az, best.azimuthDeg) ? o : best,
      )
      expect(angularGapDeg(az, nearest.azimuthDeg), `${id} bearing`).toBeLessThan(3)
      expect(Math.abs(h.position[1] - nearest.centreY), `${id} height`).toBeLessThan(1.6)
    }
  })
})
