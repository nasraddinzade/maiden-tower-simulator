/**
 * WHAT AN OPENING IS WORTH WHEN ITS DATUM IS SOFTER THAN THE CLEARANCE IT STANDS
 * ON — the properties behind the ruling of 2026-08-15.
 *
 * The case is head-6-7. Its landing centre comes out at azimuth 113.6292 and the
 * pier's traced daylight edge at 113.5000, so the model cuts a window on 0.1292°
 * — 18.6 mm across the face of the drum — and the [OSM] tracing that supplied the
 * 113.5000 states its own scatter as ±0.03 m, which is ±0.208° or ±30 mm at this
 * radius. The clearance is 0.62 of the noise.
 *
 * These tests do not assert that the window is there and do not assert that it is
 * not. They assert that the model KNOWS it cannot tell, that it says so where the
 * saying costs something, and that the numbers it says it with are the arithmetic
 * of the trace rather than a tolerance sized to produce a comfortable answer. The
 * decision itself — cut it, and stop calling it a fact — is argued at
 * passageOpenings.ts → pierEdgeReading().
 *
 * NOTHING IN HERE IS ALLOWED TO MOVE THE QUARTER-TURN FINDING. `reachesDaylight`,
 * `blindBecause`, `buttressDepth` and `built` mean exactly what they meant — a
 * radial ray at the landing's centre bearing — and the last describe block is the
 * guard on that: those four are pinned end for end, so a later improvement to the
 * daylight check cannot quietly restate config/tower.ts → STAIR_FROM_BUTTRESS_DEG
 * or the eleven tests in stairBearing.test.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  BUTTRESS,
  ENTRANCE,
  PASSAGE_OPENING,
  STAIR,
  TOWER,
  WALL_LIFTS,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import { planAllFlights, stairPassageSections } from './staircase'
import {
  buttressDepthAt,
  datumWarnings,
  openingsInsideDatumError,
  passageEndAnchors,
  pierBlockedWidth,
  pierClearanceDeg,
  pierEdgesDeg,
  planPassageOpenings,
  rotationToDaylightDeg,
  testimonyConflicts,
  type ButtressPlan,
  type OpeningFitting,
} from './passageOpenings'
import windowData from '../data/windows.json'

const FITTINGS = windowData.passageOpenings as unknown as OpeningFitting[]
const BEAK_TOP_Y = Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY)
const R = TOWER.outerRadius
const DEG = Math.PI / 180

/** The whole layout, for a given beak. The one knob these tests turn. */
function layout(buttress: ButtressPlan = BUTTRESS) {
  const settings = stairSettings()
  const flights = planAllFlights(settings, WALL_LIFTS, innerRadiusAt)
  const tubes = stairPassageSections(
    flights,
    settings.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
    TOWER.topY,
    undefined,
    STAIR.doorwayWidth,
  )
  return planPassageOpenings({
    anchors: passageEndAnchors(flights, tubes, (i, end) =>
      end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
    ),
    fittings: FITTINGS,
    liftLabel: (i) => ({
      from: WALL_LIFTS[i].fromFloorNumber,
      to: WALL_LIFTS[i].toFloorNumber,
    }),
    cfg: PASSAGE_OPENING,
    buttress,
    outerRadius: R,
    buttressTopY: BEAK_TOP_Y,
    towerTopY: TOWER.topY,
  })
}

const BASE = layout()
const HEAD_6_7 = BASE.find((o) => o.id === 'head-6-7')!
const HEAD_7_8 = BASE.find((o) => o.id === 'head-7-8')!

