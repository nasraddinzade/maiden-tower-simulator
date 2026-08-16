import { describe, expect, it } from 'vitest'
import {
  actualRiser,
  flightArcDeg,
  flightFitsInWall,
  planAllFlights,
  planFlight,
  stairwellCutTools,
  stairwellSpanDeg,
  stepAngleDeg,
  stepCountFor,
  stairDoorways,
  stairPassageSections,
  windingSign,
  type FlightParams,
} from './staircase'
import { FLOORS, STAIR, TOWER, WALL_LIFTS, innerRadiusAt, stairSettings } from '../config/tower'
import { PLAYER } from '../config/player'

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
  /** A slab 0.3 m thick whose top is the floor this flight lands on. */
  const soffit = base.toY - 0.3

  it('sweeps a sane arc — a partial turn, not several', () => {
    const arc = flightArcDeg(steps)
    expect(arc).toBeGreaterThan(20)
    expect(arc).toBeLessThan(360)
  })
  it('places the stairwell over the top of the flight', () => {
    const span = stairwellSpanDeg(steps, soffit, PLAYER.stairHeadroom)!
    const topAz = steps[steps.length - 1].azimuthDeg
    expect(Math.abs(span.centreAzimuthDeg - topAz)).toBeLessThan(span.widthDeg)
    expect(span.widthDeg).toBeGreaterThan(0)
  })
  it('has no stairwell for an empty flight', () => {
    expect(stairwellSpanDeg([], soffit, PLAYER.stairHeadroom)).toBeNull()
  })
  it('has none at all where the structure above is out of reach', () => {
    // a slab three storeys up is nothing this flight has to be let through
    expect(stairwellSpanDeg(steps, base.toY + 10, PLAYER.stairHeadroom)).toBeNull()
  })

  /**
   * THE PROPERTY, stated once and then held against the real tower below.
   *
   * The opening exists so that a walker climbing to the head of the flight is
   * never under closed structure with less than the stair's clear height over
   * their tread. Every tread that fails that test must be inside the arc; the
   * ones that pass need not be.
   */
  it('opens over every tread the structure above would come down on', () => {
    const span = stairwellSpanDeg(steps, soffit, PLAYER.stairHeadroom)!
    for (const s of steps) {
      if (s.treadY + PLAYER.stairHeadroom <= soffit) continue
      expect(
        Math.abs(s.azimuthDeg - span.centreAzimuthDeg),
        `tread at ${s.treadY.toFixed(3)} (az ${s.azimuthDeg.toFixed(2)})`,
      ).toBeLessThanOrEqual(span.widthDeg / 2)
    }
  })

  /**
   * AND IT SURVIVES A FLIGHT WHOSE FIRST TREADS DO NOT RISE, which is every
   * flight in this tower — planFlight lays a level platform at each end (see
   * FlightParams.endLandingLength) — and a flight with a LANDING in the middle,
   * which the roof climb has.
   *
   * This is the case that broke the rule it replaced. That one asked for the
   * last N steps, with N derived from a riser read as steps[1] − steps[0]; on a
   * flight beginning with a platform that difference is exactly zero, N fell to
   * a hard-coded four, and the opening came out a quarter of the size the
   * geometry wanted. Even given the true riser it was still wrong here, because
   * five treads of a mid-flight landing spend arc and gain no height at all, so
   * N steps back from the top is not N risers below it.
   *
   * Measured in metres none of that arises: the two flights below differ by a
   * landing worth 1.5 m of arc and the opening tracks it without being told.
   */
  it('is measured in metres of headroom, not in steps', () => {
    const level = planFlight({ ...base, endLandingLength: 1.2, landingsAtY: [2.0] })
    expect(level[0].treadY).toBe(level[1].treadY) // the platform the old rule read
    const span = stairwellSpanDeg(level, soffit, PLAYER.stairHeadroom)!
    const needed = level.filter((s) => s.treadY + PLAYER.stairHeadroom > soffit)
    // every tread short of headroom is inside, landing treads included
    for (const s of needed) {
      expect(Math.abs(s.azimuthDeg - span.centreAzimuthDeg)).toBeLessThanOrEqual(span.widthDeg / 2)
    }
    // and the arc is the one the heights ask for, not four treads' worth
    expect(span.widthDeg).toBeGreaterThan(4 * level[0].angularWidthDeg * 2)
  })
})

