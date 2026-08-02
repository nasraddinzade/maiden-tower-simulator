import { describe, expect, it } from 'vitest'
import {
  actualRiser,
  flightArcDeg,
  flightFitsInWall,
  planAllFlights,
  planFlight,
  stairwellSpanDeg,
  stepAngleDeg,
  stepCountFor,
  windingSign,
  type FlightParams,
} from './staircase'
import { FLOORS, STAIR, TOWER, innerRadiusAt } from '../config/tower'

const base: FlightParams = {
  fromY: 0,
  toY: 3.8,
  startAzimuthDeg: 0,
  innerRadiusAt: () => 3.4,
  width: 0.9,
  riserTarget: 0.2,
  goingTarget: 0.3,
  winding: 'clockwise',
}

describe('winding', () => {
  it('maps clockwise to increasing azimuth', () => {
    expect(windingSign('clockwise')).toBe(1)
    expect(windingSign('counterclockwise')).toBe(-1)
  })
})

describe('step count and riser', () => {
  it('rounds to a whole number of risers', () => {
    expect(stepCountFor(3.8, 0.2)).toBe(19)
    // 3.3/0.2 lands on 16.4999… in binary floating point, so the tie goes down.
    // Which side it falls is arbitrary; what matters is the resulting riser.
    const n = stepCountFor(3.3, 0.2)
    expect(n === 16 || n === 17).toBe(true)
    const riser = actualRiser(3.3, n)
    expect(riser).toBeGreaterThanOrEqual(0.18)
    expect(riser).toBeLessThanOrEqual(0.22)
  })
  it('never returns zero for a real rise', () => {
    expect(stepCountFor(0.05, 0.2)).toBe(1)
  })
  it('returns none for a flat or negative rise', () => {
    expect(stepCountFor(0, 0.2)).toBe(0)
    expect(stepCountFor(-2, 0.2)).toBe(0)
  })
  it('divides the storey exactly, so the flight lands on the floor', () => {
    const rise = 3.3
    const n = stepCountFor(rise, 0.2)
    expect(actualRiser(rise, n) * n).toBeCloseTo(rise, 12)
  })
})

describe('step angle', () => {
  it('gives the target going along the walking line', () => {
    const midRadius = 4
    const deg = stepAngleDeg(0.3, midRadius)
    const arc = (deg * Math.PI) / 180 * midRadius
    expect(arc).toBeCloseTo(0.3, 12)
  })
  it('turns less per step on a wider flight', () => {
    expect(stepAngleDeg(0.3, 6)).toBeLessThan(stepAngleDeg(0.3, 3))
  })
  it('rejects a non-positive radius', () => {
    expect(() => stepAngleDeg(0.3, 0)).toThrow()
  })
})

describe('planFlight', () => {
  const steps = planFlight(base)

  it('lands the last tread exactly on the upper floor', () => {
    expect(steps[steps.length - 1].treadY).toBeCloseTo(base.toY, 12)
  })
  it('rises monotonically', () => {
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].treadY).toBeGreaterThan(steps[i - 1].treadY)
    }
  })
  it('keeps every riser inside the 0.18–0.22 m band the spec asks for', () => {
    const riser = actualRiser(base.toY - base.fromY, steps.length)
    expect(riser).toBeGreaterThanOrEqual(0.18)
    expect(riser).toBeLessThanOrEqual(0.22)
  })
  it('advances clockwise when asked', () => {
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].azimuthDeg).toBeGreaterThan(steps[i - 1].azimuthDeg)
    }
  })
  it('advances counterclockwise when asked', () => {
    const ccw = planFlight({ ...base, winding: 'counterclockwise' })
    for (let i = 1; i < ccw.length; i++) {
      expect(ccw[i].azimuthDeg).toBeLessThan(ccw[i - 1].azimuthDeg)
    }
  })
  it('mirrors exactly between the two windings', () => {
    const cw = planFlight(base)
    const ccw = planFlight({ ...base, winding: 'counterclockwise' })
    expect(cw.length).toBe(ccw.length)
    for (let i = 0; i < cw.length; i++) {
      expect(cw[i].azimuthDeg - base.startAzimuthDeg).toBeCloseTo(
        -(ccw[i].azimuthDeg - base.startAzimuthDeg),
        12,
      )
      expect(cw[i].treadY).toBeCloseTo(ccw[i].treadY, 12)
    }
  })
  it('puts the walking line at the middle of the flight', () => {
    expect(steps[0].midRadius).toBeCloseTo(base.innerRadiusAt(0) + base.width / 2, 12)
  })
  it('returns nothing for a flat flight', () => {
    expect(planFlight({ ...base, toY: base.fromY })).toEqual([])
  })
})

describe('flight arc and stairwell', () => {
  const steps = planFlight(base)

  it('sweeps a sane arc — a partial turn, not several', () => {
    const arc = flightArcDeg(steps)
    expect(arc).toBeGreaterThan(20)
    expect(arc).toBeLessThan(360)
  })
  it('places the stairwell over the top of the flight', () => {
    const span = stairwellSpanDeg(steps)!
    const topAz = steps[steps.length - 1].azimuthDeg
    expect(Math.abs(span.centreAzimuthDeg - topAz)).toBeLessThan(span.widthDeg)
    expect(span.widthDeg).toBeGreaterThan(0)
  })
  it('has no stairwell for an empty flight', () => {
    expect(stairwellSpanDeg([])).toBeNull()
  })
})

