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
import { planAllFlights, stairPassageSections, approachAzimuthDeg } from './staircase'
import {
  buttressDepthAt,
  ladderResidual,
  openButBlindEnds,
  passageEndAnchors,
  passageEndId,
  passageEndPairs,
  planPassageOpenings,
  testimonyConflicts,
  unresolvedEnds,
  validateEndRecord,
  validatePassageOpening,
  type OpeningFitting,
  type PassageOpening,
} from './passageOpenings'
import windowData from '../data/windows.json'

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
    undefined,
    STAIR.doorwayWidth,
  )
  const anchors = passageEndAnchors(flights, tubes, (i, end) =>
    end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
  )
  const openings = planPassageOpenings({
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
  return { settings, flights, tubes, anchors, openings }
}

const BASE = layout()
const BUILT = BASE.openings.filter((o) => o.built)

/** Shortest signed difference a − b, in (−180, 180]. */
const delta = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180

describe('every opening is an end of a flight', () => {
  it('emits one fitting per end, twelve in all', () => {
    expect(BASE.anchors).toHaveLength(WALL_LIFTS.length * 2)
    expect(BASE.openings).toHaveLength(WALL_LIFTS.length * 2)
  })

  it('names them by the lift, not by an array position', () => {
    expect(passageEndId(4, 6, 'head')).toBe('head-4-6')
    expect(new Set(BASE.openings.map((o) => o.id)).size).toBe(BASE.openings.length)
  })

  it('stands each opening on the landing arc, between the cap and the end tread', () => {
    for (const o of BASE.openings) {
      const toCap = delta(o.capAzimuthDeg, o.azimuthDeg)
      const toTread = delta(o.treadAzimuthDeg, o.azimuthDeg)
      // the two ends of the landing lie on opposite sides of the opening
      expect(Math.sign(toCap)).toBe(-Math.sign(toTread))
    }
  })

  it('puts the sill on the landing and the head under the vault', () => {
    for (const o of BASE.openings) expect(validatePassageOpening(o)).toEqual([])
  })

  it('takes its height from the flight, so every opening is a storey apart', () => {
    const heads = BASE.openings.filter((o) => o.end === 'head').map((o) => o.centreY)
    const feet = BASE.openings.filter((o) => o.end === 'foot').map((o) => o.centreY)
    // a flight's head is the next flight's foot: the two sets interleave exactly
    expect(heads.slice(0, -1)).toEqual(feet.slice(1))
  })
})

describe('the reveal fits the passage it is cut from', () => {
  it('ends on the passage cheek, not on the room face', () => {
    for (const o of BASE.openings) {
      expect(o.revealEndRadius).toBeCloseTo(o.cheekRadius, 6)
      // the room face is a metre further in; taking it would hole the chamber
      expect(o.revealEndRadius).toBeGreaterThan(innerRadiusAt(o.centreY) + 0.8)
    }
  })

  it('crosses 2.5–3.6 m of masonry, not the 4.6 m a chamber opening would', () => {
    const depths = BASE.openings.map((o) => TOWER.outerRadius - o.revealEndRadius)
    expect(Math.min(...depths)).toBeGreaterThan(2.4)
    expect(Math.max(...depths)).toBeLessThan(3.6)
    for (const o of BASE.openings) {
      expect(TOWER.outerRadius - o.revealEndRadius).toBeLessThan(
        TOWER.outerRadius - innerRadiusAt(o.centreY),
      )
    }
  })

  it('keeps the inner mouth inside the landing, jamb and all', () => {
    for (const o of BASE.openings) {
      const landingArcDeg = Math.abs(delta(o.capAzimuthDeg, o.treadAzimuthDeg))
      const halfMouthDeg = (o.innerWidth / 2 / o.cheekRadius) * (180 / Math.PI)
      expect(halfMouthDeg + PASSAGE_OPENING.jambMarginDeg).toBeLessThanOrEqual(
        landingArcDeg / 2 + 1e-9,
      )
    }
  })

  it('clamps only what windows.json says was never measured', () => {
    // the recorded 2.4 m inner height does not fit under a 2.30 m vault anywhere
    expect(BASE.openings.every((o) => o.clampedHeight)).toBe(true)
    for (const o of BASE.openings) {
      expect(o.innerHeight).toBeLessThan(2.4)
      // and it still flares, which is the one thing [ref] does state
      expect(o.innerHeight).toBeGreaterThanOrEqual(o.outerHeight)
      expect(o.innerWidth).toBeGreaterThan(o.outerWidth)
    }
    // the OUTER sizes are the photographic reading and are untouched
    expect(BASE.openings.every((o) => o.outerWidth === 0.4 && o.outerHeight === 1.9)).toBe(true)
  })
})

/** Re-plan the shipped anchors against a doctored record. */
function withFittings(fittings: OpeningFitting[], buttressTopY = BEAK_TOP_Y) {
  return planPassageOpenings({
    anchors: BASE.anchors,
    fittings,
    liftLabel: (i) => ({
      from: WALL_LIFTS[i].fromFloorNumber,
      to: WALL_LIFTS[i].toFloorNumber,
    }),
    cfg: PASSAGE_OPENING,
    buttress: BUTTRESS,
    outerRadius: TOWER.outerRadius,
    buttressTopY,
    towerTopY: TOWER.topY,
  })
}

/** As if the owner had answered: every named end open, the rest untouched. */
const said = (open: Record<string, boolean>): OpeningFitting[] =>
  FITTINGS.map((f) =>
    f.id in open ? { ...f, open: open[f.id], openSaidBy: '[OWNER] test' } : f,
  )

describe('the daylight check is a check and no longer the answer', () => {
  it('agrees with the beak the shell is actually extruded from', () => {
    // the root arc [OSM] runs 72.7 → 113.5; the plan test must find the same edges
    expect(buttressDepthAt(60, BUTTRESS, TOWER.outerRadius)).toBe(0)
    expect(buttressDepthAt(140, BUTTRESS, TOWER.outerRadius)).toBe(0)
    expect(buttressDepthAt(BUTTRESS.azimuthDeg, BUTTRESS, TOWER.outerRadius)).toBeGreaterThan(10)
  })

  it('finds the five flight feet that stare into the pier blind', () => {
    const blind = BASE.openings.filter((o) => o.blindBecause === 'buttress')
    expect(blind.map((o) => o.id)).toEqual([
      'foot-2-3',
      'foot-3-4',
      'foot-4-6',
      'foot-6-7',
      'foot-7-8',
    ])
    // not marginal: every one of them looks into ten metres of solid stone
    for (const o of blind) expect(o.buttressDepth).toBeGreaterThan(9)
  })

  it('finds the roof landing blind, with parapet above it and not wall', () => {
    const roof = BASE.openings.find((o) => o.id === 'head-8-9')!
    expect(roof.reachesDaylight).toBe(false)
    expect(roof.blindBecause).toBe('parapet')
    expect(roof.centreY + roof.outerHeight / 2).toBeGreaterThan(TOWER.topY)
  })

  it('cuts six while the record is empty, and says every one is the fallback’s doing', () => {
    expect(BUILT.map((o) => o.id)).toEqual([
      'head-2-3',
      'head-3-4',
      'head-4-6',
      'head-6-7',
      'head-7-8',
      'foot-8-9',
    ])
    for (const o of BUILT) expect(o.buttressDepth).toBe(0)
    // and none of these six is anybody's word — the count is a property of the
    // check standing in, not of the tower
    for (const o of BASE.openings) expect(o.decidedBy).toBe('placeholder')
  })

  it('will not cut an opening into ten metres of pier even when the record says open', () => {
    const openings = withFittings(said({ 'foot-2-3': true }))
    const o = openings.find((x) => x.id === 'foot-2-3')!
    expect(o.built).toBe(false)
    expect(o.conflict).toBe('openButBlind')
    expect(o.decidedBy).toBe('record')
  })

  it('lets the record close an end the check would open', () => {
    const openings = withFittings(said({ 'head-6-7': false }))
    const o = openings.find((x) => x.id === 'head-6-7')!
    expect(o.built).toBe(false)
    expect(o.reachesDaylight).toBe(true)
    expect(o.decidedBy).toBe('record')
    // shut on someone's word is not the same as blind, and the two must not be
    // reported as one thing
    expect(o.blindBecause).toBeUndefined()
    expect(o.conflict).toBeUndefined()
  })

  it('lets the record open an end the check agrees with, on the record’s authority', () => {
    const openings = withFittings(said({ 'head-2-3': true }))
    const o = openings.find((x) => x.id === 'head-2-3')!
    expect(o.built).toBe(true)
    expect(o.decidedBy).toBe('record')
    expect(o.openSaidBy).toBe('[OWNER] test')
    expect(o.conflict).toBeUndefined()
  })
})

/**
 * WHICH ENDS ARE OPEN IS TESTIMONY, AND THE TESTIMONY IS NOT IN THE FILE YET.
 *
 * [OWNER] 2026-08-10, the second time: «в некоторых местах и вначале входа на
 * лестницу и в конце есть окна а в некоторых местах или в начале или в конце» —
 * some passages have an opening at both ends, others at one end only. That is
 * twelve facts, not a rule, and nobody has been asked end by end.
 *
 * These tests pin the state of the record and the shape of the disagreement. They
 * fail if either changes silently, which is the whole of what a test can do while
 * the answer is missing.
 */
describe('the record of which ends are open', () => {
  it('carries an explicit ruling slot on every one of the twelve', () => {
    expect(FITTINGS).toHaveLength(12)
    for (const f of FITTINGS) {
      expect(Object.prototype.hasOwnProperty.call(f, 'open'), f.id).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(f, 'openSaidBy'), f.id).toBe(true)
    }
  })

  it('is empty — all twelve are [PLACEHOLDER] and the model does not pretend otherwise', () => {
    expect(unresolvedEnds(BASE.openings)).toHaveLength(12)
    for (const o of BASE.openings) {
      expect(o.open, o.id).toBeNull()
      expect(o.openSaidBy, o.id).toBeUndefined()
      expect(o.decidedBy, o.id).toBe('placeholder')
    }
  })

  it('refuses a ruling with nobody’s name on it', () => {
    // how a guess becomes a fact three commits later
    const anonymous = { ...FITTINGS[0], open: true, openSaidBy: null }
    expect(validateEndRecord(anonymous).join(' ')).toMatch(/no source/)
    const orphaned = { ...FITTINGS[0], open: null, openSaidBy: '[OWNER] 2026-08-10' }
    expect(validateEndRecord(orphaned).join(' ')).toMatch(/PLACEHOLDER/)
  })

  it('passes its own validation as shipped', () => {
    for (const f of FITTINGS) expect(validateEndRecord(f), f.id).toEqual([])
  })

  it('asks the owner a question he can answer, in the terms he used', () => {
    /*
     * `foot-4-6` is a name this repository invented. The question has to be about
     * the climb, and it has to enumerate all six so none is quietly skipped.
     */
    const q = windowData.openEndsQuestion
    expect(q.passages).toHaveLength(6)
    expect(q.passages.flatMap((p) => p.sets).sort()).toEqual(
      FITTINGS.map((f) => f.id).sort(),
    )
    for (const p of q.passages) expect(p.answer).toBeNull()
    const text = q.note.join(' ')
    // his own four cases, so the answer maps onto the data without interpretation
    expect(text).toMatch(/ТОЛЬКО в начале/)
    expect(text).toMatch(/ТОЛЬКО в конце/)
    expect(text).toMatch(/И ТАМ И ТАМ/)
  })
})

