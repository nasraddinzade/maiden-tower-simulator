/**
 * THE ONE THING IN THIS ARGUMENT THAT NEEDS NO ASSUMPTION, PINNED.
 *
 * [OWNER] 2026-08-13, pointing at the reference frame in the comparison panel
 * with the slits circled: «на настоящей башне окна если смотреть с переди клюва
 * находятся с левой стороны клюва в таком вот распорядке и отдалении друг от
 * друга» — the windows are on the left of the beak IN THIS ARRANGEMENT AND AT
 * THIS SPACING. That makes the photographed pattern [OWNER]-endorsed evidence,
 * and windows.json → reconciliation lists what could reconcile it with the model.
 *
 * ONE OF THOSE CANDIDATES CAN BE SETTLED WITHOUT ASKING HIM ANYTHING, and this
 * file settles it. `different-sweep` proposes that a flight sweeps about 35°
 * rather than 97°, which would make the two photographed columns the feet and
 * heads of the same flights after all. It was answered in the file with an
 * argument about tread size, and that argument leans on three numbers the
 * project does not have: STAIR.goingTarget is [ASSUMPTION] and «not in any
 * source», STAIR.endLandingLength is an [ESTIMATE], and where the walking line
 * runs in the wall is a model choice.
 *
 * The photograph refutes it on its own. Stacked flights of equal rise put their
 * far ends in a leaning column, because the wall thins upward, the walking line
 * moves out, and the same climb sweeps less arc higher up:
 *
 *     drift = sweep × (1 − r_low / r_high)
 *
 * Tread, riser and radius all cancel — the first test below proves that by
 * re-planning the whole stair over a 2.4× range of sweep and getting the same
 * ratio to four decimals. What is left is the wall's taper, which is docs-
 * sourced. So a measured lean measures a sweep.
 *
 * NOTHING HERE ASSERTS THE MODEL IS RIGHT. It comes out wrong too, by a factor
 * of two. These tests assert the SIZE OF EACH DISAGREEMENT so that anyone who
 * later tunes the stair toward the photograph has to come here and change a
 * number by hand — a red test is the difference between a decision and a drift,
 * which is CLAUDE.md rule 7 with a lock on it.
 *
 * Mathematics only (rule 6). Nothing here renders anything.
 */

import { describe, expect, it } from 'vitest'
import {
  BUTTRESS,
  ENTRANCE,
  FLOORS,
  PASSAGE_OPENING,
  STAIR,
  TOWER,
  WALL_LIFTS,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import { planAllFlights, stairPassageSections, type StepPlacement } from './staircase'
import {
  driftPerSweep,
  passageEndAnchors,
  planPassageOpenings,
  separationParts,
  sweepFromDrift,
  type OpeningFitting,
  type PassageOpening,
} from './passageOpenings'
import windowData from '../data/windows.json'

const PATTERN = windowData.photographedPattern
const COUPLING = windowData.sweepDriftCoupling

/** First tread to last tread, degrees. */
function arcDeg(f: StepPlacement[]): number {
  return Math.abs(f[f.length - 1].azimuthDeg - f[0].azimuthDeg)
}

/** Walking-line radius averaged over the flight — the radius its arc divides by. */
function meanRadius(f: StepPlacement[]): number {
  return (f[0].midRadius + f[f.length - 1].midRadius) / 2
}

/** Arc spent on the two flat end landings, degrees. */
function landingArcDeg(f: StepPlacement[]): number {
  const flat = (y: number) => f.filter((s) => Math.abs(s.treadY - y) < 1e-9).length - 1
  const perStep = arcDeg(f) / (f.length - 1)
  return perStep * (flat(f[0].treadY) + flat(f[f.length - 1].treadY))
}

function flights(overrides: Partial<Parameters<typeof stairSettings>[0]> = {}) {
  return planAllFlights(stairSettings(overrides), WALL_LIFTS, innerRadiusAt)
}

function openings(): PassageOpening[] {
  const settings = stairSettings()
  const fl = planAllFlights(settings, WALL_LIFTS, innerRadiusAt)
  const tubes = stairPassageSections(
    fl,
    settings.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
    TOWER.topY,
    undefined,
    STAIR.doorwayWidth,
  )
  return planPassageOpenings({
    anchors: passageEndAnchors(fl, tubes, (i, end) =>
      end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
    ),
    fittings: windowData.passageOpenings as unknown as OpeningFitting[],
    liftLabel: (i) => ({
      from: WALL_LIFTS[i].fromFloorNumber,
      to: WALL_LIFTS[i].toFloorNumber,
    }),
    cfg: PASSAGE_OPENING,
    buttress: BUTTRESS,
    outerRadius: TOWER.outerRadius,
    buttressTopY: Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY),
    towerTopY: TOWER.topY,
  })
}