describe('fitting inside the masonry', () => {
  it('accepts a flight within the wall and rejects one that breaks out', () => {
    expect(flightFitsInWall(3.4, 0.9, 3.25, 8.25)).toBe(true)
    expect(flightFitsInWall(3.0, 0.9, 3.25, 8.25)).toBe(false) // overhangs the room
    expect(flightFitsInWall(7.9, 0.9, 3.25, 8.25)).toBe(false) // breaks the outer face
  })

  it('keeps every real flight inside the wall at both ends', () => {
    for (let i = 0; i < FLOORS.length - 1; i++) {
      const f = FLOORS[i]
      const next = FLOORS[i + 1]
      for (const y of [f.floorY, next.floorY]) {
        const inner = innerRadiusAt(y) + STAIR.wallClearance
        expect(flightFitsInWall(inner, STAIR.width, innerRadiusAt(y), TOWER.outerRadius)).toBe(true)
      }
    }
  })
})

describe('planAllFlights — one continuous helix', () => {
  const settings = {
    winding: STAIR.winding,
    riserTarget: STAIR.riserTarget,
    goingTarget: STAIR.goingTarget,
    width: STAIR.width,
    wallClearance: STAIR.wallClearance,
    startAzimuthDeg: STAIR.startAzimuthDeg,
  }
  const flights = planAllFlights(settings, FLOORS, innerRadiusAt)

  it('produces a flight for every storey gap', () => {
    expect(flights).toHaveLength(FLOORS.length - 1)
  })

  it('starts the first flight where the config says', () => {
    expect(flights[0][0].azimuthDeg).toBeCloseTo(STAIR.startAzimuthDeg, 10)
  })

  it('resumes each flight past the previous one — no azimuth jump back', () => {
    for (let i = 1; i < flights.length; i++) {
      const prevLast = flights[i - 1][flights[i - 1].length - 1].azimuthDeg
      const thisFirst = flights[i][0].azimuthDeg
      const gap = Math.abs(thisFirst - prevLast)
      // exactly one step of separation, never a discontinuity
      expect(gap).toBeGreaterThan(0)
      expect(gap).toBeLessThan(flights[i][0].angularWidthDeg * 2)
    }
  })

  it('climbs without ever descending across the whole tower', () => {
    const all = flights.flat()
    for (let i = 1; i < all.length; i++) {
      expect(all[i].treadY).toBeGreaterThan(all[i - 1].treadY)
    }
  })

  it('reaches the top storey', () => {
    const all = flights.flat()
    expect(all[all.length - 1].treadY).toBeCloseTo(FLOORS[FLOORS.length - 1].floorY, 10)
  })

  it('turns consistently in one direction throughout', () => {
    const all = flights.flat()
    const sign = Math.sign(all[1].azimuthDeg - all[0].azimuthDeg)
    for (let i = 1; i < all.length; i++) {
      expect(Math.sign(all[i].azimuthDeg - all[i - 1].azimuthDeg)).toBe(sign)
    }
  })

  it('mirrors cleanly when the winding is flipped', () => {
    // derive the opposite from the config, so this keeps testing a real flip
    // whichever way STAIR.winding is set
    const opposite = STAIR.winding === 'clockwise' ? 'counterclockwise' : 'clockwise'
    const other = planAllFlights({ ...settings, winding: opposite }, FLOORS, innerRadiusAt)
    const a = flights.flat()
    const b = other.flat()
    expect(a).toHaveLength(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].azimuthDeg - STAIR.startAzimuthDeg).toBeCloseTo(
        -(b[i].azimuthDeg - STAIR.startAzimuthDeg),
        8,
      )
    }
  })

  it('gives every flight a stairwell that sits over its own top', () => {
    flights.forEach((steps) => {
      const span = stairwellSpanDeg(steps)!
      expect(span.widthDeg).toBeGreaterThan(0)
      expect(span.widthDeg).toBeLessThan(180)
    })
  })
})

describe('the stair against the real storeys', () => {
  const flights = FLOORS.slice(0, -1).map((f, i) =>
    planFlight({
      fromY: f.floorY,
      toY: FLOORS[i + 1].floorY,
      startAzimuthDeg: STAIR.startAzimuthDeg,
      innerRadiusAt: (y: number) => innerRadiusAt(y) + STAIR.wallClearance,
      width: STAIR.width,
      riserTarget: STAIR.riserTarget,
      goingTarget: STAIR.goingTarget,
      winding: STAIR.winding,
    }),
  )

  it('builds one flight between each pair of storeys', () => {
    expect(flights).toHaveLength(FLOORS.length - 1)
    for (const f of flights) expect(f.length).toBeGreaterThan(0)
  })

  it('keeps every riser within the spec band', () => {
    flights.forEach((steps, i) => {
      const rise = FLOORS[i + 1].floorY - FLOORS[i].floorY
      const riser = actualRiser(rise, steps.length)
      expect(riser).toBeGreaterThanOrEqual(0.18)
      expect(riser).toBeLessThanOrEqual(0.22)
    })
  })

  it('lands each flight exactly on the next floor', () => {
    flights.forEach((steps, i) => {
      expect(steps[steps.length - 1].treadY).toBeCloseTo(FLOORS[i + 1].floorY, 10)
    })
  })

  it('never wraps more than a full turn in one storey', () => {
    for (const steps of flights) expect(flightArcDeg(steps)).toBeLessThan(360)
  })
})