describe('the fallback layout contradicts what the owner described', () => {
  const pairs = passageEndPairs(BASE.openings)

  it('gives five passages an opening at the end only and one at the beginning only', () => {
    expect(pairs.map((p) => `${p.passage} ${p.pattern}`)).toEqual([
      '2-3 endOnly',
      '3-4 endOnly',
      '4-6 endOnly',
      '6-7 endOnly',
      '7-8 endOnly',
      '8-9 beginningOnly',
    ])
  })

  it('gives NO passage an opening at both ends, which is the first case he names', () => {
    /*
     * THE FINDING. «в некоторых местах и вначале … и в конце есть окна» requires
     * at least one. The fallback produces none, and it cannot: the five feet that
     * would supply one stand at azimuth 108.7–110.2 inside a root arc running
     * 72.7–113.5 [OSM].
     *
     * This test asserts the DISAGREEMENT, deliberately. It will fail the day the
     * layout starts agreeing — which is the point: agreement must arrive with a
     * reason (the owner's answer, or a sourced start azimuth), never as a side
     * effect of somebody nudging STAIR.startAzimuthDeg, which is a [PLACEHOLDER]
     * and would be being tuned to make a sentence come true (CLAUDE.md rule 7).
     */
    expect(pairs.filter((p) => p.pattern === 'both')).toEqual([])
    const feet = BASE.openings.filter((o) => o.end === 'foot' && o.blindBecause === 'buttress')
    expect(feet).toHaveLength(5)
    expect(Math.min(...feet.map((o) => o.azimuthDeg))).toBeGreaterThan(108)
    expect(Math.max(...feet.map((o) => o.azimuthDeg))).toBeLessThan(111)
  })

  it('reports both findings as sentences, for the dev console and for the record', () => {
    const lines = testimonyConflicts(BASE.openings)
    expect(lines.some((l) => l.includes('no passage has an opening at both ends'))).toBe(true)
    expect(lines.some((l) => l.includes('12 of 12'))).toBe(true)
    // and it names the thing that must NOT be turned to make the first one go away
    expect(lines.join(' ')).toMatch(/STAIR\.startAzimuthDeg/)
  })

  it('reports an open-but-blind end loudly rather than resolving it either way', () => {
    const openings = withFittings(said({ 'foot-3-4': true }))
    expect(openButBlindEnds(openings).map((o) => o.id)).toEqual(['foot-3-4'])
    const line = testimonyConflicts(openings).find((l) => l.startsWith('foot-3-4'))!
    expect(line).toContain('m of solid buttress')
    expect(line).toContain('Nothing is cut')
    expect(line).toContain('STAIR.startAzimuthDeg')
  })

  it('drops the placeholder census once the record is filled in, and keeps the rest', () => {
    /*
     * Proof that the report is not merely always-on noise: answer all twelve and
     * the "nobody has ruled" line goes. What does NOT go is the finding about
     * `both`, because that one is about the building and not about the file.
     *
     * The answer used here is the fallback's own layout, which is the only
     * complete answer that raises no per-end conflict — see the next test for
     * why that is a damning fact rather than a convenient one.
     */
    const complete = FITTINGS.map((f) => ({
      ...f,
      open: BUILT.some((b) => b.id === f.id),
      openSaidBy: '[OWNER] test',
    }))
    const openings = withFittings(complete)
    for (const o of openings) expect(o.decidedBy).toBe('record')
    expect(openings.filter((o) => o.built).map((o) => o.id)).toEqual(BUILT.map((o) => o.id))
    const lines = testimonyConflicts(openings)
    expect(lines.some((l) => l.includes('carry no ruling'))).toBe(false)
    expect(lines.some((l) => l.includes('no passage has an opening at both ends'))).toBe(true)
  })

  it('cannot be satisfied by ANY answer at this start azimuth, and that is the finding', () => {
    /*
     * THE SHARPEST FORM OF THE CONTRADICTION, proved by enumeration rather than
     * argued.
     *
     * For a passage to come out `both`, the owner has to open its foot AND its
     * head. Take each of the six in turn and mark both ends open: every single
     * one raises an openButBlind conflict, because at STAIR.startAzimuthDeg = 100
     * five of the six feet are inside the buttress and the sixth passage's head
     * is under the parapet. There is no answer he can give that the model can
     * honour.
     *
     * So the thing that has to move is the placeholder bearing, not the
     * testimony. It must move because somebody measures it or because he says
     * which way the stair turns — never because it silences this test. Turning it
     * four degrees would clear the feet and make all of this quiet, and that is
     * precisely the fit CLAUDE.md rule 7 forbids.
     */
    const impossible: string[] = []
    for (const p of passageEndPairs(BASE.openings)) {
      const openings = withFittings(
        said({ [`foot-${p.passage}`]: true, [`head-${p.passage}`]: true }),
      )
      const blind = openButBlindEnds(openings).map((o) => o.id)
      if (blind.length === 0) continue
      impossible.push(`${p.passage}: ${blind.join(', ')}`)
    }
    expect(impossible).toEqual([
      '2-3: foot-2-3',
      '3-4: foot-3-4',
      '4-6: foot-4-6',
      '6-7: foot-6-7',
      '7-8: foot-7-8',
      '8-9: head-8-9',
    ])
  })
})

