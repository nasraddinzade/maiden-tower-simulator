import { describe, expect, it } from 'vitest'
import {
  flaresInward,
  groupByAzimuth,
  solsticeWindows,
  splayHalfAngleDeg,
} from './windows'
import { SHIPPED_ENDS } from './openings.fixture'
import { TOWER } from '../config/tower'
import windowData from '../data/windows.json'

/*
 * WHAT THIS FILE STILL COVERS, AFTER 2026-08-10.
 *
 * [OWNER], twice: the tower's slits are at the beginning and the end of the
 * stair passages, and the storeys themselves have no windows at all. So the
 * eight slits left this file for src/lib/passageOpenings.ts, where their azimuth
 * and height are derived from the flight rather than stored, and are tested in
 * passageOpenings.test.ts.
 *
 * What is left here is the arithmetic that is true of an opening whatever wall
 * it is cut in, applied to the openings the model actually has.
 *
 * Tests that are honestly no longer applicable, rather than moved, and it is
 * worth naming them so nobody looks for them:
 *   - "keeps the lower column on one exact bearing" and "keeps the two columns
 *     well apart" asserted the photographic azimuths. Those are now a record in
 *     windows.json's photographicLadder, and the model is SCORED against them
 *     instead of built from them — see the residual tests in
 *     passageOpenings.test.ts, which assert the disagreement rather than
 *     agreement.
 *   - "records how far the two fields disagreed" tested centreYDrift(), whose
 *     two inputs (floorIndex, heightAboveFloor) are both gone.
 *   - the whole "the one opening left in a chamber wall" block, and the
 *     validateChamberWindow() block under it. There is no such opening now and
 *     no such function: see the describe below, and windows.json →
 *     chamberOpeningsHistory for the record of the window they were about.
 */

describe('splay geometry', () => {
  it('is zero when the opening does not widen', () => {
    expect(splayHalfAngleDeg(0.4, 0.4, 4)).toBeCloseTo(0, 10)
  })
  it('grows as the inner opening widens', () => {
    expect(splayHalfAngleDeg(0.4, 2.0, 4)).toBeGreaterThan(splayHalfAngleDeg(0.4, 1.0, 4))
  })
  it('matches a hand-computed case', () => {
    // spread 1.6 m over 4 m of wall ⇒ half-spread 0.8 ⇒ atan(0.8/4) ≈ 11.31°
    expect(splayHalfAngleDeg(0.4, 2.0, 4)).toBeCloseTo(11.3099, 3)
  })
  it('rejects a non-positive wall', () => {
    expect(() => splayHalfAngleDeg(0.4, 1, 0)).toThrow()
  })

  it('is wider now the reveal is shorter, which is the Phase-8 consequence', () => {
    /*
     * A slit's reveal used to cross the whole wall to the room face, about 4.6 m;
     * it now stops on the passage's outer cheek, 2.5–3.5 m. The same mouth over
     * less depth is a wider acceptance cone, so Phase 8 will report a DIFFERENT
     * set of lit openings. Recorded here as a consequence to be published, not
     * corrected (CLAUDE.md rule 7).
     */
    const shallow = SHIPPED_ENDS[0]
    const deep = TOWER.outerRadius - 3.65 // the room face at the same height
    expect(
      splayHalfAngleDeg(shallow.outerWidth, shallow.innerWidth, TOWER.outerRadius - shallow.revealEndRadius),
    ).toBeGreaterThan(splayHalfAngleDeg(shallow.outerWidth, shallow.innerWidth, deep))
  })
})

describe('flaresInward', () => {
  it('accepts an opening that widens toward the room', () => {
    expect(flaresInward({ outerWidth: 0.4, innerWidth: 1.5, outerHeight: 1.9, innerHeight: 2.4 })).toBe(true)
  })
  it('rejects a parallel-sided opening', () => {
    expect(flaresInward({ outerWidth: 1, innerWidth: 1, outerHeight: 2, innerHeight: 2 })).toBe(false)
  })
  it('rejects one that narrows inward', () => {
    expect(flaresInward({ outerWidth: 1.5, innerWidth: 0.4, outerHeight: 2, innerHeight: 2 })).toBe(false)
  })

  it('holds for every opening the model has, which is the only claim [ref] makes about them', () => {
    // it used to be asserted of the arched window; the openings it is asserted of
    // now are the ones that survived, and the reveal is clamped by the passage,
    // so this is a real check on fitReveal() and not a restatement of the JSON
    //
    // head-8-9 is not among them and must not be: its landing is the roof deck,
    // the only masonry over it is 0.751 m of parapet, and fitReveal() correctly
    // gives it no reveal at all. An opening with no height does not flare, and
    // asking whether it does is asking about a hole that is not there.
    for (const o of SHIPPED_ENDS.filter((x) => x.blindBecause !== 'parapet')) {
      expect(flaresInward(o), o.id).toBe(true)
    }
  })
})

describe('no opening is left in a chamber wall', () => {
  /*
   * [OWNER] 2026-08-10 said it twice. The first time, `arched-later` was kept in
   * storey 4's wall on the argument that a later insertion sits outside a rule
   * about how the building works. The argument was put to him and he restated the
   * rule, so the window is withdrawn.
   *
   * Asserted here rather than left implicit, because the failure mode is silent:
   * a stray entry in chamberOpenings would appear on the drum at its own azimuth,
   * unattached to any flight, and nothing else in the suite would notice.
   */
  it('ships an empty chamberOpenings', () => {
    expect(windowData.chamberOpenings).toEqual([])
  })

  it('keeps the withdrawn window on the record instead of deleting it', () => {
    const history = windowData.chamberOpeningsHistory
    expect(history.withdrawn).toHaveLength(1)
    const w = history.withdrawn[0]
    // the numbers, so nothing has to be recovered from a diff
    expect(w.id).toBe('arched-later')
    expect(w.azimuthDeg).toBe(123)
    expect(w.heightFraction).toBe(0.5)
    expect(w.head).toBe('pointed')
    // and both halves of the reason: the reading, and the overruling
    expect(history.note.join(' ')).toMatch(/LATER INSERTION|later insertion/)
    expect(w.questionedBy).toMatch(/OWNER/)
    expect(w.answeredBy).toMatch(/OWNER/)
  })

  it('leaves no cut in the model that is not the end of a flight', () => {
    // every opening the shell is pierced with carries a flight index and an end
    for (const o of SHIPPED_ENDS.filter((x) => x.built)) {
      expect(o.id).toMatch(/^(foot|head)-\d+-\d+$/)
    }
  })
})

describe('the solstice flag stays unassigned (CLAUDE.md rule 7)', () => {
  it('designates no aperture, because no source identifies one', () => {
    expect(solsticeWindows(SHIPPED_ENDS)).toEqual([])
  })
})

describe('groupByAzimuth measures the model instead of recovering the photograph', () => {
  it('finds the derived heads standing as one loose column', () => {
    const heads = SHIPPED_ENDS.filter(
      (o) => o.built && o.end === 'head' && o.flightIndex !== 2,
    )
    // one group at a 15° tolerance: four heads spread over 13.6° in all, which
    // is the drift of the column and not four separate bearings
    expect(groupByAzimuth(heads, 15)).toHaveLength(1)
  })

  it('does not merge the feet with the heads, as the photographs never did either', () => {
    const built = SHIPPED_ENDS.filter((o) => o.built)
    expect(groupByAzimuth(built, 10).length).toBeGreaterThan(1)
  })
})