describe('the stairwell cutter follows the arc', () => {
  /*
   * A stairwell is an annular sector and the tool that cuts it is a box. Over a
   * narrow arc one box is a fair sector; over a wide one it is not a sector at
   * all, because its inner face is a PLANE and the arc's ends stand further from
   * the axis than its middle. These assert the divided cutter puts stone back
   * where the single box would have taken it.
   */
  const inner = 4.767
  const outer = 5.767
  const centre = 158.15
  const width = 69.97
  /** Is (az, r) inside any of the tools? */
  const cut = (tools: ReturnType<typeof stairwellCutTools>, azDeg: number, r: number) => {
    const a = (azDeg * Math.PI) / 180
    const px = Math.sin(a) * r
    const pz = -Math.cos(a) * r
    return tools.some((t) => {
      const ta = (t.azimuthDeg * Math.PI) / 180
      const cx = Math.sin(ta) * t.midRadius
      const cz = -Math.cos(ta) * t.midRadius
      const lx = (px - cx) * Math.sin(ta) + (pz - cz) * -Math.cos(ta)
      const lz = (px - cx) * Math.cos(ta) + (pz - cz) * Math.sin(ta)
      return Math.abs(lx) <= t.radialDepth / 2 && Math.abs(lz) <= t.tangentialWidth / 2
    })
  }

  it('removes the whole sector and nothing a hand-width outside it', () => {
    const tools = stairwellCutTools(centre, width, inner, outer, 360 / 96)
    for (let r = inner + 0.01; r < outer; r += 0.05) {
      for (let az = centre - width / 2 + 0.05; az < centre + width / 2; az += 0.25) {
        expect(cut(tools, az, r), `inside the sector at az ${az.toFixed(1)} r ${r.toFixed(2)}`).toBe(
          true,
        )
      }
    }
    // and it strays no further out than the lathe's own faceting
    for (let r = inner - 0.5; r < outer + 0.5; r += 0.01) {
      for (let az = centre - width / 2 - 15; az < centre + width / 2 + 15; az += 0.25) {
        if (!cut(tools, az, r)) continue
        expect(r).toBeGreaterThan(inner - 0.02)
        expect(r).toBeLessThan(outer + 0.02)
      }
    }
  })

  it('needs to be divided at all — one box over this arc misses the stair entirely', () => {
    /*
     * The reading that forced this. A single box's inner face at the ends of a
     * 70° arc stands at inner / cos 35° = 5.82 m, which is OUTSIDE the opening's
     * outer radius: the tool cuts a hole in the paving near the parapet and
     * leaves the stair roofed over. Asserted so nobody folds the chain back into
     * one box on the grounds that it used to be one.
     */
    const one = stairwellCutTools(centre, width, inner, outer, 360)
    expect(one).toHaveLength(1)
    expect(cut(one, centre - width / 2 + 1, (inner + outer) / 2)).toBe(false)
    expect(inner / Math.cos((width / 2) * (Math.PI / 180))).toBeGreaterThan(outer)
  })

  it('divides more finely the finer the surface it cuts', () => {
    expect(stairwellCutTools(centre, width, inner, outer, 360 / 96).length).toBeGreaterThan(
      stairwellCutTools(centre, width, inner, outer, 360 / 24).length,
    )
    expect(stairwellCutTools(centre, 0, inner, outer, 3.75)).toEqual([])
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
    flights.forEach((steps, i) => {
      const soffit = WALL_LIFTS[i].toY - TOWER.floorSlab
      const span = stairwellSpanDeg(steps, soffit, PLAYER.stairHeadroom)!
      expect(span.widthDeg).toBeGreaterThan(0)
      expect(span.widthDeg).toBeLessThan(180)
    })
  })

  /**
   * EVERY FLIGHT IN THE SHIPPED TOWER, against the structure it actually lands
   * on. This is the assertion the owner's roof failed on 2026-08-15: the roof
   * climb had fifteen treads with less than the stair's clear height under the
   * terrace paving and the opening covered four of them, so the climb met the
   * underside of the deck at azimuth 183 — 2.05 m below the terrace — and stopped
   * there. Held for all six flights so the same arithmetic cannot come back at a
   * storey either.
   */
  it('lets every flight out of the structure it lands on', () => {
    flights.forEach((steps, i) => {
      const soffit = WALL_LIFTS[i].toY - TOWER.floorSlab
      const span = stairwellSpanDeg(steps, soffit, PLAYER.stairHeadroom)!
      for (const s of steps) {
        if (s.treadY + PLAYER.stairHeadroom <= soffit) continue
        expect(
          Math.abs(s.azimuthDeg - span.centreAzimuthDeg),
          `flight ${i}, tread at ${s.treadY.toFixed(3)}`,
        ).toBeLessThanOrEqual(span.widthDeg / 2)
      }
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

describe('the passage floor at a threshold', () => {
  /*
   * A trench at every doorway, and nothing in the suite saw it.
   *
   * The passage is cut a riser and a half below each tread so the lofted floor
   * meets the tread's underside. Past the last tread there is no tread — the
   * flight is drawn from its own steps — so the same depth applied to the lead
   * sections left the floor 0.33 m below the storey it opens onto, over the
   * whole width of the doorway. Walked and photographed at the foot of flight 1:
   * floor at 6.73 against a storey at 7.06, a black slot beside the opening.
   *
   * The property, not the number: where a passage meets a landing, you do not
   * step down into it.
   */
  const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
  const tubes = stairPassageSections(
    flights,
    STAIR.width,
    2.1,
    innerRadiusAt,
    TOWER.topY,
    undefined,
    STAIR.doorwayWidth,
  )

  it('is level with the landing at both ends of every flight', () => {
    tubes.forEach((tube, i) => {
      const flight = flights[i]
      const footY = flight[0].treadY
      const headY = flight[flight.length - 1].treadY
      /*
       * Lead sections are found by POSITION in the tube, not by azimuth. A
       * flight can cross north — flight 0 runs from 100° to 15.6° — so ordering
       * its ends by angle picks the wrong landing and the test then measures a
       * storey height instead of a threshold.
       */
      const lead = (tube.length - flight.length) / 2
      if (lead <= 0) return
      for (let k = 0; k < lead; k += 1) {
        expect(footY - tube[k].bottomY).toBeLessThanOrEqual(0.05)
        expect(headY - tube[tube.length - 1 - k].bottomY).toBeLessThanOrEqual(0.05)
      }
    })
  })
})

/*
 * NO CUTTER MAY REMOVE STONE THE BUILDING HAS NOT GOT.
 *
 * Fault of 2026-08-10. The vault is laid `tread + headroom` over every step, and
 * for five flights out of six that is a rule about a tunnel inside a wall. For
 * the roof climb it is not: the last tread is the deck at 26.749, the masonry
 * stops at 27.500, and the rule asked for a crown at 29.049 — 1.55 m of barrel
 * vault standing in the open air above the tower.
 *
 * NOTHING WAS DRAWN THERE, which is why it went unseen for so long: the shell
 * has no stone above 27.500 for the tool to subtract, so the surplus removed
 * nothing and moved no vertex. What it did was tell everything downstream that
 * the passage was roofed up there. passageEndAnchors() published that crown as
 * the head of an opening, fitReveal() sized a 2.0 m reveal against it, and
 * validatePassageOpening() passed it — an opening whose own centre stands 0.499 m
 * above the top of the building.
 *
 * THE SURPLUS WAS ALSO LOAD-BEARING, which is the part that had to be found by
 * looking. Clamped and nothing else, the pointed vault's crown lands exactly on
 * the roof plane and the boolean is handed a tangency; the built shell then
 * carried a curved lid of parapet stone over the open stair. So the clamp travels
 * with `openToSky`, and the two together are what render identically to the state
 * before either — which is the only proof this pair can offer, and it is a
 * photograph, not an assertion.
 *
 * None of this says whether the roof itself is right. See ROOF_QUESTION in
 * config/tower.ts for what is still unknown.
 */
describe('the stair cutters stop where the masonry stops', () => {
  const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)

  it('never vaults a passage above the top of the tower', () => {
    const tubes = stairPassageSections(
      flights,
      STAIR.width,
      PLAYER.stairHeadroom,
      innerRadiusAt,
      TOWER.topY,
      undefined,
      STAIR.doorwayWidth,
    )
    for (const [i, tube] of tubes.entries()) {
      for (const s of tube) {
        expect(s.topY, `flight ${i} at az ${s.azimuthDeg.toFixed(2)}`).toBeLessThanOrEqual(
          TOWER.topY + 1e-9,
        )
        // and a clamped section is still a section, not an inside-out one
        expect(s.topY).toBeGreaterThan(s.bottomY)
      }
    }
  })

  it('never arches a doorway above the top of the tower', () => {
    const doors = stairDoorways(
      flights,
      STAIR.width,
      STAIR.doorwayHeight,
      innerRadiusAt,
      (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
      TOWER.topY,
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
    )
    for (const d of doors) {
      expect(d.topY, `doorway at az ${d.azimuthDeg.toFixed(2)}`).toBeLessThanOrEqual(
        TOWER.topY + 1e-9,
      )
      expect(d.topY).toBeGreaterThan(d.bottomY)
    }
  })

  it('flags exactly the stretch that has no stone over it, and no other', () => {
    /*
     * The flag is what stops sectionProfile() springing a vault off nothing, so
     * it has to be right at both edges: every section whose asked-for crown clears
     * the top of the tower, and not one that does not.
     *
     * Only the roof climb has any. That is a fact about this stack — a deck at
     * 26.749 under a top at 27.500 — and if it ever spreads to another flight,
     * something in the storey heights has moved and this test is the place it
     * should be noticed.
     */
    const tubes = stairPassageSections(
      flights,
      STAIR.width,
      PLAYER.stairHeadroom,
      innerRadiusAt,
      TOWER.topY,
      undefined,
      STAIR.doorwayWidth,
    )
    tubes.forEach((tube, i) => {
      for (const s of tube) {
        const wantsMoreThanThereIs = s.topY >= TOWER.topY - 1e-9
        expect(!!s.openToSky, `flight ${i} at az ${s.azimuthDeg.toFixed(2)}`).toBe(
          wantsMoreThanThereIs,
        )
      }
    })
    // five flights untouched, the sixth flagged over its last stretch only
    const flagged = tubes.map((t) => t.filter((s) => s.openToSky).length)
    expect(flagged.slice(0, -1)).toEqual([0, 0, 0, 0, 0])
    expect(flagged[flagged.length - 1]).toBeGreaterThan(0)
    expect(flagged[flagged.length - 1]).toBeLessThan(tubes[tubes.length - 1].length)
  })

  it('leaves the other five flights exactly as they were, clamp or no clamp', () => {
    /*
     * The clamp must be inert everywhere the building is taller than the vault,
     * or it is not a clamp but a change of headroom. Only the roof climb differs,
     * and it differs by 1.549 m — the whole of the surplus.
     */
    const unclamped = stairPassageSections(
      flights,
      STAIR.width,
      PLAYER.stairHeadroom,
      innerRadiusAt,
      Infinity,
      undefined,
      STAIR.doorwayWidth,
    )
    const clamped = stairPassageSections(
      flights,
      STAIR.width,
      PLAYER.stairHeadroom,
      innerRadiusAt,
      TOWER.topY,
      undefined,
      STAIR.doorwayWidth,
    )
    const surplus = unclamped.map((t, i) =>
      Math.max(...t.map((s, k) => s.topY - clamped[i][k].topY)),
    )
    expect(surplus.slice(0, -1)).toEqual([0, 0, 0, 0, 0])
    expect(surplus[surplus.length - 1]).toBeCloseTo(1.549, 3)
  })
})
