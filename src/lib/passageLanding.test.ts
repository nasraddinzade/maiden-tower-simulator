import { describe, expect, it } from 'vitest'
import {
  PASSAGE_FOOT_TOLERANCE,
  entryLandingTreads,
  planAllFlights,
  planFlight,
  stairPassageSections,
  type PassageSection,
  type StepPlacement,
} from './staircase'
import { PLAYER } from '../config/player'
import { ROOF, STAIR, WALL_LIFTS, innerRadiusAt, stairSettings } from '../config/tower'

/**
 * THE PLATFORM YOU ENTER A FLIGHT ONTO IS ONE PLANE, and the property is about the
 * SWEPT floor rather than about the sections.
 *
 * stairPassageSections() returns cross-sections; the solid is lofted between
 * consecutive ones, so a bed that is right AT every section can still fall into a
 * trench between two of them. That is exactly the fault here — the sections over
 * the platform were cut 1.5 risers down and the lead beyond them at floor level,
 * and the loft between the two dips 0.155 m at the doorway's far jamb. So these
 * tests interpolate the bed the way the sweep does and ask what a walker looking
 * through the doorway would see.
 */
function bedAt(tube: PassageSection[], azimuthDeg: number): number | null {
  for (let i = 1; i < tube.length; i += 1) {
    const a = tube[i - 1]
    const b = tube[i]
    const lo = Math.min(a.azimuthDeg, b.azimuthDeg)
    const hi = Math.max(a.azimuthDeg, b.azimuthDeg)
    if (azimuthDeg < lo - 1e-9 || azimuthDeg > hi + 1e-9) continue
    const t = hi - lo < 1e-9 ? 0 : (azimuthDeg - a.azimuthDeg) / (b.azimuthDeg - a.azimuthDeg)
    return a.bottomY + (b.bottomY - a.bottomY) * t
  }
  return null
}

const tubesFor = (flights: StepPlacement[][]) =>
  stairPassageSections(
    flights,
    STAIR.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
    ROOF.masonryTopY,
    undefined,
    STAIR.doorwayWidth,
  )

describe('entryLandingTreads', () => {
  const base = {
    fromY: 0,
    toY: 2,
    startAzimuthDeg: 0,
    innerRadiusAt: () => 4,
    width: 0.9,
    riserTarget: 0.2,
    goingTarget: 0.3,
    winding: 'counterclockwise' as const,
  }

  it('counts the level run a flight begins with, and nothing past it', () => {
    const steps = planFlight({ ...base, endLandingLength: 0.9 })
    expect(entryLandingTreads(steps)).toBe(3)
    expect(steps[2].treadY).toBe(steps[0].treadY)
    expect(steps[3].treadY).toBeGreaterThan(steps[0].treadY)
  })

  it('is zero where the flight rises from its first tread', () => {
    expect(entryLandingTreads(planFlight(base))).toBe(0)
    expect(entryLandingTreads([])).toBe(0)
  })

  /**
   * A landing partway UP a flight is not the platform at its foot. The roof climb
   * has one; it must not be mistaken for an entry platform, or the bed under it
   * would be raised too and that is the edit this change deliberately does not
   * make at the top of the tower.
   */
  it('does not count a landing partway up the climb', () => {
    const steps = planFlight({ ...base, landingsAtY: [1.0], landingLength: 1.2 })
    expect(entryLandingTreads(steps)).toBe(0)
  })
})

describe('the passage floor at the foot of a flight', () => {
  const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
  const tubes = tubesFor(flights)

  /**
   * THE PROPERTY. From the end cap to the first riser, the floor of the cut is the
   * platform's own floor — never more than the foot tolerance below the tread
   * surface anyone standing there is walking on. A dip deeper than that is a slot
   * in the floor beside the doorway, and the stone on the far side of it reads as
   * a separate platform.
   *
   * On HEAD this fails at all six feet: the deepest point of the loft comes out
   * 0.147–0.155 m under the platform against a 0.02 m tolerance, and it lands
   * within a degree of the doorway's far jamb, which is why it is visible from the
   * chamber at all.
   */
  it('is one plane from the end cap across the whole platform', () => {
    flights.forEach((flight, i) => {
      const tube = tubes[i]
      const entry = entryLandingTreads(flight)
      expect(entry, `flight ${i} has an entry platform`).toBeGreaterThan(0)
      const landingY = flight[0].treadY
      const cap = tube[0].azimuthDeg
      /*
       * As far as the LAST PLATFORM TREAD and no further. Past it the bed has to
       * dive to clear the first riser's tread block, and it is right that it does;
       * what it may not do is dive inside the platform, where there is nothing to
       * clear and a walker standing on it.
       */
      const last = flight[entry - 1].azimuthDeg
      const lo = Math.min(cap, last)
      const hi = Math.max(cap, last)
      for (let k = 0; k <= 200; k += 1) {
        const az = lo + ((hi - lo) * k) / 200
        const bed = bedAt(tube, az)
        if (bed === null) continue
        expect(
          landingY - bed,
          `flight ${i} at azimuth ${az.toFixed(2)}: floor ${bed.toFixed(3)} under a platform at ${landingY.toFixed(3)}`,
        ).toBeLessThanOrEqual(PASSAGE_FOOT_TOLERANCE + 1e-9)
      }
    })
  })

  /**
   * And the fix may not buy that by lifting a cut out of the stone. inStone() drops
   * any section whose floor is at or above masonryTopY, and a dropped section at
   * the end of a tube takes the CAP with it — which is what every passage opening
   * is placed off. So every raised section must still be in the tube, and the two
   * caps must still stand where the lead alone puts them: that pair is the
   * guarantee that no slit moved.
   */
  it('drops no section and moves neither cap', () => {
    flights.forEach((flight, i) => {
      const tube = tubes[i]
      const entry = entryLandingTreads(flight)
      const bearings = tube.map((s) => s.azimuthDeg)
      for (let k = 0; k < entry; k += 1) {
        expect(
          bearings.some((b) => Math.abs(b - flight[k].azimuthDeg) < 1e-9),
          `flight ${i} platform tread ${k} still cut`,
        ).toBe(true)
      }
      const stepAngle = flight[1].azimuthDeg - flight[0].azimuthDeg
      const leadSteps = Math.round((flight[0].azimuthDeg - tube[0].azimuthDeg) / stepAngle)
      expect(leadSteps, `flight ${i} lead-in length`).toBe(5)
      expect(tube[0].azimuthDeg, `flight ${i} foot cap`).toBeCloseTo(
        flight[0].azimuthDeg - stepAngle * leadSteps,
        9,
      )
    })
  })

  /**
   * The roof climb is the reason the head is not treated the same way, so the
   * reason is asserted rather than only written down: its platform's deep bed is
   * the only thing keeping those sections inside the stone.
   */
  it('keeps the roof flight’s head platform inside the stone', () => {
    const roof = flights[flights.length - 1]
    const top = roof[roof.length - 1].treadY
    const deep = tubes[tubes.length - 1].filter((s) => Math.abs(s.topY - ROOF.masonryTopY) < 1e-9)
    expect(deep.length).toBeGreaterThan(0)
    // a landing bed there would stand above the stone and be dropped
    expect(top - PASSAGE_FOOT_TOLERANCE).toBeGreaterThan(ROOF.masonryTopY)
  })
})