describe('the traced edge carries the tolerance the tracing states about itself', () => {
  it('is the [OSM] node scatter as an angle, and nothing chosen', () => {
    /*
     * 0.03 m is the figure the footprint fit has published in config/tower.ts
     * since it was made — "14 drum nodes agree to ±0.03 m". At r 8.25 that is
     * 0.2083°. If this ever stops being a restatement of the scatter, somebody
     * has picked a tolerance to make a doubt come out a convenient size, which
     * is the same fault as inventing a dimension.
     */
    expect(BUTTRESS.traceScatter).toBe(0.03)
    expect(BUTTRESS.edgeToleranceDeg).toBeCloseTo((0.03 / R) / DEG, 12)
    expect(BUTTRESS.edgeToleranceDeg).toBeCloseTo(0.2083, 4)
    // and it travels with the beak, so a doctored plan cannot arrive without one
    for (const o of BASE) expect(o.pier.toleranceDeg, o.id).toBe(BUTTRESS.edgeToleranceDeg)
  })

  it('puts the two edges where the ray cast at the extruded outline finds them', () => {
    /*
     * pierEdgesDeg is arithmetic on the plan; buttressDepthAt is a ray fired at
     * the same outline the shell is built from. They have to agree about where
     * the pier stops, or the tolerance is being compared against a boundary the
     * model does not actually cut to.
     */
    const e = pierEdgesDeg(BUTTRESS)
    expect(e.counterclockwise).toBeCloseTo(72.7, 6)
    expect(e.clockwise).toBeCloseTo(113.5, 6)
    for (const edge of [e.counterclockwise, e.clockwise]) {
      const inward = edge === e.clockwise ? -0.02 : 0.02
      expect(buttressDepthAt(edge + inward, BUTTRESS, R)).toBeGreaterThan(0)
      expect(buttressDepthAt(edge - inward, BUTTRESS, R)).toBe(0)
    }
  })

  it('measures the same gap the bisecting search does, in closed form and with a sign', () => {
    // the two blind heads: 8.0084 and 11.0872 — the numbers stairBearing.test.ts
    // pins as 8.01 and 11.09. A closed form agreeing with a search to six figures
    // is what says the clearance is measuring the pier and not an idea of it.
    for (const id of ['head-2-3', 'head-3-4']) {
      const o = BASE.find((x) => x.id === id)!
      const rot = rotationToDaylightDeg(o.azimuthDeg, BUTTRESS, R)
      expect(o.pier.centreDeg, id).toBeLessThan(0)
      expect(-o.pier.centreDeg, id).toBeCloseTo(rot.clockwise, 4)
    }
    // and where the search has nothing to do, the clearance is positive
    for (const o of BASE.filter((x) => x.buttressDepth === 0 && !x.pier.aboveBeakHead)) {
      expect(o.pier.centreDeg, o.id).toBeGreaterThan(0)
    }
  })
})

