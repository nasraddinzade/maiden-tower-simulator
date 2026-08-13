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
import { planAllFlights, stairPassageSections } from './staircase'
import {
  crownRelativeLevels,
  ladderResidual,
  passageEndAnchors,
  patternResidual,
  planPassageOpenings,
  type OpeningFitting,
  type PhotographedPattern,
} from './passageOpenings'
import windowData from '../data/windows.json'

/**
 * WHAT THE PHOTOGRAPHS MEASURE, PINNED AS A MEASUREMENT.
 *
 * [OWNER] 2026-08-13, pointing at the frame the comparison panel shows with the
 * slits circled: «на настоящей башне окна если смотреть с переди клюва находятся
 * с левой стороны клюва в таком вот распорядке и отдалении друг от друга» — the
 * windows are on the left of the beak IN THIS ARRANGEMENT AND AT THIS SPACING.
 *
 * So the photographed pattern is [OWNER]-endorsed evidence, and three of the
 * numbers below disagree with the model. THESE TESTS DO NOT ASSERT AGREEMENT AND
 * THEY DO NOT ASSERT DISAGREEMENT. They pin each quantity at the size it was
 * measured at, so that anyone who later tunes the model toward the photograph has
 * to come here and change a number by hand. That is the whole point: a silent
 * drift toward a reading is exactly how a placeholder becomes a fact, and this
 * repository has been bitten by it twice already (the hardcoded 141°, the stale
 * `head-3-4` hotspot).
 *
 * Every figure comes from src/data/windows.json → photographedPattern, which
 * records the method and the frames. Nothing here re-derives a photograph; it
 * re-derives the MODEL and subtracts.
 */
const PATTERN = windowData.photographedPattern as unknown as PhotographedPattern
const FITTINGS = windowData.passageOpenings as unknown as OpeningFitting[]
const LADDER = windowData.photographicLadder as unknown as Parameters<typeof ladderResidual>[1]
const BEAK_TOP_Y = Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY)

function layout(overrides: Partial<Parameters<typeof stairSettings>[0]> = {}) {
  const settings = stairSettings(overrides)
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
  const anchors = passageEndAnchors(flights, tubes, (i, end) =>
    end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
  )
  return planPassageOpenings({
    anchors,
    fittings: FITTINGS,
    liftLabel: (i) => ({
      from: WALL_LIFTS[i].fromFloorNumber,
      to: WALL_LIFTS[i].toFloorNumber,
    }),
    cfg: PASSAGE_OPENING,
    buttress: BUTTRESS,
    outerRadius: TOWER.outerRadius,
    buttressTopY: BEAK_TOP_Y,
    towerTopY: TOWER.topY,
  })
}

const OPENINGS = layout()
const R = patternResidual(OPENINGS, PATTERN, TOWER.topY, TOWER.outerRadius)

describe('the count', () => {
  it('cuts nine where the frames count eight, and the eight are agreed by three frames', () => {
    /*
     * Not a near miss in either direction, and the sign matters. Before
     * 2026-08-13 the model was two SHORT of the photographs; the quarter turn
     * took it to one OVER. Nine is also a property of a daylight check standing
     * in for twelve unanswered questions, not of the building.
     */
    expect(PATTERN.count).toBe(8)
    expect(PATTERN.frames).toHaveLength(3)
    expect(R.count).toBe(9)
    expect(R.countResidual).toBe(1)
  })

  it('puts its nine openings on six levels where the frames put eight on eight', () => {
    // three landings carry a foot and a head 92° apart. In elevation a pair like
    // that is ONE rung, which is why the levels are counted distinctly
    expect(R.levels).toHaveLength(6)
    expect(PATTERN.rungs).toHaveLength(8)
    expect(new Set(PATTERN.rungs.map((r) => r.storey)).size).toBe(8)
  })
})

const LADDER_RESIDUAL = ladderResidual(OPENINGS, LADDER, TOWER.height)

describe('the column separation — the disagreement that survived being re-measured', () => {
  const ladder = LADDER_RESIDUAL

  it('spreads its columns about 97° against 35 measured on three frames', () => {
    expect(PATTERN.separationDeg).toBeCloseTo(35.3, 1)
    expect(PATTERN.separationSpreadDeg).toBeLessThan(3)
    expect(ladder.separationDeg).toBeGreaterThan(90)
    expect(ladder.separationDeg).toBeLessThan(105)
    // 2.7 times too wide, and the factor is what has to be explained
    expect(ladder.separationDeg / PATTERN.separationDeg).toBeGreaterThan(2.5)
  })

  it('cannot be closed by any tread a person climbs, and that is arithmetic', () => {
    /*
     * A flight's sweep is (rise / riser) × (going / midRadius) and it is linear
     * in each of the three. So solve it backwards from the model's OWN measured
     * sweep — no re-derivation, no second set of assumptions — and ask what each
     * would have to become to reach 35°. All three come out impossible, which is
     * why nobody may reach for STAIR.goingTarget as the fix.
     */
    const shrink = PATTERN.separationDeg / ladder.separationDeg
    const midRadii = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
      .flat()
      .map((s) => s.midRadius)
    expect(STAIR.goingTarget * shrink).toBeLessThan(0.12) // a 0.12 m tread is not a tread
    expect(STAIR.riserTarget / shrink).toBeGreaterThan(0.5) // nor is a 0.55 m riser a riser
    // and the third way out puts the walking line outside the tower
    expect(Math.min(...midRadii) / shrink).toBeGreaterThan(TOWER.outerRadius)
  })

  it('measures a single 43° step between storey 4 and storey 5, not a drift', () => {
    /*
     * The fact that locates `reconciliation` → `not-feet-and-heads` at a definite
     * storey. Below the step the four rungs hold one bearing; above it they hold
     * another and drift. Storey 5 is the one [OWNER] singled out unprompted on
     * 2026-08-09 as reached from the middle of a single long climb.
     *
     * `rungs` carries frame A's bearings and `bearingJumpDeg` the mean of three,
     * so they are checked against each other rather than for equality: the
     * frame-to-frame spread on this quantity is 2° and hiding it would be the
     * opposite of the point.
     */
    const by = new Map(PATTERN.rungs.map((r) => [r.storey, r.deltaDeg]))
    const lower = [1, 2, 3, 4].map((s) => by.get(s)!)
    const upper = [5, 6, 7, 8].map((s) => by.get(s)!)
    expect(Math.max(...lower) - Math.min(...lower)).toBeCloseTo(PATTERN.lowerColumnSpreadDeg, 1)
    expect(Math.max(...upper) - Math.min(...upper)).toBeCloseTo(PATTERN.upperColumnDriftDeg, 1)
    expect(PATTERN.bearingJumpAboveStorey).toBe(4)
    const stepInFrameA = by.get(5)! - by.get(4)!
    expect(stepInFrameA).toBeLessThan(-40)
    expect(stepInFrameA).toBeGreaterThan(-46)
    expect(Math.abs(stepInFrameA - PATTERN.bearingJumpDeg)).toBeLessThan(1.5)
    // the step is bigger than either column's whole internal spread
    expect(Math.abs(PATTERN.bearingJumpDeg)).toBeGreaterThan(PATTERN.upperColumnDriftDeg * 2)
  })
})