/** The four flights that climb exactly one storey. 4→6 spans two, 8→9 is the roof. */
const SINGLE = [0, 1, 3, 4]

describe('a flight’s arc times its radius is a constant of the stair', () => {
  it('holds to five significant figures across the four equal-rise flights', () => {
    /*
     * arc = (number of treads × going) ÷ r. Equal rise means equal tread count,
     * so arc × r is the same number for every one of them and the ONLY thing
     * that changes with height is r. This is the fact the whole file rests on;
     * if it ever stops being true the coupling below stops being true with it.
     */
    const fl = flights()
    const products = SINGLE.map((i) => arcDeg(fl[i]) * meanRadius(fl[i]))
    for (const p of products) expect(p).toBeCloseTo(COUPLING.arcTimesRadius, 1)
    expect(Math.max(...products) - Math.min(...products)).toBeLessThan(0.02)
    // and the arcs themselves are NOT constant — they fall as the wall thins
    expect(arcDeg(fl[SINGLE[0]])).toBeGreaterThan(arcDeg(fl[SINGLE[3]]) + 10)
  })
})

describe('the drift of a column of flight ends is the sweep times the taper', () => {
  it('predicts the model’s own drift from the two radii alone', () => {
    const fl = flights()
    const lo = fl[SINGLE[0]]
    const hi = fl[SINGLE[3]]
    const measured = (arcDeg(lo) - arcDeg(hi)) / arcDeg(lo)
    expect(measured).toBeCloseTo(driftPerSweep(meanRadius(lo), meanRadius(hi)), 4)
    expect(measured).toBeCloseTo(COUPLING.driftPerSweep, 4)
  })

  it('is the same ratio for any tread and any riser — they cancel', () => {
    /*
     * THE TEST THAT MAKES THE ARGUMENT SOUND. Re-plan the entire stair at four
     * treads and two risers — sweeps from 48° to 115°, a 2.4× range that spans
     * every value anybody has proposed — and the ratio does not move in the
     * fourth decimal. So no choice of tread can be blamed for the lean, and no
     * choice of tread can produce one.
     */
    const ratios: number[] = []
    for (const goingTarget of [0.15, 0.2, 0.3, 0.45]) {
      for (const riserTarget of [0.2, 0.25]) {
        const fl = flights({ goingTarget, riserTarget })
        const lo = fl[SINGLE[0]]
        const hi = fl[SINGLE[3]]
        ratios.push((arcDeg(lo) - arcDeg(hi)) / arcDeg(lo))
        // the sweep itself moves a great deal while the ratio does not
        expect(arcDeg(lo)).toBeGreaterThan(45)
        expect(arcDeg(lo)).toBeLessThan(120)
      }
    }
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1e-4)
    for (const r of ratios) expect(r).toBeCloseTo(COUPLING.driftPerSweep, 4)
  })
})