/**
 * THE COUNT DOES NOT MATCH AND THIS TEST DOES NOT PRETEND OTHERWISE.
 *
 * Six openings are derived from the owner's rule; eleven exterior photographs
 * found eight slits. Asserting agreement would be asserting something untrue, so
 * these pin the DISAGREEMENT instead: they fail if it silently changes size,
 * which is the only useful thing a test can do here.
 */
describe('what the photographs still say, and how far the model stands from it', () => {
  const r = ladderResidual(BASE.openings, LADDER, TOWER.height)

  it('is two openings short of the photographed count', () => {
    expect(r.count).toBe(6)
    expect(LADDER.count).toBe(8)
    expect(r.countResidual).toBe(-2)
  })

  it('spreads its two columns three times as far as the photographs do', () => {
    // a flight's own sweep, which is (rise/riser) × (going/midRadius) and so is
    // not a free parameter — see ladderResidual()
    expect(r.separationDeg).toBeGreaterThan(85)
    expect(r.separationDeg).toBeLessThan(110)
    expect(LADDER.separationDeg).toBe(35)
    expect(Math.abs(r.separationResidual)).toBeGreaterThan(LADDER.separationSpreadDeg * 5)
  })

  it('steps up the tower by the storey where the photographs step by 2.78 m', () => {
    expect(r.rungSpacing).toBeCloseTo(3.281, 2)
    expect(r.photographedRungSpacing).toBeCloseTo(2.781, 2)
    expect(r.rungResidual).toBeGreaterThan(0.4)
  })

  it('keeps the photographic reading in the file, undeleted', () => {
    const ids = LADDER.columns.flatMap((c) => (c as unknown as { ids: string[] }).ids)
    expect(ids).toEqual([
      'lower-1',
      'lower-2',
      'lower-3',
      'lower-4',
      'upper-1',
      'upper-2',
      'upper-3',
      'upper-4',
    ])
    expect(LADDER.columns.flatMap((c) => c.heightFractions)).toEqual([
      0.28, 0.41, 0.51, 0.61, 0.67, 0.77, 0.84, 0.94,
    ])
  })
})

