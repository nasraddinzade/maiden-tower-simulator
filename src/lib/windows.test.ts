import { describe, expect, it } from 'vitest'
import {
  flaresInward,
  groupByAzimuth,
  solsticeWindows,
  splayHalfAngleDeg,
  validateChamberWindow,
  windowCentreY,
  windowStoreyIndex,
  sillAboveFloor,
  type ChamberWindowSpec,
} from './windows'
import { CHAMBER_WINDOWS, SHIPPED_ENDS } from './openings.fixture'
import { BUTTRESS, FLOORS, TOWER, wallThicknessAt } from '../config/tower'

/*
 * WHAT THIS FILE STILL COVERS, AFTER 2026-08-10.
 *
 * [OWNER]: the tower's slits are at the beginning and the end of the stair
 * passages, and the storeys themselves have no windows at all. So the eight
 * slits left this file for src/lib/passageOpenings.ts, where their azimuth and
 * height are derived from the flight rather than stored, and are tested in
 * passageOpenings.test.ts.
 *
 * Three tests that used to live here are honestly no longer applicable, rather
 * than moved, and it is worth naming them so nobody looks for them:
 *   - "keeps the lower column on one exact bearing" and "keeps the two columns
 *     well apart" asserted the photographic azimuths. Those are now a record in
 *     windows.json's photographicLadder, and the model is SCORED against them
 *     instead of built from them — see the residual tests in
 *     passageOpenings.test.ts, which assert the disagreement rather than
 *     agreement.
 *   - "records how far the two fields disagreed" tested centreYDrift(), whose
 *     two inputs (floorIndex, heightAboveFloor) are both gone. The function is
 *     deleted; it is the only one that became meaningless rather than moving.
 */

const CHAMBER = CHAMBER_WINDOWS

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
})

describe('the one opening left in a chamber wall', () => {
  it('is the later arched insertion, and only it', () => {
    expect(CHAMBER).toHaveLength(1)
    expect(CHAMBER[0].id).toBe('arched-later')
    expect(CHAMBER[0].kind).toBe('arched')
  })

  it('records that the owner’s statement touches it, rather than quietly keeping it', () => {
    // it is exempted as a modern insertion, and that is a judgement — it has to
    // be visible in the data, not buried in a commit message
    expect(CHAMBER[0].questionedBy).toMatch(/OWNER/)
    expect(CHAMBER[0].questionedBy).toContain('2026-08-10')
  })

  it('passes validation against the real tower', () => {
    for (const w of CHAMBER) {
      const y = windowCentreY(w, TOWER.groundY, TOWER.height)
      expect(validateChamberWindow(w, wallThicknessAt(y))).toEqual([])
    }
  })

  it('flares inward, as the sources describe', () => {
    for (const w of CHAMBER) expect(flaresInward(w)).toBe(true)
  })

  it('keeps its reveal on the room face, which is what makes it a chamber opening', () => {
    // the field it needs, heightFraction, is meaningless for a passage slit and
    // exactly right here: it is a photogrammetric reading off the outer face
    expect(CHAMBER[0].heightFraction).toBe(0.5)
    expect(windowCentreY(CHAMBER[0], TOWER.groundY, TOWER.height)).toBeCloseTo(12.75, 2)
  })

  it('clears the buttress, which is a small independent check on the pier bearing', () => {
    // half-width on the drum face, plus the root arc's own edge at 113.5 [OSM]
    const half = (CHAMBER[0].outerWidth / 2 / TOWER.outerRadius) * (180 / Math.PI)
    const nearEdge = CHAMBER[0].azimuthDeg - half
    const rootEnd = BUTTRESS.azimuthDeg - BUTTRESS.skewDeg + BUTTRESS.rootArcDeg / 2
    expect(nearEdge).toBeGreaterThan(rootEnd)
    expect(nearEdge - rootEnd).toBeLessThan(10) // "close to the re-entrant", as recorded
  })

  it('lights a storey, and reports which one from where it IS', () => {
    const floorYs = FLOORS.map((f) => f.floorY)
    const i = windowStoreyIndex(CHAMBER[0], floorYs, TOWER.groundY, TOWER.height)
    expect(floorYs[i]).toBeLessThanOrEqual(
      windowCentreY(CHAMBER[0], TOWER.groundY, TOWER.height) - CHAMBER[0].outerHeight / 2,
    )
    expect(sillAboveFloor(CHAMBER[0], floorYs, TOWER.groundY, TOWER.height)).toBeGreaterThan(0)
  })
})

describe('the solstice flag stays unassigned (CLAUDE.md rule 7)', () => {
  it('designates no aperture, because no source identifies one', () => {
    expect(solsticeWindows(CHAMBER)).toEqual([])
    expect(solsticeWindows(SHIPPED_ENDS)).toEqual([])
  })

  it('has not been quietly set on the opening nearest the solstice bearing', () => {
    // ~120.7° at Baku; the arched window at 123 is the closest thing in the
    // model and misses by about two degrees, which is precisely why it must not
    // be flagged in advance of Phase 8's calculation
    expect(Math.abs(CHAMBER[0].azimuthDeg - 120.7)).toBeLessThan(5)
    expect(CHAMBER[0].solsticeAligned).toBe(false)
  })
})

describe('validateChamberWindow catches bad edits to the JSON', () => {
  const ok = CHAMBER[0]

  it('flags an opening that does not flare', () => {
    const bad: ChamberWindowSpec = { ...ok, innerWidth: 0.1 }
    expect(validateChamberWindow(bad, 4).join(' ')).toMatch(/flare/)
  })
  it('flags a height fraction outside the tower', () => {
    const bad: ChamberWindowSpec = { ...ok, heightFraction: 1.4 }
    expect(validateChamberWindow(bad, 4).join(' ')).toMatch(/heightFraction/)
  })
  it('flags a mouth too wide for the wall it is cut through', () => {
    const bad: ChamberWindowSpec = { ...ok, innerWidth: 20 }
    expect(validateChamberWindow(bad, 4).join(' ')).toMatch(/implausibly wide/)
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