describe('what the photographed lean measures', () => {
  /*
   * The upper column stands at storeys 5–8, so the flights that would end there
   * run from storey 4 to storey 5 and from storey 7 to storey 8. Their walking
   * lines are taken from the config's own taper, not from any reading.
   */
  const width = stairSettings().width
  const walkingLine = (y: number) =>
    innerRadiusAt(y) + stairSettings().wallClearance + width / 2
  const rTo5 = (walkingLine(FLOORS[3].floorY) + walkingLine(FLOORS[4].floorY)) / 2
  const rTo8 = (walkingLine(FLOORS[6].floorY) + walkingLine(FLOORS[7].floorY)) / 2
  const STOREYS = 3 // storey 5 to storey 8 is three gaps
  const perStorey = PATTERN.upperColumnDriftDeg / STOREYS

  it('records the band the lean was measured over', () => {
    expect(rTo5).toBeCloseTo(COUPLING.walkingLineToStorey5, 3)
    expect(rTo8).toBeCloseTo(COUPLING.walkingLineToStorey8, 3)
    expect(driftPerSweep(rTo5, rTo8) / STOREYS).toBeCloseTo(COUPLING.taperPerStorey, 5)
    expect(perStorey).toBeCloseTo(COUPLING.photographedLeanPerStoreyDeg, 2)
  })

  it('KILLS the 35° sweep: it would lean a fifth of what the frames show', () => {
    /*
     * This is `reconciliation` → `refuted` → `different-sweep`, and it is the
     * whole reason that entry moved out of `candidates`. No tread is named, no
     * landing is assumed, no walking radius is chosen: only the two radii the
     * wall taper gives, and a lean measured on the same photograph the 35° was
     * measured on. The candidate is refuted by its own evidence.
     */
    const wouldLean = PATTERN.separationDeg * driftPerSweep(rTo5, rTo8) / STOREYS
    expect(wouldLean).toBeCloseTo(COUPLING.a35SweepWouldLeanDeg, 2)
    expect(perStorey / wouldLean).toBeGreaterThan(4)
    // put the other way round: the measured lean needs a sweep near 176°
    const needs = sweepFromDrift(perStorey, rTo5, rTo8, STOREYS)
    expect(needs).toBeCloseTo(COUPLING.sweepTheLeanImpliesDeg, 0)
    expect(needs / PATTERN.separationDeg).toBeGreaterThan(4)
  })

  it('does NOT rescue the model, which leans about half what it should', () => {
    /*
     * Said in the same breath as the refutation, because a refutation that only
     * ever lands on the other side is an argument for the model rather than a
     * measurement of it. The model's heads lean 2.3–3.1° per storey against
     * 5.1 photographed. Neither reading explains the upper column, and that is
     * the state of the evidence.
     */
    const all = openings()
    const heads = all
      .filter((o) => o.end === 'head' && o.passage !== '4-6')
      .sort((a, b) => a.centreY - b.centreY)
    const storey = FLOORS[3].floorY - FLOORS[2].floorY
    const leans = heads.slice(1).map((h, i) => {
      const storeys = Math.round((h.centreY - heads[i].centreY) / storey)
      return (h.azimuthDeg - heads[i].azimuthDeg) / storeys
    })
    for (const l of leans) {
      expect(l).toBeGreaterThan(COUPLING.modelLeanPerStoreyDeg[0] - 0.05)
      expect(l).toBeLessThan(COUPLING.modelLeanPerStoreyDeg[1] + 0.05)
      expect(l).toBeLessThan(perStorey) // every one of them too shallow
    }
    expect(perStorey / Math.max(...leans)).toBeGreaterThan(1.5)
  })

  it('finds the lower column IS a foot signature, and the model reproduces it', () => {
    /*
     * The half of the photograph the model gets right, and it is worth a test of
     * its own because it is what makes the upper half a real disagreement rather
     * than a broken measurement. Feet stand at the flight's START, which is the
     * same bearing for every stacked flight, so a foot column is vertical to
     * within the doorway's own lead. Model 0.30° per storey; the frames give the
     * lower four 0.3–0.9°. Heads at the same place would lean 2.3–3.1.
     */
    const all = openings()
    const feet = all
      .filter((o) => o.end === 'foot' && o.passage !== '8-9')
      .sort((a, b) => a.centreY - b.centreY)
    const storey = FLOORS[3].floorY - FLOORS[2].floorY
    const storeys = Math.round((feet[feet.length - 1].centreY - feet[0].centreY) / storey)
    const perStoreyModel =
      Math.abs(feet[feet.length - 1].azimuthDeg - feet[0].azimuthDeg) / storeys
    expect(perStoreyModel).toBeCloseTo(COUPLING.modelFootLeanPerStoreyDeg, 2)
    // the photographed lower column, over its own three gaps
    const photographed = PATTERN.lowerColumnSpreadDeg / 3
    expect(perStoreyModel).toBeLessThan(photographed + 0.6)
    // and it is nothing like a head column
    expect(perStoreyModel * 5).toBeLessThan(COUPLING.modelLeanPerStoreyDeg[0])
  })
})