describe('the opening whose existence the trace cannot settle', () => {
  it('is head-6-7, cut on 18.6 mm against a scatter of 30 mm, and it is the only one', () => {
    expect(HEAD_6_7.pier.centreDeg).toBeCloseTo(0.1292, 4)
    expect(HEAD_6_7.pier.centreOffset * 1000).toBeCloseTo(18.6, 1)
    expect(HEAD_6_7.pier.toleranceOffset * 1000).toBeCloseTo(30, 6)
    expect(HEAD_6_7.pier.centreOffset).toBeLessThan(HEAD_6_7.pier.toleranceOffset)
    expect(HEAD_6_7.pier.insideDatumError).toBe(true)
    expect(openingsInsideDatumError(BASE).map((o) => o.id)).toEqual(['head-6-7'])
    // 18.6, not the 14 mm this repository quoted in four places
    expect(HEAD_6_7.pier.centreOffset * 1000).toBeGreaterThan(15)
  })

  it('is CUT — the record is empty here and a rule may not fill it in', () => {
    /*
     * The ruling. `open` is null for this end: nobody has been asked, and
     * passageOpenings.ts is explicit that null "is not a shorthand for no".
     * Withholding the opening would be a geometric rule answering a question the
     * record leaves blank, which is the move that came out of this file on
     * 2026-08-10. So it is built, and the doubt is published instead.
     */
    expect(HEAD_6_7.open).toBeNull()
    expect(HEAD_6_7.built).toBe(true)
    expect(HEAD_6_7.decidedBy).toBe('placeholder')
  })

  it('is not presented as a fact — the model reports it on every load', () => {
    const line = datumWarnings(BASE).find((l) => l.startsWith('head-6-7:'))
    expect(line, 'the model must name the end it cut on unresolvable evidence').toBeTruthy()
    // both quantities, in millimetres: degrees at the fourth decimal read as
    // precision, and 19 against 30 is the comparison this line exists to make
    expect(line).toMatch(/19 mm/)
    expect(line).toMatch(/±30 mm/)
    expect(line).toMatch(/does not decide/)
  })

  it('is reported on its own channel, because no testimony can retire it', () => {
    /*
     * testimonyConflicts() must keep falling silent when the record is complete —
     * that invariant is what makes it worth reading, and it has a test of its own
     * in passageOpenings.test.ts. This warning cannot be retired by any answer the
     * owner could give: he is not the person who can say where the pier's root
     * meets the drum to a fifth of a degree. Different question, different report.
     */
    expect(testimonyConflicts(BASE).some((l) => l.startsWith('head-6-7:'))).toBe(false)
    expect(datumWarnings(BASE)).toHaveLength(1)
    // and it survives a record in which every end has been ruled on
    const ruled = layout()
    expect(datumWarnings(ruled.map((o) => ({ ...o, open: true, decidedBy: 'record' as const }))))
      .toHaveLength(1)
  })

  it('flips outright when the traced edge moves by the tracing’s own scatter', () => {
    /*
     * THE PROPERTY THAT MAKES ALL OF THE ABOVE NECESSARY, and the sharpest way to
     * state it: perturb the root arc by ±1 tolerance and the window appears and
     * disappears. Nothing about the tower has changed in either case — only the
     * last digit of a hand-traced satellite outline.
     *
     * The perturbation goes into rootArcDeg because the edge is
     * azimuthDeg − skewDeg + rootArcDeg/2: turning azimuthDeg would carry the
     * stair round with it (STAIR.startAzimuthDeg is defined off it) and move
     * nothing relative to the pier, which is the arithmetic stairBearing.test.ts
     * exists to pin.
     */
    const tol = BUTTRESS.edgeToleranceDeg
    const withEdgeMoved = (byDeg: number): ButtressPlan => ({
      ...BUTTRESS,
      rootArcDeg: BUTTRESS.rootArcDeg + 2 * byDeg,
    })

    const wider = layout(withEdgeMoved(+tol)).find((o) => o.id === 'head-6-7')!
    expect(wider.pier.centreDeg).toBeLessThan(0)
    expect(wider.buttressDepth).toBeGreaterThan(0)
    expect(wider.built).toBe(false)

    const narrower = layout(withEdgeMoved(-tol)).find((o) => o.id === 'head-6-7')!
    expect(narrower.built).toBe(true)
    expect(narrower.pier.insideDatumError).toBe(false)

    // and no other end in the tower cares either way: it is one window that
    // hangs on the noise, not a layout that does
    for (const id of ['foot-6-7', 'head-7-8', 'head-2-3', 'head-3-4', 'foot-8-9']) {
      const a = layout(withEdgeMoved(+tol)).find((o) => o.id === id)!
      const b = layout(withEdgeMoved(-tol)).find((o) => o.id === id)!
      expect(a.built, id).toBe(b.built)
    }
  })
})