describe('the two columns are what stacked flights produce, not what was fitted', () => {
  it('holds the feet on one bearing to a degree, as the lower column reads', () => {
    // the roof climb starts further round because its interior landing is paid
    // for in arc; the five that do not have one share a bearing
    const feet = BASE.openings
      .filter((o) => o.end === 'foot' && o.flightIndex < 5)
      .map((o) => o.azimuthDeg)
    expect(Math.max(...feet) - Math.min(...feet)).toBeLessThan(1.6)
  })

  it('drifts the heads, and the drift is the wall getting thinner', () => {
    const heads = BASE.openings
      .filter((o) => o.end === 'head' && o.flightIndex !== 2)
      .sort((a, b) => a.centreY - b.centreY)
    const bearings = heads.map((o) => o.azimuthDeg)
    // monotone upward — each flight higher up sweeps less arc
    for (let i = 1; i < bearings.length; i += 1) {
      expect(bearings[i]).toBeGreaterThan(bearings[i - 1])
    }
    // and the mechanism: the cheek radius grows as the wall thins
    const radii = heads.map((o) => o.cheekRadius)
    for (let i = 1; i < radii.length; i += 1) expect(radii[i]).toBeGreaterThan(radii[i - 1])
  })
})

describe('the start azimuth now sets the façade', () => {
  it('moves every opening when it moves', () => {
    const turned = layout({ startAzimuthDeg: STAIR.startAzimuthDeg + 40 })
    for (const o of BASE.openings) {
      const t = turned.openings.find((x) => x.id === o.id)!
      expect(delta(t.azimuthDeg, o.azimuthDeg)).toBeCloseTo(40, 3)
    }
  })

  it('changes how many openings the tower has when it moves', () => {
    // not an assertion about the right value — a demonstration that a
    // [PLACEHOLDER] is now deciding the exterior
    const turned = layout({ startAzimuthDeg: STAIR.startAzimuthDeg + 40 })
    expect(turned.openings.filter((o) => o.built).length).not.toBe(BUILT.length)
  })

  it('mirrors the whole set when the winding is flipped', () => {
    const flipped = layout({ winding: 'clockwise' })
    const moved = flipped.openings.filter((o) => {
      const b = BASE.openings.find((x) => x.id === o.id)!
      return Math.abs(delta(o.azimuthDeg, b.azimuthDeg)) > 5
    })
    expect(moved.length).toBeGreaterThan(BASE.openings.length / 2)
  })
})

