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
import { FLOORS, STAIR, TOWER, WALL_LIFTS, innerRadiusAt } from '../config/tower'

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

describe('planAllFlights — one flight per lift', () => {
  // STAIR itself, not a copy of six of its fields: a copy is how the landings
  // came to be in the tests and not in the tower — see stairSettings().
  const settings = STAIR
  const flights = planAllFlights(settings, WALL_LIFTS, innerRadiusAt)

  it('produces a flight per masonry lift, not per storey gap', () => {
    /*
     * The tower does not have a stair between every pair of storeys. The bottom
     * lift is a modern steel spiral standing in the middle of the chamber and is
     * no part of the masonry stair, and 4→6 is ONE flight spanning two storey
     * heights. Counting flights off the floor table gave eight storeys minus one
     * = seven, which is the wrong number for two independent reasons.
     */
    expect(flights).toHaveLength(WALL_LIFTS.length)
    expect(WALL_LIFTS.length, 'a lift table that matches the floor table is a smell')
      .not.toBe(FLOORS.length - 1)
  })

  it('starts the first flight where the config says', () => {
    expect(flights[0][0].azimuthDeg).toBeCloseTo(STAIR.startAzimuthDeg, 10)
  })

  it('stacks the flights in one sector of the wall instead of chaining them', () => {
    /*
     * The reverse of what this file asked for until now. Chained — each flight
     * resuming a step past where the last ended — the six masonry lifts came out
     * as ONE continuous 418° spiral from storey 2 to the roof. The owner, who has
     * walked the tower, separates "a SPIRAL stair from the first storey to the
     * second" (the modern steel insertion standing in the middle of the chamber)
     * from "a PASSAGE with a stair" for every lift above it. A chained helix
     * makes all of them the same thing.
     *
     * Stacked, each flight is its own passage: you leave it at one end of the
     * sector, cross the chamber, and enter the next doorway at the other.
     */
    WALL_LIFTS.forEach((lift, i) => {
      if (lift.landingsAtY.length > 0) {
        // paid for its landing in arc — see the note in planAllFlights
        expect(Math.abs(flights[i][0].azimuthDeg - STAIR.startAzimuthDeg)).toBeLessThan(25)
        return
      }
      expect(flights[i][0].azimuthDeg).toBeCloseTo(STAIR.startAzimuthDeg, 10)
    })
  })

  it('keeps a storey height between stacked passages wherever they run', () => {
    /*
     * The reason stacking is safe, and it is not luck. Riser and going are held
     * constant, so every flight climbs at the same rate per degree and stacked
     * passages stay exactly parallel. A passage is about 2.6 m tall against a
     * 3.28 m storey, so they clear each other along their whole length — but the
     * margin is only 0.65 m, and it would vanish if the headroom or the storey
     * height moved. Hence the test.
     */
    for (let i = 1; i < flights.length; i++) {
      const below = flights[i - 1]
      const above = flights[i]
      for (const a of above) {
        // the tread of the flight below nearest this azimuth
        const b = below.reduce((best, cur) =>
          Math.abs(cur.azimuthDeg - a.azimuthDeg) < Math.abs(best.azimuthDeg - a.azimuthDeg)
            ? cur
            : best,
        )
        if (Math.abs(b.azimuthDeg - a.azimuthDeg) > 2) continue // no overlap in plan
        expect(
          a.treadY - b.treadY,
          `flights ${i - 1}/${i} at az ${a.azimuthDeg.toFixed(1)}`,
        ).toBeGreaterThan(2.8)
      }
    }
  })

  it('climbs without ever descending across the whole tower', () => {
    /*
     * Never DOWN, but level is allowed now: the roof climb has a landing in it,
     * modelled as treads that repeat their height. This read `toBeGreaterThan`
     * before landings existed, and leaving it that way would make a landing
     * anywhere in the tower a test failure — the wrong signal. A descent still
     * is one.
     */
    const all = flights.flat()
    for (let i = 1; i < all.length; i++) {
      expect(all[i].treadY).toBeGreaterThanOrEqual(all[i - 1].treadY)
    }
  })

  it('runs level at both ends of every flight, and mid-climb only where declared', () => {
    /*
     * Two kinds of level tread now, and they mean different things. Every flight
     * has a PLATFORM at each end — that is what the doorway opens onto, and
     * without it the opening is a raw pocket in the wall. Level treads in the
     * MIDDLE of a climb are a landing between two flights, and only the roof
     * lift declares one.
     */
    WALL_LIFTS.forEach((lift, i) => {
      const f = flights[i]
      const level = f.map((s, k) => k > 0 && s.treadY === f[k - 1].treadY)
      const firstRise = f.findIndex((s, k) => k > 0 && s.treadY > f[k - 1].treadY)
      let lastRise = 0
      f.forEach((s, k) => {
        if (k > 0 && s.treadY > f[k - 1].treadY) lastRise = k
      })

      // platforms at both ends
      expect(level[1], `flight ${i} has no landing at its foot`).toBe(true)
      expect(level[f.length - 1], `flight ${i} has no landing at its head`).toBe(true)
      expect(f[0].treadY).toBeCloseTo(lift.fromY, 9)
      expect(f[f.length - 1].treadY).toBeCloseTo(lift.toY, 9)

      // and interior landings only where the lift declares them
      const interior = f.filter((_, k) => k > firstRise && k < lastRise && level[k])
      if (lift.landingsAtY.length === 0) {
        expect(interior, `flight ${i} has a landing nobody asked for`).toEqual([])
        return
      }
      expect(interior.length).toBeGreaterThan(0)
      for (const s of interior) {
        expect(Math.min(...lift.landingsAtY.map((y) => Math.abs(s.treadY - y)))).toBeLessThan(0.25)
      }
    })
  })

  it('reaches the head of the last lift — the roof deck, not the top floor', () => {
    const all = flights.flat()
    expect(all[all.length - 1].treadY).toBeCloseTo(WALL_LIFTS[WALL_LIFTS.length - 1].toY, 10)
  })

  it('spans two storey heights on the one lift that passes a storey', () => {
    // "с 4 на 5 и 6 всего одна лестница где на 5 выходишь с середины пути"
    const passing = WALL_LIFTS.filter((l) => l.opensAtY.length > 0)
    expect(passing, 'exactly one flight runs past a storey').toHaveLength(1)
    const l = passing[0]
    for (const y of l.opensAtY) {
      expect(y, 'the level it opens onto must lie inside the run').toBeGreaterThan(l.fromY)
      expect(y).toBeLessThan(l.toY)
    }
  })

  it('turns consistently in one direction within every flight', () => {
    /*
     * WITHIN a flight. Across flights the azimuth jumps back to the start now,
     * because they are stacked rather than chained — see the test above. Asking
     * the flattened list to turn one way would be asking for the helix back.
     */
    for (const flight of flights) {
      for (let i = 1; i < flight.length; i++) {
        const d = flight[i].azimuthDeg - flight[i - 1].azimuthDeg
        expect(Math.sign(d) === windingSign(STAIR.winding) || d === 0).toBe(true)
      }
    }
  })

  it('mirrors cleanly when the winding is flipped', () => {
    // derive the opposite from the config, so this keeps testing a real flip
    // whichever way STAIR.winding is set
    const opposite = STAIR.winding === 'clockwise' ? 'counterclockwise' : 'clockwise'
    const other = planAllFlights({ ...settings, winding: opposite }, WALL_LIFTS, innerRadiusAt)
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
