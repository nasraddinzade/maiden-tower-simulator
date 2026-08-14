/**
 * THE PHOTOGRAPH HE ENDORSED, AGAINST THE MODEL, PINNED AS NUMBERS.
 *
 * [OWNER] 2026-08-13, pointing at the reference frame in the app's own comparison
 * panel with the slits circled:
 *
 *   «на настоящей башне окна если смотреть с переди клюва находятся с левой
 *    стороны клюва в таком вот распорядке и отдалении друг от друга»
 *
 *   — on the real tower the windows, seen from in front of the beak, are on the
 *   LEFT of the beak, IN THIS ARRANGEMENT AND AT THIS SPACING.
 *
 * That promotes the photographed pattern from [PHOTO] to [OWNER]-endorsed, and
 * the model disagrees with it in four measurable ways. This file exists to make
 * the disagreement a MEASURED QUANTITY rather than a paragraph: the count, the
 * separation of the two columns, the vertical pitch, and what a person standing
 * in front of the beak would actually see.
 *
 * WHY IT IS WRITTEN AS AN ASSERTION ON THE GAP AND NOT ON THE MODEL. Nobody has
 * ruled on which pattern is right — see windows.json → reconciliation, where six
 * candidates are listed and none is adopted. If a later change tunes the model
 * toward the photograph, these tests fail and whoever did it has to come here and
 * say so. That is the point: a silent drift toward the picture is exactly the
 * failure CLAUDE.md rule 7 names, and a red test is the difference between a
 * decision and a drift.
 *
 * Mathematics only (rule 6): azimuths, heights and one cross product. Nothing
 * here renders anything.
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
import { azimuthToVector } from './geometry'
import { planAllFlights, stairPassageSections } from './staircase'
import {
  beakOutline,
  passageEndAnchors,
  planPassageOpenings,
  type OpeningFitting,
  type PassageOpening,
} from './passageOpenings'
import windowData from '../data/windows.json'

const REMEASURED = windowData.photographicLadder.remeasured
const RECORD = windowData.modelAsBuilt

/** Shortest signed difference a − b, in (−180, 180]. */
function delta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