describe('a slit at a passage end cannot be entered', () => {
  /*
   * The old argument — "the walker never reaches it" — died with the chamber
   * openings: the walker now stands on the landing about a metre from a mouth
   * 1.45 m wide. The replacement is that the reveal begins exactly where the
   * passage's own outer collider band begins, and lies wholly inside that band's
   * height. Checked here rather than asserted in a comment.
   */
  it('starts at the cheek the passage colliders already close', () => {
    for (const o of BUILT) {
      const tube = BASE.tubes[o.flightIndex]
      const cap = o.end === 'foot' ? tube[0] : tube[tube.length - 1]
      expect(o.revealEndRadius).toBeCloseTo(cap.outerRadius, 6)
      expect(o.centreY - o.outerHeight / 2).toBeGreaterThanOrEqual(cap.bottomY)
      expect(o.centreY + o.outerHeight / 2).toBeLessThanOrEqual(cap.topY)
    }
  })

  it('sits clear of the doorway at the same end, so the two are separate holes', () => {
    for (const o of BUILT) {
      const steps = BASE.flights[o.flightIndex]
      const tread = o.end === 'foot' ? steps[0] : steps[steps.length - 1]
      const doorAz = approachAzimuthDeg(steps, tread, BASE.settings.width)
      expect(Math.abs(delta(o.azimuthDeg, doorAz))).toBeGreaterThan(3)
    }
  })

  it('keeps its sill clear of the stair-bearing haunch, which is why the clip is a no-op', () => {
    /*
     * WHY A TEST FOR SOMETHING THAT CURRENTLY DOES NOTHING.
     *
     * WindowCut.clipAgainstStairBearing is false for every slit, and the first
     * draft of that field's note justified it by claiming the clip would
     * otherwise "erase the whole reveal". Measured, it would not: stairBearingClip()
     * is a haunch UNDER the passage floor, running bottomY − 2·floorSlab to
     * bottomY + 0.05, and a slit's sill stands one slab above the landing. On all
     * six built slits the haunch tops out at landing +0.03 against a sill at
     * landing +0.30 — they miss by 0.27 m, and forcing the clip back on leaves
     * the built shell pierced exactly as before.
     *
     * The claim was corrected rather than kept, and this is what stops it being
     * re-invented: the flag is safe only while this clearance is positive. Take
     * PASSAGE_OPENING.sillAboveLanding to zero, or deepen the haunch, and the two
     * volumes start to overlap — at which point the flag stops being cosmetic and
     * the old sentence would become true after all.
     */
    for (const o of BUILT) {
      const tube = BASE.tubes[o.flightIndex]
      const cap = o.end === 'foot' ? tube[0] : tube[tube.length - 1]
      const haunchTop = cap.bottomY + 0.05 // the lap, from stairBearingClip()
      const sill = o.centreY - o.outerHeight / 2
      expect(sill - haunchTop, `${o.id} sill above the haunch`).toBeGreaterThan(0.2)
    }
  })
})