describe('the vertical pitch — measured against the drum, which needs no ground line', () => {
  it('agrees to 0.01 drum radii, where the height-based reading disagreed by 0.50 m', () => {
    /*
     * THE RESIDUAL CHANGES SIGN WITH THE CHOICE OF YARDSTICK, and that is the
     * finding rather than a caveat. ladderResidual() scores the model against
     * fractions of [ICOMOS 958]'s 29.5 m and reports −0.32 m per rung. Measured
     * down from the crown in drum radii — a unit both sides can state without
     * borrowing a datum from the other — the same rungs give 0.400 against the
     * model's 0.398.
     *
     * What sits between the two is a documented conflict, not an error: the rim
     * arc puts the drum's visible foot on the beak side 4.2–4.4 radii below the
     * crown, which is 34.7–36.3 m at the documented 16.5 m diameter against 29.5
     * m of documented height. NOTHING IS TUNED TO EITHER. Both numbers are
     * pinned here so that a change to the storey table has to face both.
     */
    expect(R.photographedPitchRadii).toBeCloseTo(0.4, 2)
    expect(R.pitchRadii).toBeCloseTo(0.398, 3)
    expect(Math.abs(R.pitchResidualRadii)).toBeLessThan(0.01)
    expect(LADDER_RESIDUAL.rungResidual).toBeLessThan(-0.3)
  })

  it('lands six of the eight photographed rungs on a model landing to within half a metre', () => {
    expect(R.matched).toHaveLength(6)
    expect(R.worstMatchedResidual).toBeLessThan(0.07)
    expect(R.worstMatchedResidual * TOWER.outerRadius).toBeLessThan(0.6)
  })

  it('is short exactly two rungs, at storey 5 and at storey 1', () => {
    /*
     * Named rather than counted, and both are places the config already knows
     * about: storey 5 is the mid-climb exit off the 4→6 flight (LIFTS, opensOnto
     * [5]) and storey 1 is the lift the model gives to the modern steel spiral.
     * If either ever gains an opening this test says so on the next run.
     */
    expect(R.unmatchedStoreys).toEqual([5, 1])
    const storey5 = (TOWER.topY - (FLOORS[4].floorY + PASSAGE_OPENING.sillAboveLanding + 1.9 / 2)) / TOWER.outerRadius
    const storey1 = (TOWER.topY - (FLOORS[0].floorY + PASSAGE_OPENING.sillAboveLanding + 1.9 / 2)) / TOWER.outerRadius
    const at = (s: number) => PATTERN.rungs.find((r) => r.storey === s)!.belowCrownRadii
    expect(Math.abs(storey5 - at(5))).toBeLessThan(PATTERN.matchToleranceRadii)
    expect(Math.abs(storey1 - at(1))).toBeLessThan(PATTERN.matchToleranceRadii)
  })

  it('reproduces the taller ground storey, which nothing was fitted to', () => {
    // the model's storey 1 is the tall one (GROUND_CLEAR, not UPPER_CLEAR); the
    // frames make that bottom gap the largest too, and by about the same margin
    const at = (s: number) => PATTERN.rungs.find((r) => r.storey === s)!.belowCrownRadii
    const groundGap = at(1) - at(2)
    expect(groundGap).toBeGreaterThan(R.photographedPitchRadii)
    expect((FLOORS[1].floorY - FLOORS[0].floorY) / TOWER.outerRadius).toBeGreaterThan(R.pitchRadii)
  })
})

describe('crownRelativeLevels is the same arithmetic for both sides', () => {
  it('counts a foot and a head on one landing as one level', () => {
    const built = OPENINGS.filter((o) => o.built)
    expect(built).toHaveLength(9)
    expect(crownRelativeLevels(OPENINGS, TOWER.topY, TOWER.outerRadius)).toHaveLength(6)
  })

  it('measures down from the crown, so a level below the parapet is positive', () => {
    const levels = crownRelativeLevels(OPENINGS, TOWER.topY, TOWER.outerRadius)
    expect(Math.min(...levels)).toBeGreaterThan(0)
    expect(Math.max(...levels)).toBeLessThan(TOWER.height / TOWER.outerRadius)
  })
})