describe('two fifths of the model’s column separation is not the climb', () => {
  it('splits 104.5° into the climb, the landings and the clearance', () => {
    /*
     * CORRECTING SOMETHING THE FILE SAID IN ITS OWN DEFENCE. windows.json used
     * to state that the separation is «(rise / riser) × (going / midRadius)» and
     * therefore «not a free parameter». Two of its three parts are: the end
     * landings are an [ESTIMATE] with no source, and holding the opening clear of
     * the last tread is a rule planPassageOpenings chose. Only the middle 64.3°
     * is the climb.
     *
     * The correction does not change the verdict — strip both and 64.3° still
     * stands against 35.3° measured — which is why the entry moved to `refuted`
     * on the lean and not on this. But an argument that overstates itself is one
     * a reader is right to distrust, and the overstatement is fixed here.
     */
    const fl = flights()
    const all = openings()
    const foot = all.find((o) => o.id === 'foot-2-3')!
    const head = all.find((o) => o.id === 'head-2-3')!
    const parts = separationParts({
      totalDeg: Math.abs(foot.azimuthDeg - head.azimuthDeg),
      flightArcDeg: arcDeg(fl[0]),
      landingArcDeg: landingArcDeg(fl[0]),
    })
    expect(parts.totalDeg).toBeCloseTo(COUPLING.separationParts.totalDeg, 1)
    expect(parts.climbDeg).toBeCloseTo(COUPLING.separationParts.climbDeg, 1)
    expect(parts.landingDeg).toBeCloseTo(COUPLING.separationParts.landingDeg, 1)
    expect(parts.clearanceDeg).toBeCloseTo(COUPLING.separationParts.clearanceDeg, 1)
    expect(parts.notFromTheClimb).toBeGreaterThan(0.35)
    // and the part that IS the climb still overshoots the frames by 80%
    expect(parts.climbDeg / PATTERN.separationDeg).toBeGreaterThan(1.7)
  })

  it('runs its walking line at 4.28 m, which is where the arithmetic divides', () => {
    /*
     * Pinned because a reading of this stair was circulated with the walking
     * line at 3.62 m, which would have made the sweep 18% wider than it is and
     * a tread of 0.17 m look sufficient. It is the inner face, plus
     * STAIR.wallClearance, plus half the stair's width — three terms, and the
     * middle one is easy to forget, which is the second reason this is a test.
     */
    const s = stairSettings()
    const fl = flights()
    expect(meanRadius(fl[0])).toBeCloseTo(COUPLING.walkingLineLowestFlight, 3)
    expect(fl[0][0].midRadius).toBeCloseTo(
      innerRadiusAt(fl[0][0].treadY) + s.wallClearance + s.width / 2,
      6,
    )
    // and it is NOT the two-term version, by a quarter of a metre
    expect(fl[0][0].midRadius - (innerRadiusAt(fl[0][0].treadY) + s.width / 2)).toBeCloseTo(
      s.wallClearance,
      6,
    )
  })
})