describe('the doubt is carried, not spent — the shape of the ruling itself', () => {
  it('turns the tolerance up and down and cuts the same tower either way', () => {
    /*
     * THE PROPERTY THAT SEPARATES THE THREE ANSWERS, and the reason it is worth a
     * test of its own: "carry it as explicitly uncertain" is only a distinct
     * choice from "drop it" if the tolerance can never reach the geometry. So run
     * the layout with no tolerance at all and with an absurd 180° of it — the two
     * ends of every possible ruling — and require that the same ends are cut, at
     * the same bearings, with the same depths of pier in front of them.
     *
     * What DOES move is the reporting, and it must: at 0 nothing is flagged and
     * the model claims to know; at 180 every end below the beak's head is flagged
     * and it claims to know nothing. Between those two the geometry is inert.
     *
     * Get this wrong and the flag becomes a second daylight check with a
     * tolerance for a threshold, which is the "drop it" answer arriving by the
     * back door — and it would restate config/tower.ts → STAIR_FROM_BUTTRESS_DEG
     * without saying so, since head-2-3 and head-3-4 are withheld on exactly the
     * quantity this tolerance qualifies.
     */
    const certain = layout({ ...BUTTRESS, edgeToleranceDeg: 0 })
    const hopeless = layout({ ...BUTTRESS, edgeToleranceDeg: 180 })

    for (let i = 0; i < BASE.length; i += 1) {
      const id = BASE[i].id
      expect(certain[i].id, id).toBe(id)
      expect(certain[i].built, id).toBe(BASE[i].built)
      expect(hopeless[i].built, id).toBe(BASE[i].built)
      expect(hopeless[i].azimuthDeg, id).toBeCloseTo(BASE[i].azimuthDeg, 12)
      expect(hopeless[i].buttressDepth, id).toBeCloseTo(BASE[i].buttressDepth, 12)
      expect(hopeless[i].reachesDaylight, id).toBe(BASE[i].reachesDaylight)
    }

    expect(openingsInsideDatumError(certain)).toHaveLength(0)
    expect(datumWarnings(certain)).toHaveLength(0)
    expect(openingsInsideDatumError(hopeless).map((o) => o.id)).toEqual(
      BASE.filter((o) => !o.pier.aboveBeakHead).map((o) => o.id),
    )
  })

  it('says it in both channels or in neither — nothing is flagged in silence', () => {
    /*
     * The task the ruling set itself was to make the doubt cost something to
     * ignore, and it does that in two places: datumWarnings() into the console
     * for whoever edits the model, and openingsInsideDatumError() out to
     * DatumCaveat for whoever is standing in the passage. A flag that reached
     * only one of them would be the "buried" state this change exists to leave.
     *
     * Stated over the whole set and over a perturbed beak rather than over
     * head-6-7, because the next turn of the stair will pick a different end and
     * the guarantee has to survive it. The renderer is not tested (rule 6) — this
     * pins the LIST the viewer's panel is fed, which is the part that is
     * arithmetic.
     */
    for (const b of [BUTTRESS, { ...BUTTRESS, rootArcDeg: BUTTRESS.rootArcDeg + 5.4 }]) {
      const all = layout(b)
      const flagged = all.filter((o) => o.pier.insideDatumError).map((o) => o.id)
      expect(openingsInsideDatumError(all).map((o) => o.id)).toEqual(flagged)
      expect(datumWarnings(all)).toHaveLength(flagged.length)
      for (const id of flagged) {
        expect(datumWarnings(all).some((l) => l.startsWith(`${id}:`)), id).toBe(true)
      }
    }
  })

  it('quotes the clearance in millimetres it actually has, not one written down', () => {
    /*
     * WHERE THE 14 mm CAME FROM, pinned so it cannot come back. It was the arc of
     * the ROUNDED 0.1°, not of the 0.1292° the model computes — 0.1 × π/180 × 8.25
     * = 14.4 mm — and it stood in four files for a day because a metre figure
     * typed into a comment is not checked by anything.
     *
     * Every millimetre this change publishes is derived instead: the offset is
     * the arc of the clearance at the drum's own radius, and the tolerance offset
     * is the node scatter itself, unrounded and unchosen.
     */
    for (const o of BASE) {
      expect(o.pier.centreOffset, o.id).toBeCloseTo(o.pier.centreDeg * DEG * R, 12)
      expect(o.pier.toleranceOffset, o.id).toBeCloseTo(BUTTRESS.traceScatter, 12)
    }
    // the slip itself: the rounded degree gives 14 mm, the real one gives 18.6
    expect(0.1 * DEG * R * 1000).toBeCloseTo(14.4, 1)
    expect(HEAD_6_7.pier.centreOffset * 1000).toBeCloseTo(18.6, 1)
  })
})

