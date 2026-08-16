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
import {
  planAllFlights,
  stairDoorways,
  stairPassageSections,
  approachAzimuthDeg,
} from './staircase'
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
    TOWER.topY,
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
  /*
   * The doorways of the SAME layout, because a slit and the doorway at its end
   * are two holes in one landing and this file now asserts how they sit relative
   * to each other. Planned here rather than imported so an override that turns
   * the stair moves both together.
   */
  const doorways = stairDoorways(
    flights,
    settings.width,
    STAIR.doorwayHeight,
    innerRadiusAt,
    (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
    TOWER.topY,
    WALL_LIFTS.map((l) => l.opensAtY),
    STAIR.doorwayWidth,
  )
  return { settings, flights, tubes, anchors, openings, doorways }
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
    /*
     * Every end EXCEPT the one with no wall over it. head-8-9's landing is the
     * roof deck and its crown is the top of the tower, 0.751 m up, so its reveal
     * fits to nothing at all — which is the right answer and not a shape. See the
     * early return in validatePassageOpening(). Before the passage cutter was
     * clamped to the masonry this end reported a crown at 29.049 m, in open air,
     * and a 2.0 m reveal fitted comfortably under it.
     */
    for (const o of BASE.openings.filter((x) => x.blindBecause !== 'parapet')) {
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
/**
 * A hypothetical record: the named ends ruled, every other end blank.
 *
 * IT BLANKS THE REST DELIBERATELY, and that changed on 2026-08-14. It used to
 * start from the shipped fittings, which was harmless while all twelve of them
 * were [PLACEHOLDER]. head-3-4 now ships `open: true` on the footage's word, so
 * starting from the shipped record would leak that one real datum into every
 * "suppose he said X" case below and make each of them a test of two claims at
 * once — which is how the both-ends enumeration started naming head-3-4 as the
 * obstacle in passages it is not even part of.
 */
const said = (open: Record<string, boolean>): OpeningFitting[] =>
  FITTINGS.map((f) =>
    f.id in open
      ? { ...f, open: open[f.id], openSaidBy: '[OWNER] test' }
      : { ...f, open: null, openSaidBy: null },
  )

describe('the daylight check is a check and no longer the answer', () => {
  it('agrees with the beak the shell is actually extruded from', () => {
    // the root arc [OSM] runs 72.7 → 113.5; the plan test must find the same edges
    expect(buttressDepthAt(60, BUTTRESS, TOWER.outerRadius)).toBe(0)
    expect(buttressDepthAt(140, BUTTRESS, TOWER.outerRadius)).toBe(0)
    expect(buttressDepthAt(BUTTRESS.azimuthDeg, BUTTRESS, TOWER.outerRadius)).toBeGreaterThan(10)
  })

  it('finds the two lowest heads that stare into the pier blind', () => {
    /*
     * IT WAS FIVE FEET UNTIL 2026-08-13, and the swap is the whole of the
     * owner's quarter turn. At startAzimuthDeg 100 the feet stood at azimuth
     * 108.7–110.2, inside a root arc running 72.7–113.5 [OSM], and every one of
     * them looked into 10.21–10.55 m of pier. At 196.7 they stand at 205.4–218.5
     * and are clear; two heads take their place, both on the low flights, at
     * 9.88 m and 10.64 m.
     */
    const blind = BASE.openings.filter((o) => o.blindBecause === 'buttress')
    expect(blind.map((o) => o.id)).toEqual(['head-2-3', 'head-3-4'])
    // not marginal: both look into most of ten metres of solid stone
    for (const o of blind) expect(o.buttressDepth).toBeGreaterThan(9)
    // and every foot is clear, which is what he said and not what was aimed at
    for (const o of BASE.openings.filter((x) => x.end === 'foot')) {
      expect(o.buttressDepth, o.id).toBe(0)
    }
  })

  it('opens head-6-7 by one tenth of a degree, and that must not pass unsaid', () => {
    /*
     * THE KNIFE EDGE. The pier's daylight edge is at azimuth 113.5 [OSM] and
     * head-6-7's landing centre comes out at 113.63 — 0.13° clear, which is 14 mm
     * on the drum face. Nothing about that opening is decided by evidence about
     * the building; it is decided by the fourth significant figure of a satellite
     * trace, and one turn of the leva slider either way deletes or restores it.
     *
     * Pinned so it cannot become invisible. If a survey ever moves
     * BUTTRESS.azimuthDeg or the root arc, this fails, and it SHOULD: whoever
     * moves it has to look at what happened to this end.
     */
    const o = BASE.openings.find((x) => x.id === 'head-6-7')!
    expect(o.built).toBe(true)
    expect(o.buttressDepth).toBe(0)
    const edge = BUTTRESS.azimuthDeg - BUTTRESS.skewDeg + BUTTRESS.rootArcDeg / 2
    expect(edge).toBeCloseTo(113.5, 1)
    expect(o.azimuthDeg - edge).toBeGreaterThan(0)
    expect(o.azimuthDeg - edge).toBeLessThan(0.2)
    // the next one up is barely better
    expect(BASE.openings.find((x) => x.id === 'head-7-8')!.azimuthDeg - edge).toBeLessThan(3)
  })

  it('finds the roof landing blind, with parapet above it and not wall', () => {
    const roof = BASE.openings.find((o) => o.id === 'head-8-9')!
    expect(roof.reachesDaylight).toBe(false)
    expect(roof.blindBecause).toBe('parapet')
    expect(roof.centreY + roof.outerHeight / 2).toBeGreaterThan(TOWER.topY)
  })

  it('cuts nine while the record is empty, and says every one is the fallback’s doing', () => {
    /*
     * SIX BEFORE 2026-08-13, and the owner's separate complaint was that the
     * tower has TOO FEW openings. Nine is what the quarter turn produces. It is
     * still the FALLBACK's count and not the building's — every one of the twelve
     * ends is [PLACEHOLDER] and the daylight check is standing in for all of them.
     */
    expect(BUILT.map((o) => o.id)).toEqual([
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
    for (const o of BUILT) expect(o.buttressDepth).toBe(0)
    // and none of these nine is anybody's word — the count is a property of the
    // check standing in, not of the tower. ELEVEN, not twelve, since 2026-08-14:
    // head-3-4 is ruled open by the footage and is still not among the nine,
    // because the geometry will not light it. That pair is the finding.
    for (const o of BASE.openings) {
      expect(o.decidedBy, o.id).toBe(o.id === 'head-3-4' ? 'record' : 'placeholder')
    }
    expect(BUILT.map((o) => o.id)).not.toContain('head-3-4')
  })

  it('will not cut an opening into ten metres of pier even when the record says open', () => {
    const openings = withFittings(said({ 'head-3-4': true }))
    const o = openings.find((x) => x.id === 'head-3-4')!
    expect(o.built).toBe(false)
    expect(o.conflict).toBe('openButBlind')
    expect(o.decidedBy).toBe('record')
  })

  it('lets the record close an end the check would open', () => {
    /*
     * foot-2-3, not head-6-7 as this used to read. head-6-7 clears the pier by
     * 0.13°, so a test written on it would be asserting the behaviour of the
     * record against an end whose daylight is itself a coin toss.
     */
    const openings = withFittings(said({ 'foot-2-3': false }))
    const o = openings.find((x) => x.id === 'foot-2-3')!
    expect(o.built).toBe(false)
    expect(o.reachesDaylight).toBe(true)
    expect(o.decidedBy).toBe('record')
    // shut on someone's word is not the same as blind, and the two must not be
    // reported as one thing
    expect(o.blindBecause).toBeUndefined()
    expect(o.conflict).toBeUndefined()
  })

  it('lets the record open an end the check agrees with, on the record’s authority', () => {
    const openings = withFittings(said({ 'foot-2-3': true }))
    const o = openings.find((x) => x.id === 'foot-2-3')!
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

  it('is empty on eleven of the twelve, and names the one that is not', () => {
    /*
     * It was twelve of twelve until 2026-08-14, and the one that moved did not
     * move because anybody was asked: the walkthrough footage shows a person
     * standing at head-3-4 at an open pointed window over the avenue, which is a
     * ruling on that end whether or not the question was ever put. Everything
     * else is still blank and the model still says so.
     */
    expect(unresolvedEnds(BASE.openings)).toHaveLength(11)
    for (const o of BASE.openings) {
      if (o.id === 'head-3-4') {
        expect(o.open).toBe(true)
        expect(o.openSaidBy).toContain('[VIDEO]')
        expect(o.decidedBy).toBe('record')
        continue
      }
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

  it('leaves the two faults he named on 2026-08-13 where the evidence leaves them', () => {
    /*
     * [OWNER] 2026-08-13 said two more things are wrong — the shape of the heads,
     * and the height of the sill above the landing — and did NOT say what either
     * should be. Until 2026-08-14 neither value had been touched and this test
     * asserted that both were still open.
     *
     * HIS OWN WALKTHROUGH FOOTAGE THEN ANSWERED ONE OF THEM AND NOT THE OTHER,
     * which is why the two are no longer asserted the same way:
     *
     *   HEAD SHAPE — answered. Every opening on the route has a flat stone lintel
     *   over it except one two-centred pointed window at the head of the 3→4
     *   climb, and no opening anywhere has a semicircular head. Read four times
     *   over the frames independently, agreeing. So the values MOVED, and the
     *   record of whose word moved them has to be in the file.
     *
     *   SILL — not answered, and cannot be from these frames: there is no scale
     *   object in any of them. The value is untouched. What the footage did take
     *   away is the BOUND, which is asserted below.
     *
     * The questions still cannot rot into decoration: every `answer` is null and
     * the moment one stops being null this fails, which is the prompt to go and
     * change the value it names.
     */
    const climbs = windowData.openEndsQuestion.passages.map((p) => p.climb)
    const ids = FITTINGS.map((f) => f.id).sort()
    for (const q of [windowData.headShapeQuestion, windowData.sillHeightQuestion]) {
      // same six climbs, in the same words, so three questions read as one survey
      expect(q.climbs.map((c) => c.climb)).toEqual(climbs)
      expect(q.climbs.flatMap((c) => c.sets).sort()).toEqual(ids)
      for (const c of q.climbs) expect(c.answer, c.climb).toBeNull()
      // asked in Russian, which is the language every statement came in
      expect(q.note.join(' ')).toMatch(/[а-яА-ЯёЁ]{4}/)
      // `ask` is the short form App.tsx prints; it must still carry a sentence he
      // can answer, verbatim, and stay short enough to read at the console
      const ask = q.ask.join('\n')
      expect(ask).toMatch(/«[^»]+»/)
      expect(q.ask.length).toBeLessThan(20)
    }

    // HEAD SHAPE: moved, and by a named authority. An id-level change with no
    // source on it is exactly how a reading becomes a fact three commits later.
    expect(windowData.headShapeQuestion.answeredBy).toMatch(/\[VIDEO\]/)
    for (const c of windowData.headShapeQuestion.climbs) {
      for (const id of c.sets) {
        expect(FITTINGS.find((f) => f.id === id)!.head, id).toBeDefined()
      }
    }

    // SILL: narrowed by the same footage, and the value it asks about untouched.
    expect(windowData.sillHeightQuestion.narrowedBy).toMatch(/\[VIDEO\]/)
    expect(PASSAGE_OPENING.sillAboveLanding).toBe(
      windowData.sillHeightQuestion.current.sillAboveLanding,
    )
  })

  it('withdraws the sill bound the footage took the premise out from under', () => {
    /*
     * THE ARITHMETIC WAS NEVER WRONG AND THE PREMISE UNDER IT WAS. The sill used
     * to be bounded above by the vault: PLAYER.stairHeadroom 2.30 less the 1.90 m
     * opening leaves 0.40 m, so a sill had to sit in 0…0.40 or its head stood
     * inside the vault. That subtraction assumed the whole opening is cut in the
     * wall OF THE LANDING it opens off.
     *
     * [VIDEO] 2026-08-14 says it is not. The opening stands at the far end of the
     * passage, over treads that are still climbing — up/218 shows two steps rising
     * inside the embrasure to the sill, down/124 shows three, up/168 shows the sill
     * block two courses above the tread under it. Nothing about the clear height
     * over the landing constrains a sill reached that way, so the bound is
     * withdrawn rather than raised: `boundedAboveBy` is null and says why.
     *
     * The subtraction itself is still pinned, because it is what makes the
     * withdrawal legible — and because if headroom or the opening height ever
     * moves, the paragraph explaining the withdrawal goes stale with it.
     */
    const wouldBeBound = PLAYER.stairHeadroom - FITTINGS[0].outerHeight
    expect(wouldBeBound).toBeCloseTo(0.4, 6)
    expect(windowData.sillHeightQuestion.current.boundedAboveBy).toBeNull()
    expect(windowData.sillHeightQuestion.current.boundNote).toMatch(/\[VIDEO\]|footage|climbing/)

    // and refuting a bound is not measuring a sill: the shipped value is unmoved
    expect(PASSAGE_OPENING.sillAboveLanding).toBeCloseTo(0.3, 9)
  })
})

/**
 * THE CONTRADICTION THIS BLOCK WAS WRITTEN TO PIN HAS GONE, AND HOW IT WENT IS
 * THE ONLY THING THAT MAKES THAT ACCEPTABLE.
 *
 * Until 2026-08-13 these tests asserted a DISAGREEMENT: [OWNER] 2026-08-10 said
 * some passages carry an opening at both ends, the fallback produced none, and no
 * answer he could give was honourable because every passage had a blind end. The
 * comment on the old version said in terms that agreement must arrive with a
 * reason and never as a side effect of nudging STAIR.startAzimuthDeg.
 *
 * It arrived with a reason. He was asked a DIFFERENT question — where the stair
 * entrance stands relative to the beak, looking down — and answered a quarter
 * turn clockwise. That is testimony about the stair, not about the openings, and
 * the layout it produces happens to have three passages open at both ends and
 * three at one end only, which is the shape of his earlier sentence.
 *
 * READ THAT AS CORROBORATION AND NOT AS A RESULT. Nobody searched for an angle
 * that made the sentence true: 196.7 is 106.7 + 90 and the 90 is his word
 * "right". Had it come out contradicting him again, it would have shipped
 * contradicting him again. The tests below therefore pin the AGREEMENT the same
 * way they used to pin the disagreement — so that if it silently reverses,
 * something says so.
 */
describe('the fallback layout now has the shape the owner described', () => {
  const pairs = passageEndPairs(BASE.openings)

  it('gives three passages an opening at both ends and three at the beginning only', () => {
    expect(pairs.map((p) => `${p.passage} ${p.pattern}`)).toEqual([
      '2-3 beginningOnly',
      '3-4 beginningOnly',
      '4-6 both',
      '6-7 both',
      '7-8 both',
      '8-9 beginningOnly',
    ])
  })

  it('has at last an example of the case he names first, and it was not aimed at', () => {
    /*
     * «в некоторых местах и вначале … и в конце есть окна а в некоторых местах
     * или в начале или в конце» — some passages have both, others one end only.
     * Both halves of that sentence now have examples in the model, which no
     * setting of the old start azimuth could produce (see the enumeration below).
     *
     * `endOnly` has none, and that is left standing as the residual rather than
     * smoothed away: he names the case, and the two heads that would supply it —
     * head-2-3 and head-3-4 — are inside the pier.
     */
    expect(pairs.filter((p) => p.pattern === 'both').map((p) => p.passage)).toEqual([
      '4-6',
      '6-7',
      '7-8',
    ])
    expect(pairs.filter((p) => p.pattern === 'endOnly')).toEqual([])
    expect(pairs.filter((p) => p.pattern === 'neither')).toEqual([])
  })

  it('stops reporting the both-ends finding, and reports the record’s one hole and its one clash', () => {
    const lines = testimonyConflicts(BASE.openings)
    // the finding this file was built around is answered, and silence is correct
    expect(lines.some((l) => l.includes('no passage has an opening at both ends'))).toBe(false)
    // eleven ends nobody has ruled on, since head-3-4 was ruled by the footage
    expect(lines.some((l) => l.includes('11 of 12'))).toBe(true)
    // and the new line, which is the whole of 2026-08-14's finding in one string
    expect(lines.some((l) => l.startsWith('head-3-4') && l.includes('solid buttress'))).toBe(true)
  })

  it('reports an open-but-blind end loudly rather than resolving it either way', () => {
    const openings = withFittings(said({ 'head-3-4': true }))
    expect(openButBlindEnds(openings).map((o) => o.id)).toEqual(['head-3-4'])
    const line = testimonyConflicts(openings).find((l) => l.startsWith('head-3-4'))!
    expect(line).toContain('m of solid buttress')
    expect(line).toContain('Nothing is cut')
    expect(line).toContain('STAIR.startAzimuthDeg')
  })

  it('falls silent once the record is filled in, which it never could before', () => {
    /*
     * Proof that the report is not always-on noise. Answer all twelve and every
     * line goes — where before 2026-08-13 one line could not go, because the
     * layout itself contradicted the testimony and no answer repaired it.
     *
     * The answer used here is the fallback's own layout, which is still the only
     * complete answer that raises no per-end conflict. That is no longer a
     * damning fact, only an unsurprising one: the fallback cuts exactly the ends
     * the geometry can light.
     */
    const complete = FITTINGS.map((f) => ({
      ...f,
      open: BUILT.some((b) => b.id === f.id),
      openSaidBy: '[OWNER] test',
    }))
    const openings = withFittings(complete)
    for (const o of openings) expect(o.decidedBy).toBe('record')
    expect(openings.filter((o) => o.built).map((o) => o.id)).toEqual(BUILT.map((o) => o.id))
    expect(testimonyConflicts(openings)).toEqual([])
  })

  it('can honour “both ends” on three of the six, and names the three it cannot', () => {
    /*
     * THE SAME ENUMERATION AS BEFORE, WITH THE OPPOSITE RESULT — and it is kept
     * in that form deliberately, because the old version's value was that it
     * proved impossibility by exhaustion rather than by argument.
     *
     * Mark both ends of each passage open in turn. Three come through clean. The
     * three that do not are the two lowest climbs, whose heads look into the
     * pier, and the roof climb, whose head is on the deck with parapet over it
     * rather than wall. If he answers «и там и там» for 2→3 or 3→4, the model
     * will refuse to cut and will say why — which is the right behaviour and the
     * next real question about this tower.
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
    expect(impossible).toEqual(['2-3: head-2-3', '3-4: head-3-4', '8-9: head-8-9'])
  })
})

/**
 * THE COUNT DOES NOT MATCH AND THIS TEST DOES NOT PRETEND OTHERWISE.
 *
 * Nine openings are derived from the owner's rule; eleven exterior photographs
 * found eight slits. Asserting agreement would be asserting something untrue, so
 * these pin the DISAGREEMENT instead: they fail if it silently changes size,
 * which is the only useful thing a test can do here.
 */
describe('what the photographs still say, and how far the model stands from it', () => {
  const r = ladderResidual(BASE.openings, LADDER, TOWER.height)

  it('is one opening OVER the photographed count, having been two under', () => {
    /*
     * The sign flipped on 2026-08-13. Six against eight became nine against
     * eight, and the owner's own complaint — that the tower has too few openings
     * — is answered by the same quarter turn that moved the stair.
     *
     * One over is not agreement and is not treated as any. It is a smaller
     * residual arrived at from the other side, and the count is still a property
     * of a daylight check standing in for twelve unanswered questions.
     */
    expect(r.count).toBe(9)
    expect(LADDER.count).toBe(8)
    expect(r.countResidual).toBe(1)
  })

  it('spreads its two columns three times as far as the photographs do', () => {
    // a flight's own sweep, which is (rise/riser) × (going/midRadius) and so is
    // not a free parameter — see ladderResidual()
    expect(r.separationDeg).toBeGreaterThan(85)
    expect(r.separationDeg).toBeLessThan(110)
    expect(LADDER.separationDeg).toBe(35)
    expect(Math.abs(r.separationResidual)).toBeGreaterThan(LADDER.separationSpreadDeg * 5)
  })

  it('steps up the tower a little TIGHTER than the photographs, having stepped wider', () => {
    /*
     * A residual that changed sign without anybody touching the floor table, and
     * the reason is worth stating because it is easy to read this as progress.
     *
     * The derived ladder used to step by exactly one storey — 3.281 m — because
     * the six cut ends were one per flight. With nine cut ends, several flights
     * now carry an opening at BOTH levels, so the mean gap between successive
     * openings falls to 2.461 m against 2.781 photographed. The residual went
     * from +0.500 to −0.321.
     *
     * NOTHING ABOUT THE STOREY HEIGHTS HAS BEEN CORRECTED. rungSpacing is the
     * mean gap over whatever set is cut, so it moves when the COUNT moves, and
     * the count here is a fallback's. The conflict this figure was recording —
     * that the photographed ladder does not step by the derived storey — is not
     * settled by the number getting smaller.
     */
    expect(r.rungSpacing).toBeCloseTo(2.461, 2)
    expect(r.photographedRungSpacing).toBeCloseTo(2.781, 2)
    expect(r.rungResidual).toBeLessThan(-0.3)
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

  it('shares a bearing with the doorway at the same end and is told apart by radius', () => {
    /*
     * THIS ASSERTION USED TO READ "SITS CLEAR OF THE DOORWAY", more than 3° of
     * drum away, and that was the fault rather than the property. The two holes
     * are at opposite ends of the same radial: the doorway runs from inside the
     * chamber out to the passage, the reveal from the passage's far cheek out to
     * the drum face, and the void a man stands in is what separates them. Nothing
     * ever required them to be on different bearings, and while they were, the
     * man standing in one was looking 25° off the other — see
     * stairApproachSide.test.ts and [OWNER] 2026-08-16 and -08-17.
     *
     * So the separation is stated where it actually lives. The doorway's tool
     * overshoots the passage's outer cheek by exactly (doorwayWidth − width) / 2
     * = 0.100 m, which is the margin that makes the opening a hole rather than a
     * blind recess, and stops 2.57–3.44 m short of the drum.
     */
    for (const o of BUILT) {
      const steps = BASE.flights[o.flightIndex]
      const tread = o.end === 'foot' ? steps[0] : steps[steps.length - 1]
      const doorAz = approachAzimuthDeg(steps, tread, BASE.settings.width, STAIR.doorwayWidth)
      expect(Math.abs(delta(o.azimuthDeg, doorAz)), `${o.id} bearing`).toBeCloseTo(0, 9)
      const doorway = BASE.doorways.find(
        (d) =>
          Math.abs(delta(d.azimuthDeg, o.azimuthDeg)) < 1e-9 &&
          d.bottomY < o.centreY &&
          d.topY > o.centreY - o.innerHeight / 2,
      )
      expect(doorway, `${o.id} has no doorway on its own bearing`).toBeTruthy()
      expect(doorway!.outerRadius - o.revealEndRadius, `${o.id} overshoot`).toBeCloseTo(
        (STAIR.doorwayWidth - BASE.settings.width) / 2,
        9,
      )
      expect(TOWER.outerRadius - doorway!.outerRadius, `${o.id} reach`).toBeGreaterThan(2.5)
    }
  })

  it('swallows that overshoot in its own reveal, all but a strip at the sill', () => {
    /*
     * WHAT THE CONCENTRIC ARRANGEMENT BOUGHT, measured because the overshoot is
     * the one thing that could have gone wrong by putting the two holes on one
     * radial. The doorway's 0.100 m of overreach recesses the passage's outer
     * cheek across its own width and height. On a bearing of its own that was a
     * shallow blind pocket 1.69 m tall standing BESIDE the window. On the slit's
     * bearing it is inside the reveal — the mouth is 3.2–3.5° wider than the
     * doorway either side and its head stands 0.56 m above the doorway's — except
     * for a 0.250 m strip under the sill, which reads as the reveal's own base
     * rather than as a second hole.
     */
    for (const o of BUILT) {
      const doorway = BASE.doorways.find(
        (d) => Math.abs(delta(d.azimuthDeg, o.azimuthDeg)) < 1e-9 && d.bottomY < o.centreY,
      )!
      const mouthHalfDeg = (o.innerWidth / 2 / o.revealEndRadius) * (180 / Math.PI)
      expect(mouthHalfDeg - doorway.widthDeg / 2, `${o.id} width`).toBeGreaterThan(1.1)
      expect(
        o.centreY + o.innerHeight / 2 - doorway.topY,
        `${o.id} head`,
      ).toBeGreaterThan(0.5)
      expect(
        o.centreY - o.innerHeight / 2 - doorway.bottomY,
        `${o.id} strip below the sill`,
      ).toBeCloseTo(0.25, 3)
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

describe('the buttress head no longer decides the count', () => {
  it('changes nothing at the low reading, where it used to add two openings', () => {
    /*
     * config/tower.ts records two irreconcilable readings of where the pier
     * stops: level with the parapet, and 18.3 ± 0.5 m. Until 2026-08-13 that
     * unresolved silhouette decided how many openings the tower had — at the low
     * reading the feet of 6→7 and 7→8 rose clear of the pier and the count went
     * from six to eight, which is the photographed number, and the file was at
     * pains to say that was NOT evidence for the low buttress.
     *
     * The quarter turn takes the question away. The only two ends still inside
     * the pier are head-2-3 at y 8.31 and head-3-4 at 11.59, both far below
     * either reading of where it stops, so both readings now cut the same nine.
     * One fewer thing hanging off an unresolved silhouette, and it came free.
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
    expect(built.map((o) => o.id)).toEqual(BUILT.map((o) => o.id))
    expect(built).toHaveLength(9)
    // and the two that stay blind are blind on both readings, by a wide margin
    for (const id of ['head-2-3', 'head-3-4']) {
      const o = low.find((x) => x.id === id)!
      expect(o.built, id).toBe(false)
      expect(o.centreY, id).toBeLessThan(TOWER.groundY + 18.3 - 4)
    }
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
