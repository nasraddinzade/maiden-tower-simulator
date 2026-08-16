import { describe, expect, it } from 'vitest'
import {
  PASSAGE_FOOT_TOLERANCE,
  TREAD_OVERLAP_FRACTION,
  entryLandingTreads,
  flightRiser,
  landingPaving,
  planAllFlights,
  planFlight,
  stairDoorways,
  stairPassageSections,
  treadDepth,
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

/**
 * THE FLOOR A WALKER SEES OVER A LANDING, WHICH IS NOT THE BED.
 *
 * The block above asserts the CUT, and it passes: since e96b76f the bed under a
 * foot landing is one plane. The owner reported the little platform beside the
 * way onto the stair twice anyway, and this is why. What is drawn over a landing
 * is the flight's own tread stone, and it stopped at the end tread — so the floor
 * was tread stone at storey level for the length of the platform and shell bed
 * 0.020 m lower for the 1.33 m beyond it, with the join standing inside the
 * doorway. Two stones at two levels seen through an opening; a little platform.
 *
 * These ask about the STONE THAT IS LAID, the way the block above asks about the
 * pocket it is laid in. A slab covers the arc its own wedge covers — the same
 * wedge stairTreadVertices() cuts, overlap included — and its top is its treadY.
 */
const paved = (flight: StepPlacement[], tube: PassageSection[]) => [
  ...flight,
  ...landingPaving(flight, tube),
]

/** The highest slab standing over an azimuth, or null where the stone runs out. */
function drawnFloorAt(slabs: StepPlacement[], azimuthDeg: number): number | null {
  let top: number | null = null
  for (const s of slabs) {
    const half = (s.angularWidthDeg / 2) * (1 + TREAD_OVERLAP_FRACTION)
    if (Math.abs(azimuthDeg - s.azimuthDeg) > half) continue
    if (top === null || s.treadY > top) top = s.treadY
  }
  return top
}

describe('the drawn floor of a landing', () => {
  const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
  const tubes = tubesFor(flights)

  /** Every flight end, with the stretch of tube that runs past its end tread. */
  const ends = flights.flatMap((flight, i) => {
    const climb = Math.sign(flight[1].azimuthDeg - flight[0].azimuthDeg)
    return (['foot', 'head'] as const).map((end) => {
      const tread = end === 'foot' ? flight[0] : flight[flight.length - 1]
      const side = end === 'foot' ? -climb : climb
      const past = (s: { azimuthDeg: number }) => (s.azimuthDeg - tread.azimuthDeg) * side > 1e-6
      return {
        id: `${end}-${i}`,
        flight,
        tube: tubes[i],
        tread,
        lead: tubes[i].filter(past),
        paving: landingPaving(flight, tubes[i]).filter(past),
      }
    })
  })

  /**
   * THE PROPERTY. From the passage's end cap to the end tread there is stone
   * underfoot at every bearing, and all of it is one level: the level of the
   * landing, which is the level of the storey the doorway opens onto.
   *
   * On HEAD it fails at ELEVEN of the twelve ends — every one that has a passage
   * past its end tread. At the foot of 2→3 the drawn floor simply stops at
   * azimuth 198.99 and the bed shows through 0.020 m lower for 18.15° of arc; at
   * the head of the same flight it stops at 110.08 with the bed lofting 0.166 m
   * below it. Cast down the built shell, r 4.20 and r 4.35, both are visible from
   * the chamber through the doorway they stand in.
   */
  it('is one plane from the end cap to the end tread', () => {
    let checked = 0
    for (const e of ends) {
      if (e.lead.length === 0) continue // the roof's head: no passage to floor
      checked += 1
      const slabs = paved(e.flight, e.tube)
      const cap = e.lead.reduce((far, s) =>
        Math.abs(s.azimuthDeg - e.tread.azimuthDeg) > Math.abs(far.azimuthDeg - e.tread.azimuthDeg)
          ? s
          : far,
      ).azimuthDeg
      const lo = Math.min(cap, e.tread.azimuthDeg)
      const hi = Math.max(cap, e.tread.azimuthDeg)
      for (let k = 0; k <= 200; k += 1) {
        const az = lo + ((hi - lo) * k) / 200
        const floor = drawnFloorAt(slabs, az)
        const bed = bedAt(e.tube, az)
        expect(
          floor,
          `${e.id} at azimuth ${az.toFixed(2)}: no stone laid; the bed shows at ${bed?.toFixed(4)}, ${(e.tread.treadY - (bed ?? 0)).toFixed(4)} m under the landing`,
        ).not.toBeNull()
        expect(
          floor as number,
          `${e.id} at azimuth ${az.toFixed(2)}: floor stands at ${floor?.toFixed(4)} against a landing at ${e.tread.treadY.toFixed(4)}`,
        ).toBeCloseTo(e.tread.treadY, 9)
      }
    }
    expect(checked, 'ends with a passage past the end tread').toBe(11)
  })

  /**
   * AND IT IS BEDDED, NOT LAID ON. Every slab over a landing runs down past the
   * floor of the cut beneath it, so what shows is its top and never its edge.
   *
   * This is the half of the repair that lets the head be fixed at all. e96b76f
   * could not RAISE the head's bed — the roof flight's platform sections would
   * have left the stone and taken the cap and its slit with them — so the head
   * kept a 0.33 m trench under its platform and a 0.166 m slot at the near edge
   * of it. Paving at a tread's depth buries that trench instead of filling it:
   * nothing about the cut changes, and the slot has stone over it.
   *
   * A guard, not a diagnosis: it cannot fail on the code this fixes, because
   * there was no paving there to float. It fails on the obvious cheaper repair —
   * laying the slabs at the bed's own level, or thinner than a tread — which is
   * what would put the edge back.
   */
  it('beds every slab of it below the floor of the cut', () => {
    for (const e of ends) {
      const depth = treadDepth(flightRiser(e.flight))
      for (const s of e.paving) {
        const half = (s.angularWidthDeg / 2) * (1 + TREAD_OVERLAP_FRACTION)
        for (let k = 0; k <= 20; k += 1) {
          const az = s.azimuthDeg - half + (2 * half * k) / 20
          const bed = bedAt(e.tube, az)
          if (bed === null) continue
          expect(
            s.treadY - depth,
            `${e.id} slab at ${s.azimuthDeg.toFixed(2)}: underside ${(s.treadY - depth).toFixed(4)} against a bed at ${bed.toFixed(4)}`,
          ).toBeLessThanOrEqual(bed + 1e-9)
        }
      }
    }
  })

  /**
   * IT MAY NOT REACH A DEGREE FURTHER THAN THE VOID IT LIES IN. Each slab stands
   * on a section the cutter made, so the paving cannot outrun the passage however
   * the lead's length is next re-argued — and at the roof, where inStone() drops
   * the whole lead-out because the head landing IS the deck, nothing is laid at
   * all. The alternative was a rule of its own for the terrace, and a strip of
   * stair stone across the open roof the first time the two disagreed.
   */
  it('lays a slab only where the cutter left a section', () => {
    let roofHead = 0
    for (const e of ends) {
      const bearings = e.tube.map((s) => s.azimuthDeg)
      expect(e.paving.length, `${e.id} paving`).toBe(e.lead.length)
      if (e.lead.length === 0) roofHead += 1
      for (const s of e.paving) {
        expect(
          bearings.some((b) => Math.abs(b - s.azimuthDeg) < 1e-9),
          `${e.id} slab at ${s.azimuthDeg.toFixed(3)} stands on a section`,
        ).toBe(true)
        expect(s.treadY, `${e.id} slab is level with its landing`).toBe(e.tread.treadY)
      }
    }
    expect(roofHead, 'ends the cutter left no passage at').toBe(1)
  })

  /**
   * WHAT THE OWNER IS LOOKING AT. Both his reports place the object beside the
   * way onto the stair, so the property is stated there too: across the whole
   * clear width of a doorway that opens onto a landing, the floor is one level
   * and it is the doorway's own sill. A doorway whose arc runs off the paving —
   * which is what moving one along its landing could do — fails this rather than
   * quietly reopening the thing he reported.
   *
   * On HEAD every one of the twelve fails: the sill is at storey level and the
   * floor beyond the platform is 0.020 m under it.
   */
  it('runs level under every doorway that opens onto one', () => {
    const doorways = stairDoorways(
      flights,
      STAIR.width,
      STAIR.doorwayHeight,
      innerRadiusAt,
      (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
      ROOF.masonryTopY,
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
    )
    let onLandings = 0
    for (const d of doorways) {
      // the end whose landing this opening stands on, if any; the one opening
      // partway up the 4→6 run stands on the flight itself and is not one
      const e = ends.find(
        (x) =>
          x.lead.length > 0 &&
          Math.abs(d.azimuthDeg - x.tread.azimuthDeg) <=
            Math.abs(
              x.lead.reduce((far, s) =>
                Math.abs(s.azimuthDeg - x.tread.azimuthDeg) >
                Math.abs(far.azimuthDeg - x.tread.azimuthDeg)
                  ? s
                  : far,
              ).azimuthDeg - x.tread.azimuthDeg,
            ) +
              d.widthDeg / 2 &&
          Math.abs(d.bottomY - x.tread.treadY) < 1e-9,
      )
      if (!e) continue
      onLandings += 1
      const slabs = paved(e.flight, e.tube)
      for (let k = 0; k <= 40; k += 1) {
        const az = d.azimuthDeg - d.widthDeg / 2 + (d.widthDeg * k) / 40
        const floor = drawnFloorAt(slabs, az)
        expect(
          floor,
          `${e.id} doorway at azimuth ${az.toFixed(2)}: nothing underfoot, bed at ${bedAt(e.tube, az)?.toFixed(4)}`,
        ).not.toBeNull()
        expect(
          floor as number,
          `${e.id} doorway at azimuth ${az.toFixed(2)}: floor ${floor?.toFixed(4)} against a sill at ${d.bottomY.toFixed(4)}`,
        ).toBeCloseTo(d.bottomY, 9)
      }
    }
    expect(onLandings, 'doorways standing on a landing').toBe(11)
  })
})