function built(): PassageOpening[] {
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

const ALL = built()
const CUT = ALL.filter((o) => o.built)

// —————————————————————————————— handedness ——————————————————————————————

describe('which side of the beak is LEFT', () => {
  /*
   * THE RE-DERIVATION, from CLAUDE.md rule 3 and nothing else: metres, Y up,
   * north = −Z, east = +X, azimuth clockwise from north.
   *
   * It is worth a test rather than a comment because a reversed left/right does
   * not fail loudly — it produces a complete, plausible model of the wrong half
   * of the building, and the difference between the two answers here is
   * 196.7 against 16.7.
   */
  it('is the buttress bearing plus a quarter turn, derived from the frame convention', () => {
    // an observer outside on the beak's bearing, looking at the tower
    const facing = azimuthToVector(BUTTRESS.azimuthDeg + 180)
    // left = up × facing, with up = +Y in a right-handed frame (x east, y up, z south)
    const left = {
      x: 1 * facing.z - 0 * 0,
      z: 0 * 0 - 1 * facing.x,
    }
    const leftAzimuth = ((Math.atan2(left.x, -left.z) * 180) / Math.PI + 360) % 360
    expect(leftAzimuth).toBeCloseTo(BUTTRESS.azimuthDeg + 90, 6)
    expect(leftAzimuth).toBeCloseTo(196.7, 6)
    // and NOT the mirror, which is the failure this test exists to catch
    expect(Math.abs(delta(leftAzimuth, BUTTRESS.azimuthDeg - 90))).toBeCloseTo(180, 6)
  })

  it('puts everything he can call "left of the beak" inside one half-circle', () => {
    // a drum point at azimuth phi appears to his left iff sin(phi − beak) > 0
    const isLeft = (az: number) => Math.sin(delta(az, BUTTRESS.azimuthDeg) * (Math.PI / 180)) > 0
    expect(isLeft(BUTTRESS.azimuthDeg + 90)).toBe(true)
    expect(isLeft(BUTTRESS.azimuthDeg + 1)).toBe(true)
    expect(isLeft(BUTTRESS.azimuthDeg + 179)).toBe(true)
    expect(isLeft(BUTTRESS.azimuthDeg - 90)).toBe(false)
    // so his sentence fixes the SIGN of the quarter turn and not its size:
    // a sixth of a turn satisfies it exactly as well as a quarter does
    expect(isLeft(BUTTRESS.azimuthDeg + 60)).toBe(true)
  })

  it('makes a quarter turn the LAST bearing a viewer in front of the beak can see', () => {
    // the drum shows azimuths within arccos(R/d) of the viewer's bearing
    const arcAt = (d: number) => (Math.acos(TOWER.outerRadius / d) * 180) / Math.PI
    expect(arcAt(30)).toBeCloseTo(74.0, 1)
    expect(arcAt(1e6)).toBeCloseTo(90, 3)
    // 90° is the supremum, so STAIR.startAzimuthDeg sits exactly on the limb and
    // the landings that hang off it sit past it
    expect(delta(STAIR.startAzimuthDeg, BUTTRESS.azimuthDeg)).toBeCloseTo(90, 6)
    const feet = ALL.filter((o) => o.end === 'foot')
    for (const f of feet) {
      expect(Math.abs(delta(f.azimuthDeg, BUTTRESS.azimuthDeg))).toBeGreaterThan(90)
    }
  })
})

// ———————————————————————— the model, measured ————————————————————————

describe('the model as built, measured for comparison with the frames', () => {
  it('cuts nine openings at six distinct heights', () => {
    expect(CUT).toHaveLength(RECORD.builtCount)
    expect(new Set(CUT.map((o) => o.centreY.toFixed(3))).size).toBe(RECORD.distinctHeights)
    // three of the six heights carry TWO openings; the photograph shows no such pair
    const perHeight = new Map<string, number>()
    for (const o of CUT) perHeight.set(o.centreY.toFixed(3), (perHeight.get(o.centreY.toFixed(3)) ?? 0) + 1)
    expect([...perHeight.values()].filter((n) => n === 2)).toHaveLength(3)
    expect(REMEASURED.twoAtOneHeight).toBe(0)
  })

  it('stands the feet in one column and the heads in another, 97° apart', () => {
    const feet = ALL.filter((o) => o.end === 'foot').map((o) => o.azimuthDeg)
    const heads = ALL.filter((o) => o.end === 'head' && o.passage !== '4-6').map((o) => o.azimuthDeg)
    for (const [i, az] of feet.entries()) expect(az).toBeCloseTo(RECORD.footColumnAzimuthDeg[i], 1)
    for (const [i, az] of heads.entries()) expect(az).toBeCloseTo(RECORD.headColumnAzimuthDeg[i], 1)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const sep = Math.abs(delta(mean(feet), mean(heads)))
    expect(sep).toBeCloseTo(RECORD.columnSeparationDeg, 1)
  })

  it('steps one storey between vertical neighbours, and two across the long flight', () => {
    const feet = ALL.filter((o) => o.end === 'foot').sort((a, b) => a.centreY - b.centreY)
    const gaps = feet.slice(1).map((f, i) => f.centreY - feet[i].centreY)
    const storey = FLOORS[3].floorY - FLOORS[2].floorY
    expect(storey).toBeCloseTo(RECORD.verticalPitchM, 3)
    expect(gaps.filter((g) => Math.abs(g - RECORD.verticalPitchM) < 1e-3)).toHaveLength(4)
    // 4→6 spans two storey heights, so one gap is double and there is no opening
    // at storey 5 at all — the hole the photograph's 4th rung falls into
    expect(gaps.filter((g) => Math.abs(g - RECORD.verticalPitchExceptionM) < 1e-3)).toHaveLength(1)
  })

  it('sits at the recorded heights above the ground', () => {
    const fracs = [...new Set(CUT.map((o) => (o.centreY - TOWER.groundY) / TOWER.height))].sort(
      (a, b) => a - b,
    )
    expect(fracs).toHaveLength(RECORD.heightFractions.length)
    for (const [i, f] of fracs.entries()) expect(f).toBeCloseTo(RECORD.heightFractions[i], 3)
  })
})

// ———————————————— what a photograph from the beak would show ————————————————

/** Does the segment viewer→point cross the beak's own plan outline? */
function beakBlocks(vx: number, vz: number, px: number, pz: number): boolean {
  const pts = beakOutline(BUTTRESS, TOWER.outerRadius)
  for (let i = 0; i < pts.length; i += 1) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[(i + 1) % pts.length]
    const d1x = px - vx
    const d1z = pz - vz
    const d2x = bx - ax
    const d2z = bz - az
    const den = d1x * d2z - d1z * d2x
    if (Math.abs(den) < 1e-12) continue
    const t = ((ax - vx) * d2z - (az - vz) * d2x) / den
    const s = ((ax - vx) * d1z - (az - vz) * d1x) / den
    if (t > 1e-6 && t < 1 - 1e-6 && s > 1e-6 && s < 1 - 1e-6) return true
  }
  return false
}

