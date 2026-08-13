import { describe, expect, it } from 'vitest'
import {
  flaresInward,
  groupByAzimuth,
  solsticeWindows,
  splayHalfAngleDeg,
} from './windows'
import { windowProfile } from './towerShell'
import { OPENING_FITTINGS, SHIPPED_ENDS } from './openings.fixture'
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

/**
 * THE HEADS, AFTER THE WALKTHROUGH FOOTAGE OF 2026-08-14.
 *
 * Until that reading eleven of the twelve ends shipped 'round'. That came from
 * ONE exterior frame — exterior/«Qız qalası yaxından.jpg» — read once, with two
 * blind readings disagreeing about where flat stopped, and then transferred onto
 * a different set of openings by height alone.
 *
 * Three walkthrough videos, read four times independently, say otherwise and do
 * not disagree with each other: every opening on the route has a straight stone
 * lintel over it, one has a two-centred pointed arch, and NOT ONE has a
 * semicircular head. Round arches do occur in the building — over the doorways
 * out of the chambers and over the entrance portal — which is very likely what
 * the single exterior frame was showing. An arch in the building, on the wrong
 * kind of hole. Frames and per-end provenance: windows.json → footageReading.
 *
 * What is asserted here is GEOMETRY and not a spelling. windowProfile() puts the
 * springing of a head a distance below its crown that identifies the shape by
 * itself: nothing for a flat head, one half-width for a semicircle, √3 half-widths
 * for a two-centred arch. So the shipped set can be checked for the SHAPE it cuts
 * without trusting the word stored next to it.
 */
describe('head shapes, as the cutter builds them', () => {
  /** How far below the crown the outline is still full width. */
  function springingDrop(pts: Array<[number, number]>, halfWidth: number): number {
    const crown = Math.max(...pts.map((p) => p[1]))
    const fullWidth = pts
      .filter((p) => Math.abs(Math.abs(p[0]) - halfWidth) < 1e-9)
      .map((p) => p[1])
    return crown - Math.max(...fullWidth)
  }

  /** Face area the outline encloses, by the shoelace formula. */
  function faceArea(pts: Array<[number, number]>): number {
    let twice = 0
    for (let i = 0; i < pts.length; i += 1) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % pts.length]
      twice += x1 * y2 - x2 * y1
    }
    return Math.abs(twice) / 2
  }

  const A = 0.2 // half-width, the shipped slit's
  const B = 0.95 // half-height, likewise

  it('separates the three shapes by where the head springs from', () => {
    /*
     * PROPERTY. A flat head has no springing at all — the outline is full width
     * right up to the crown. A semicircle of radius `a` springs `a` below its
     * crown. windowProfile()'s two-centred head strikes each arc from the
     * opposite springing with a radius equal to the span, so its crown stands
     * (√3/2)·span = √3·a above the springing. Exact, and independent of `b`.
     */
    expect(springingDrop(windowProfile(A, B, 'flat'), A)).toBeCloseTo(0, 12)
    expect(springingDrop(windowProfile(A, B, 'round'), A)).toBeCloseTo(A, 12)
    expect(springingDrop(windowProfile(A, B, 'pointed'), A)).toBeCloseTo(Math.sqrt(3) * A, 12)
    // and the ratio is √3 whatever the opening's size, which is what makes the
    // drop usable as an identifier rather than as a coincidence at one size
    for (const a of [0.1, 0.2, 0.45, 1.3]) {
      const round = springingDrop(windowProfile(a, 2 * a + 0.5, 'round'), a)
      const pointed = springingDrop(windowProfile(a, 2 * a + 0.5, 'pointed'), a)
      expect(pointed / round).toBeCloseTo(Math.sqrt(3), 9)
    }
  })

  it('takes the most stone out for a flat head and the least for a pointed one', () => {
    // the same consequence stated as area: each head shape gives back a bite of
    // the enclosing rectangle, and the deeper the springing the bigger the bite
    const flat = faceArea(windowProfile(A, B, 'flat'))
    const round = faceArea(windowProfile(A, B, 'round'))
    const pointed = faceArea(windowProfile(A, B, 'pointed'))
    expect(flat).toBeCloseTo(4 * A * B, 9) // the full rectangle, by construction
    expect(round).toBeLessThan(flat)
    expect(pointed).toBeLessThan(round)
    /*
     * A semicircle gives back a²(2 − π/2) of the rectangle's two upper corners.
     * The cutter SAMPLES its arc, so the polygon is inside the circle and gives
     * back a little more than that; the shortfall has to vanish as the sampling
     * refines, and that is the property worth asserting — it says the sampled
     * head really is the shape it is named for, at any resolution.
     */
    const corners = A * A * (2 - Math.PI / 2)
    const coarse = 4 * A * B - faceArea(windowProfile(A, B, 'round', 8))
    const fine = 4 * A * B - faceArea(windowProfile(A, B, 'round', 512))
    expect(coarse).toBeGreaterThan(corners)
    expect(fine).toBeGreaterThan(corners)
    expect(fine).toBeLessThan(coarse)
    expect(fine).toBeCloseTo(corners, 6)
  })

  it('cuts no semicircular head anywhere, which is the change the footage forced', () => {
    /*
     * THE ASSERTION THAT FAILS ON THE OLD DATA. Before 2026-08-14 nine of the
     * twelve ends sprang one half-width below their crown. None does now.
     */
    for (const f of OPENING_FITTINGS) {
      const a = f.outerWidth / 2
      const drop = springingDrop(windowProfile(a, f.outerHeight / 2, f.head!), a)
      expect(Math.abs(drop - a), `${f.id} springs like a semicircle`).toBeGreaterThan(1e-6)
      // it is one of the two shapes the frames do show, and nothing else
      const isFlat = Math.abs(drop) < 1e-9
      const isPointed = Math.abs(drop - Math.sqrt(3) * a) < 1e-9
      expect(isFlat || isPointed, `${f.id} head ${f.head}`).toBe(true)
    }
  })

  it('gives the tower exactly one pointed head, at the top of the climb to storey 4', () => {
    /*
     * [VIDEO] up/097, up/098, down/137, down/138, down/139: a two-centred arch
     * with a slight keel, violet-tinted glass in the tympanum over clear glass
     * below, a casement standing open, a barred screen across the mouth of the
     * embrasure. It is the only opening on the whole route that is a window
     * rather than a slit, and the only one whose head is not a flat lintel.
     *
     * Three of the four readings put it at the head of this climb; the fourth saw
     * it and declined to say which end it belonged to. If [OWNER] ever says the
     * storey-4 chamber has a window, this is it and it moves — see the note on
     * head-3-4, and footageReading.placeInTheWall for the harder thing it implies.
     */
    const pointed = OPENING_FITTINGS.filter((f) => f.head === 'pointed')
    expect(pointed.map((f) => f.id)).toEqual(['head-3-4'])
    expect(OPENING_FITTINGS.filter((f) => f.head === 'flat')).toHaveLength(11)
  })
})