describe('the buttress head decides the count', () => {
  it('adds two feet at the low reading, which is a consequence and not a result', () => {
    /*
     * config/tower.ts records two irreconcilable readings of where the pier
     * stops: level with the parapet, and 18.3 ± 0.5 m. At the low one the feet of
     * 6→7 and 7→8 rise clear of it. That takes the derived count to eight — the
     * photographed number — and it MUST NOT be quoted as evidence for the low
     * buttress. It is recorded because an unresolved silhouette now decides how
     * many openings the building has.
     */
    const low = planPassageOpenings({
      anchors: BASE.anchors,
      fittings: FITTINGS,
      liftLabel: (i) => ({
        from: WALL_LIFTS[i].fromFloorNumber,
        to: WALL_LIFTS[i].toFloorNumber,
      }),
      cfg: PASSAGE_OPENING,
      buttress: BUTTRESS,
      outerRadius: TOWER.outerRadius,
      buttressTopY: TOWER.groundY + 18.3,
      towerTopY: TOWER.topY,
    })
    const built: PassageOpening[] = low.filter((o) => o.built)
    expect(built.map((o) => o.id)).toContain('foot-6-7')
    expect(built.map((o) => o.id)).toContain('foot-7-8')
    expect(built).toHaveLength(8)
  })
})

describe('the solstice flag stays unassigned (CLAUDE.md rule 7)', () => {
  it('designates no aperture at any end', () => {
    expect(BASE.openings.some((o) => o.solsticeAligned)).toBe(false)
  })

  it('has not been quietly set on whichever opening sits near the solstice bearing', () => {
    // winter-solstice sunrise at Baku is about 120.7°; the nearest built opening
    // is the foot of the roof climb at ~122, which is exactly the kind of near
    // miss that must NOT decide Phase 8 in advance
    const near = BUILT.filter((o) => Math.abs(delta(o.azimuthDeg, 120.7)) < 15)
    expect(near.length).toBeGreaterThan(0)
    expect(near.some((o) => o.solsticeAligned)).toBe(false)
  })
})