describe('the model seen from in front of the beak — his own viewpoint', () => {
  const VIEW_DISTANCE = 30 // m from the axis: 11 m beyond the beak's own tip
  const limbDeg = (Math.acos(TOWER.outerRadius / VIEW_DISTANCE) * 180) / Math.PI
  const v = azimuthToVector(BUTTRESS.azimuthDeg)

  const seen = CUT.map((o) => {
    const psi = delta(BUTTRESS.azimuthDeg, o.azimuthDeg) // + to the RIGHT in that view
    const p = azimuthToVector(o.azimuthDeg)
    const visible =
      Math.abs(psi) < limbDeg &&
      !beakBlocks(
        v.x * VIEW_DISTANCE,
        v.z * VIEW_DISTANCE,
        p.x * TOWER.outerRadius,
        p.z * TOWER.outerRadius,
      )
    return { id: o.id, psi, visible }
  })

  it('shows only two of the nine, and they hug the pier', () => {
    const visible = seen.filter((s) => s.visible)
    expect(visible.map((s) => s.id).sort()).toEqual(['head-6-7', 'head-7-8'])
    for (const s of visible) {
      expect(s.psi).toBeLessThan(0) // left of the beak, which is his side
      expect(Math.abs(s.psi)).toBeLessThan(10) // and within 10° of the beak itself
    }
    // against a photographed set that stands between about 10° and 60° round
    expect(REMEASURED.count).toBe(8)
  })

  it('hides all six feet behind the drum, at any distance', () => {
    const feet = seen.filter((s) => s.id.startsWith('foot-'))
    expect(feet).toHaveLength(6)
    for (const f of feet) {
      expect(f.visible).toBe(false)
      // past 90° is past the tangent point even for a camera at infinity
      expect(Math.abs(f.psi)).toBeGreaterThan(90)
    }
  })

  it('puts head-4-6 on the wrong side of the beak entirely', () => {
    const h = seen.find((s) => s.id === 'head-4-6')!
    expect(h.psi).toBeGreaterThan(0) // to the RIGHT
    expect(h.visible).toBe(false) // and the pier stands in the sight line
  })

  it('agrees end for end with the table written into windows.json', () => {
    for (const row of RECORD.fromTheBeak) {
      const s = seen.find((x) => x.id === row.id)!
      expect(s.psi).toBeCloseTo(row.psiDeg, 1)
      expect(s.visible).toBe(row.visible)
    }
  })
})

// ——————————————————————— the gaps, as quantities ———————————————————————