describe('the mouth, which is not the bearing the check tests', () => {
  it('has 45% of head-6-7 standing over pier root, and all of head-7-8 clear', () => {
    /*
     * The sharper reading, kept and published and NOT acted on. A 0.400 m mouth
     * centred at 113.6292 spans 112.240→115.018, so 0.181 m of it lies inside a
     * root arc that ends at 113.500. It is not a reason to delete the opening —
     * where a slit sits along its landing is planPassageOpenings' own centring
     * rule on a landing 20.4° long, so 1.3° of slide clears the mouth entirely.
     * It measures the rule, not the tower, and pierEdgeReading() says so.
     */
    expect(HEAD_6_7.pier.mouthDeg).toBeCloseTo(-1.2598, 3)
    expect(HEAD_6_7.pier.blockedWidth).toBeCloseTo(0.1814, 4)
    expect(HEAD_6_7.pier.blockedWidth / HEAD_6_7.pier.mouthWidth).toBeCloseTo(0.453, 3)
    // the far jamb of that mouth faces metres of solid pier, not a graze
    expect(buttressDepthAt(HEAD_6_7.azimuthDeg - 1.389, BUTTRESS, R)).toBeGreaterThan(4)

    expect(HEAD_7_8.pier.mouthDeg).toBeGreaterThan(1)
    expect(HEAD_7_8.pier.blockedWidth).toBe(0)
  })

  it('reports a whole mouth blocked where the check finds the pier dead ahead', () => {
    for (const id of ['head-2-3', 'head-3-4']) {
      const o = BASE.find((x) => x.id === id)!
      expect(o.pier.blockedWidth, id).toBeCloseTo(o.pier.mouthWidth, 6)
    }
  })

  it('is measured from the plan, not from the ray, so the two can disagree', () => {
    // head-6-7 is the disagreement: 0 m on the centre ray, 0.18 m of blocked
    // mouth. That is the whole reason both numbers are carried.
    expect(HEAD_6_7.buttressDepth).toBe(0)
    expect(HEAD_6_7.pier.blockedWidth).toBeGreaterThan(0)
    // the standalone helper answers the same way as the planned opening
    expect(pierBlockedWidth(HEAD_6_7.azimuthDeg, HEAD_6_7.outerWidth, BUTTRESS, R)).toBeCloseTo(
      HEAD_6_7.pier.blockedWidth,
      12,
    )
    expect(pierClearanceDeg(HEAD_6_7.azimuthDeg, BUTTRESS)).toBeCloseTo(HEAD_6_7.pier.centreDeg, 12)
  })
})

describe('and none of it moved the quarter-turn finding', () => {
  it('cuts the same nine ends, and withholds the same three', () => {
    expect(BASE.filter((o) => o.built).map((o) => o.id)).toEqual([
      'foot-2-3',
      'foot-3-4',
      'foot-4-6',
      'head-4-6',
      'foot-6-7',
      'head-6-7',
      'foot-7-8',
      'head-7-8',
      'foot-8-9',
    ])
    expect(BASE.filter((o) => !o.built).map((o) => o.id)).toEqual([
      'head-2-3',
      'head-3-4',
      'head-8-9',
    ])
  })

  it('leaves reachesDaylight a ray at the landing centre, blockage or none', () => {
    // head-6-7's mouth overlaps the pier and it still reaches daylight, because
    // that is what the word has meant since the check was written. Redefining it
    // would restate head-3-4's 8.01° and head-2-3's 11.09° without saying so.
    expect(HEAD_6_7.reachesDaylight).toBe(true)
    expect(HEAD_6_7.blindBecause).toBeUndefined()
    expect(BASE.filter((o) => o.blindBecause === 'buttress').map((o) => o.id)).toEqual([
      'head-2-3',
      'head-3-4',
    ])
    expect(BASE.find((o) => o.id === 'head-8-9')!.blindBecause).toBe('parapet')
    expect(BASE.find((o) => o.id === 'head-3-4')!.buttressDepth).toBeCloseTo(10.643, 3)
    expect(BASE.find((o) => o.id === 'head-2-3')!.buttressDepth).toBeCloseTo(9.882, 3)
  })

  it('says nothing about the beak’s head level, which is where a taper would live', () => {
    /*
     * The model's beak is one plan extruded straight up: beakShape() has no
     * height term and neither has buttressDepthAt(), so the traced edge is the
     * same 113.5 at every level and the only height dependence in the whole
     * check is the step at the beak's head. Whether the BUILDING's pier tapers is
     * unmeasured in this repository, and this pins the model's actual behaviour
     * so that nobody has to guess at it again.
     */
    for (const y of [4, 10, 18, 26]) {
      expect(pierClearanceDeg(113.6292, BUTTRESS), `y ${y}`).toBeCloseTo(0.1292, 4)
      expect(buttressDepthAt(113.4, BUTTRESS, R), `y ${y}`).toBeGreaterThan(0)
    }
    // above the beak's head the reading stands down rather than reporting a gap
    const roof = BASE.find((o) => o.id === 'head-8-9')!
    expect(roof.pier.aboveBeakHead).toBe(true)
    expect(roof.pier.blockedWidth).toBe(0)
    expect(roof.pier.insideDatumError).toBe(false)
  })
})
