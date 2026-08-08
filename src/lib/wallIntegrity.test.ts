import { describe, expect, it } from 'vitest'
import {
  ENTRANCE,
  FLOORS,
  STAIR,
  TOWER,
  WALL_LIFTS,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import {
  MIN_JAMB_THICKNESS,
  passageWindowsAt,
  wallColliders,
  type FlightSection,
} from './collision'
import { planAllFlights, stairDoorways, stairPassageSections } from './staircase'

/*
 * THE ROOM WALL MUST NOT HAVE HOLES IN IT.
 *
 * It did. The flights are stacked one above another, and the collider builder
 * still merged any two passage crossings less than 0.5 m apart vertically — a
 * rule written for a helix whose two crossings at an azimuth were 17 m apart.
 * Three storeys' passages merged into one 9.97 m opening, the merged opening
 * took the LOWEST flight's inner radius, the wall thins going up, and the jamb
 * came out zero or negative thickness and was silently dropped. Seven of the 32
 * sectors carried open slots up to 6.97 m tall, and stepping off a storey slab
 * at the wall dropped the visitor as far as 12.3 m, out onto the ground.
 *
 * None of it showed. The type checker was happy, 378 tests were green, and the
 * drum's own drawn stone was intact — only the physics was missing.
 */
const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
const tubes = stairPassageSections(
  flights,
  STAIR.width,
  PLAYER.stairHeadroom,
  innerRadiusAt,
  undefined,
  STAIR.doorwayWidth,
)
const sections: FlightSection[] = tubes.flatMap((t, flight) =>
  t.map((s) => ({ ...s, flight })),
)
const doorways = stairDoorways(
  flights,
  STAIR.width,
  ENTRANCE.height,
  innerRadiusAt,
  (i: number, end: 'foot' | 'head') =>
    end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
  WALL_LIFTS.map((l) => l.opensAtY),
  STAIR.doorwayWidth,
)

const SECTORS = 32
const sectorDeg = 360 / SECTORS

describe('passage openings are counted per flight', () => {
  it('never merges two flights into one opening', () => {
    const bad: string[] = []
    for (let s = 0; s < SECTORS; s += 1) {
      const az = s * sectorDeg + sectorDeg / 2
      const windows = passageWindowsAt(sections, az, sectorDeg)
      const flightsHere = new Set(
        sections
          .filter((x) => {
            const d = Math.abs(((((x.azimuthDeg - az) % 360) + 540) % 360) - 180)
            return d <= sectorDeg / 2 + 3
          })
          .map((x) => x.flight),
      )
      if (windows.length !== flightsHere.size) {
        bad.push(`az ${az.toFixed(3)}: ${windows.length} openings for ${flightsHere.size} flights`)
      }
    }
    expect(bad).toEqual([])
  })

  it('keeps every opening inside the flight that made it', () => {
    /*
     * A merged opening was tall enough to span the stone between two flights.
     * One flight's passage is at most its own height — headroom plus the drop to
     * the bed — plus the arc the sector samples, which is well under a storey.
     */
    const storey = FLOORS[1].floorY - FLOORS[0].floorY
    for (let s = 0; s < SECTORS; s += 1) {
      const az = s * sectorDeg + sectorDeg / 2
      for (const w of passageWindowsAt(sections, az, sectorDeg)) {
        expect(w.topY - w.bottomY, `az ${az.toFixed(1)}`).toBeLessThan(storey)
      }
    }
  })
})

describe('the wall beside a passage is never left out', () => {
  const boxes = wallColliders({
    sectors: SECTORS,
    outerRadius: TOWER.outerRadius,
    innerRadiusAt,
    baseY: ENTRANCE.groundY - 0.5,
    topY: TOWER.topY,
    bandBoundaries: [
      ENTRANCE.groundY - 0.5,
      ...FLOORS.map((f) => f.floorY),
      TOWER.topY - TOWER.parapetHeight,
      TOWER.topY,
    ],
    entrance: {
      azimuthDeg: ENTRANCE.azimuthDeg,
      widthDeg: (ENTRANCE.width / TOWER.outerRadius) * (180 / Math.PI),
      sillY: ENTRANCE.thresholdY,
      headY: ENTRANCE.thresholdY + ENTRANCE.height,
    },
    openings: doorways.map((d) => ({
      azimuthDeg: d.azimuthDeg,
      widthDeg: d.widthDeg,
      sillY: d.bottomY,
      headY: d.topY,
    })),
    passageAt: (az) => passageWindowsAt(sections, az, sectorDeg),
  })

  it('leaves no wall box thinner than the minimum jamb', () => {
    /*
     * The old guard skipped a jamb whose thickness came out under 0.02 m, which
     * does not leave a thin wall — it leaves none. A degenerate thickness now
     * yields MIN_JAMB_THICKNESS instead, so the same class of upstream mistake
     * cannot express itself as somewhere to fall.
     */
    for (const b of boxes) {
      if (b.kind !== 'wall') continue
      expect(b.halfExtents[0] * 2).toBeGreaterThanOrEqual(MIN_JAMB_THICKNESS - 1e-9)
    }
  })

  it('carries wall at every storey floor, in every sector', () => {
    /*
     * The failure was not subtle once you knew where to sample: standing ON a
     * storey slab, at the room face, in the sectors the stair passes through.
     * Every sector must have wall somewhere just above each floor, unless a
     * declared opening covers it.
     */
    const missing: string[] = []
    for (let s = 0; s < SECTORS; s += 1) {
      const az = s * sectorDeg + sectorDeg / 2
      const d = { x: Math.sin(az * (Math.PI / 180)), z: -Math.cos(az * (Math.PI / 180)) }
      for (const f of FLOORS) {
        const y = f.floorY + 0.9
        const covered =
          boxes.some((b) => {
            if (b.kind !== 'wall') return false
            const r = Math.hypot(b.position[0], b.position[2])
            const bAz = ((Math.atan2(b.position[0], -b.position[2]) * 180) / Math.PI + 360) % 360
            const dAz = Math.abs(((bAz - az + 540) % 360) - 180)
            return dAz < sectorDeg * 0.6 && Math.abs(b.position[1] - y) <= b.halfExtents[1] && r > 0
          }) ||
          passageWindowsAt(sections, az, sectorDeg).some((w) => y >= w.bottomY && y <= w.topY) ||
          doorways.some((dw) => {
            const dAz = Math.abs(((dw.azimuthDeg - az + 540) % 360) - 180)
            return dAz < dw.widthDeg / 2 + sectorDeg / 2 && y >= dw.bottomY && y <= dw.topY
          }) ||
          (Math.abs(((ENTRANCE.azimuthDeg - az + 540) % 360) - 180) < sectorDeg &&
            y >= ENTRANCE.thresholdY &&
            y <= ENTRANCE.thresholdY + ENTRANCE.height)
        if (!covered) missing.push(`storey ${f.floorNumber} az ${az.toFixed(1)} (${d.x.toFixed(2)})`)
      }
    }
    expect(missing).toEqual([])
  })
})