describe('the sideways step a sector break would need, derived and not adopted', () => {
  it('is 46–61°, and nothing in the tower has been turned by it', () => {
    /*
     * `reconciliation` → `not-feet-and-heads` says the stair may run in one
     * sector below mid-height and another above it. If the photographed 43° step
     * between storey 4 and storey 5 is a foot below and a head above, the offset
     * between the two sectors is the model's own foot-to-head separation minus
     * that step. DERIVED, from a measurement and a model quantity — not measured,
     * and NOT BUILT: STAIR.startAzimuthDeg is still one number for all six
     * flights, as [OWNER] 2026-08-06 instructed.
     */
    const all = openings()
    const pairs: Array<[string, string]> = [
      ['foot-2-3', 'head-2-3'],
      ['foot-3-4', 'head-3-4'],
      ['foot-6-7', 'head-6-7'],
      ['foot-7-8', 'head-7-8'],
    ]
    const az = (id: string) => all.find((o) => o.id === id)!.azimuthDeg
    const needed = pairs.map(([f, h]) => az(f) - az(h) - Math.abs(PATTERN.bearingJumpDeg))
    expect(Math.min(...needed)).toBeCloseTo(COUPLING.sectorStepRangeDeg[0], 0)
    expect(Math.max(...needed)).toBeCloseTo(COUPLING.sectorStepRangeDeg[1], 0)
    // the stair itself is untouched: one start bearing, his quarter turn
    expect(STAIR.startAzimuthDeg).toBeCloseTo(BUTTRESS.azimuthDeg + 90, 6)
    const starts = new Set(flights().map((f) => f[0].azimuthDeg.toFixed(3)))
    expect(starts.size).toBeLessThanOrEqual(2) // the roof climb pays for a landing in arc
  })
})

describe('the record says what the arithmetic says', () => {
  it('moves different-sweep out of the candidates and gives the reason', () => {
    const live = windowData.reconciliation.candidates.map((c) => c.id)
    expect(live).not.toContain('different-sweep')
    const refuted = windowData.reconciliation.refuted
    const entry = refuted.find((r) => r.id === 'different-sweep')!
    expect(entry.refutedBy).toMatch(/lean|drift/i)
    // and every refuted entry says what refuted it, not merely that it is out
    for (const r of refuted) expect(r.refutedBy.length).toBeGreaterThan(40)
  })

  it('keeps the candidate list free of duplicates and every entry falsifiable', () => {
    const c = windowData.reconciliation.candidates
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length)
    for (const x of c) {
      expect(x.observation.length).toBeGreaterThan(20)
      expect(x.predicts.length).toBeGreaterThan(20)
    }
  })

  it('puts one question at the head of the queue, in Russian, and leaves it open', () => {
    /*
     * The index exists because five question blocks had grown into a wall nobody
     * reads. It is not allowed to become decoration either: the moment he answers,
     * `answered` stops being null and this fails, which is the prompt to go and
     * fill in the twelve ends it points at.
     */
    const q = windowData.askInThisOrder
    expect(q.answered).toBeNull()
    const asked = q.theQuestion.join('\n')
    expect(asked).toMatch(/[а-яА-ЯёЁ]{4}/) // asked in the language he speaks
    // his own four cases, verbatim, so an answer maps onto `open` without reading
    expect(asked).toMatch(/ТОЛЬКО в начале/)
    expect(asked).toMatch(/ТОЛЬКО в конце/)
    expect(asked).toMatch(/И ТАМ И ТАМ/)
    expect(asked).toMatch(/НИ ТАМ НИ ТАМ/)
    // and it points at the block that holds the twelve empty answers
    expect(asked).toContain('openEndsQuestion')
    for (const p of windowData.openEndsQuestion.passages) expect(p.answer).toBeNull()
    // the queue behind it names every other block that is still waiting
    const queue = q.thenTheseFive.concat(q.andTwoFaultsYouNamedWithoutCorrecting).join('\n')
    for (const block of [
      'beakSideQuestion',
      'sectorStepQuestion',
      'headShapeQuestion',
      'sillHeightQuestion',
      'ROOF_QUESTION',
    ]) {
      expect(queue).toContain(block)
    }
  })
})