describe('the four disagreements, pinned', () => {
  it('COUNT: nine built against eight photographed', () => {
    expect(CUT.length - REMEASURED.count).toBe(1)
  })

  it('SEPARATION: about 97° modelled against 35 ± 4° measured in two frames', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const feet = ALL.filter((o) => o.end === 'foot').map((o) => o.azimuthDeg)
    const heads = ALL.filter((o) => o.end === 'head' && o.passage !== '4-6').map((o) => o.azimuthDeg)
    const modelled = Math.abs(delta(mean(feet), mean(heads)))
    expect(modelled).toBeGreaterThan(90)
    // both frames, both camera distances, all inside the recorded range
    for (const frame of Object.values(REMEASURED.frames)) {
      for (const s of frame.separationDeg) {
        expect(s).toBeGreaterThanOrEqual(REMEASURED.separationRangeDeg[0])
        expect(s).toBeLessThanOrEqual(REMEASURED.separationRangeDeg[1])
      }
    }
    expect(modelled - REMEASURED.separationDeg).toBeGreaterThan(55)
  })

  /*
   * THE VERTICAL IS ASSERTED ON A RATIO AND NEVER ON A METRE, and the reason is a
   * mistake this file nearly shipped. The first pass fixed the photographic scale
   * by taking the drum's VISIBLE foot for the ground [ICOMOS 958] measures 29.5 m
   * from, got a pitch of 2.83 m against the model's 3.281 and was about to pin a
   * 14% disagreement. The frames put that visible foot 4.2–4.4 radii below the
   * crown — some 35 m — so the division was by a span six metres too long. In drum
   * radii the ladder steps 0.414 against the model's 0.398 and THE PITCH AGREES.
   *
   * What survives is the ladder's own shape, which moves by less than 0.006 over
   * camera distances from 30 to 68 m while the metres move by 40%.
   */
  it('PITCH: agrees, once it is measured in drum radii instead of metres', () => {
    const storey = FLOORS[3].floorY - FLOORS[2].floorY
    expect(storey / TOWER.outerRadius).toBeCloseTo(0.398, 3)
    const photographed = windowData.photographedPattern.rungPitchRadii
    expect(Math.abs(storey / TOWER.outerRadius - photographed) / photographed).toBeLessThan(0.06)
  })

  it('VERTICAL: eight rungs where the model has six, and a hole where it has none', () => {
    const gaps = REMEASURED.ladderGapsNormalised
    expect(gaps).toHaveLength(REMEASURED.ladderNormalised.length - 1)
    expect(REMEASURED.ladderNormalised).toHaveLength(REMEASURED.count)

    // the same ladder for the model, normalised to its own span
    const levels = [...new Set(CUT.map((o) => o.centreY))].sort((a, b) => b - a)
    const span = levels[0] - levels[levels.length - 1]
    const norm = levels.map((y) => (levels[0] - y) / span)
    const modelGaps = norm.slice(1).map((v, i) => v - norm[i])

    expect(levels).toHaveLength(RECORD.distinctHeights)
    const ratio = (xs: number[]) =>
      Math.max(...xs) / (xs.reduce((a, b) => a + b, 0) / xs.length)
    // the photograph's largest gap is barely above its own mean; the model's is
    // two thirds above it, and that is the storey the 4→6 flight passes
    expect(ratio(gaps)).toBeCloseTo(REMEASURED.ladderMaxGapOverMean, 1)
    expect(ratio(modelGaps)).toBeCloseTo(5 / 3, 2)
    expect(ratio(modelGaps)).toBeGreaterThan(ratio(gaps) + 0.4)

    // and the photograph puts TWO rungs inside that one gap
    const holeFrom = norm[2]
    const holeTo = norm[3]
    expect(holeTo - holeFrom).toBeCloseTo(1 / 3, 2)
    const inside = REMEASURED.ladderNormalised.filter((v) => v > holeFrom + 0.02 && v < holeTo - 0.02)
    expect(inside).toHaveLength(2)
  })

  it('SHAPE: the roof-climb head is the rung that lands above the tower', () => {
    const roofHead = ALL.find((o) => o.id === 'head-8-9')!
    expect((roofHead.centreY - TOWER.groundY) / TOWER.height).toBeGreaterThan(1)
    expect(roofHead.built).toBe(false)
    // the model's own levels, crown-relative, against the photographed rungs on
    // the same ruler: six of the eight have a carrier within a tenth of a radius
    const modelRadii = [...new Set(CUT.map((o) => (TOWER.topY - o.centreY) / TOWER.outerRadius))]
    const tol = windowData.photographedPattern.matchToleranceRadii
    const matched = windowData.photographedPattern.rungs.filter((r) =>
      modelRadii.some((m) => Math.abs(m - r.belowCrownRadii) <= tol),
    )
    expect(matched.length).toBe(6)
    // the two without one are storey 5 — passed, not ended — and storey 1
    expect(
      windowData.photographedPattern.rungs
        .filter((r) => !matched.includes(r))
        .map((r) => r.storey)
        .sort(),
    ).toEqual([1, 5])
  })
})

// ——————————————————————— the record stays a question ———————————————————————

describe('the finding is published, not repaired', () => {
  it('leaves the stair where his first answer put it', () => {
    expect(STAIR.startAzimuthDeg).toBeCloseTo(BUTTRESS.azimuthDeg + 90, 6)
  })

  it('leaves every end unruled but the one the footage ruled, and the question unanswered', () => {
    /*
     * head-3-4 stopped being [PLACEHOLDER] on 2026-08-14 — up/098 and down/138
     * show a person at an open pointed window there — and that end is precisely
     * the one this file's question is about, so it is named rather than let
     * through by a loosened predicate. The question itself is still unanswered:
     * knowing that the window exists does not say how far round from the beak it
     * stands, which is what beakSideQuestion asks.
     */
    expect(ALL.filter((o) => o.open !== null).map((o) => o.id)).toEqual(['head-3-4'])
    expect(windowData.beakSideQuestion.answer).toBeNull()
    expect(windowData.beakSideQuestion.ask.join('\n')).toContain('«Встань перед клювом')
  })

  it('offers six candidates and adopts none', () => {
    const c = windowData.reconciliation.candidates
    expect(c.length).toBeGreaterThanOrEqual(5)
    // every one of them names the single observation that would settle it
    for (const x of c) expect(x.observation.length).toBeGreaterThan(0)
    // and the one that would break his 2026-08-06 stacking instruction says so
    expect(c.find((x) => x.id === 'not-feet-and-heads')!.changes).toContain('2026-08-06')
  })
})
