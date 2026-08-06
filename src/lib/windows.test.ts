import { describe, expect, it } from 'vitest'
import {
  flaresInward,
  groupByAzimuth,
  solsticeWindows,
  splayHalfAngleDeg,
  validateWindow,
  type WindowSpec,
  windowCentreY,
  centreYDrift,
} from './windows'
import windowData from '../data/windows.json'
import { FLOORS, SITE, TOWER, wallThicknessAt } from '../config/tower'

const WINDOWS = windowData.windows as WindowSpec[]

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

describe('the shipped window data', () => {
  it('parses and is non-empty', () => {
    expect(WINDOWS.length).toBeGreaterThan(0)
  })

  it('has unique ids', () => {
    const ids = new Set(WINDOWS.map((w) => w.id))
    expect(ids.size).toBe(WINDOWS.length)
  })

  it('passes validation against the real tower', () => {
    for (const w of WINDOWS) {
      const sillY = FLOORS[w.floorIndex].floorY + w.heightAboveFloor
      const errs = validateWindow(w, FLOORS.length, wallThicknessAt(sillY))
      expect(errs).toEqual([])
    }
  })

  it('makes every opening flare inward, as the sources describe', () => {
    for (const w of WINDOWS) expect(flaresInward(w)).toBe(true)
  })

  it('leaves storeys 1 and 2 unlit, as the photographs show', () => {
    const lowest = Math.min(...WINDOWS.map((w) => w.floorIndex))
    expect(lowest).toBeGreaterThanOrEqual(2)
  })

  it('holds eight slits plus the later arched insertion', () => {
    expect(WINDOWS.filter((w) => w.kind === 'slit')).toHaveLength(8)
    expect(WINDOWS.filter((w) => w.kind === 'arched')).toHaveLength(1)
  })

  it('keeps the slits’ measured 1:4.8 proportion', () => {
    for (const w of WINDOWS.filter((w) => w.kind === 'slit')) {
      const ratio = w.outerHeight / w.outerWidth
      expect(ratio).toBeGreaterThan(3.5)
      expect(ratio).toBeLessThan(6)
    }
  })

  it('keeps the lower column on one exact bearing', () => {
    const lower = WINDOWS.filter((w) => w.id.startsWith('lower-'))
    expect(lower).toHaveLength(4)
    const az = new Set(lower.map((w) => w.azimuthDeg))
    expect(az.size).toBe(1) // a true vertical generator, as measured
  })

  it('cannot separate the columns by bearing alone — the drifting one crosses it', () => {
    // worth asserting: the upper column sweeps THROUGH the lower column's azimuth,
    // so azimuth clustering merges them. Column identity comes from height, not bearing.
    const slits = WINDOWS.filter((w) => w.kind === 'slit')
    const merged = groupByAzimuth(slits, 2).filter((g) => g.length > 4)
    expect(merged.length).toBeGreaterThan(0)
  })

  it('spreads the upper column across a few degrees, not one bearing', () => {
    const upper = WINDOWS.filter((w) => w.id.startsWith('upper-'))
    const az = upper.map((w) => w.azimuthDeg)
    expect(Math.max(...az) - Math.min(...az)).toBeGreaterThan(5)
  })

  it('rises monotonically with the photographed height fractions', () => {
    const lower = WINDOWS.filter((w) => w.id.startsWith('lower-'))
    for (let i = 1; i < lower.length; i++) {
      expect(lower[i].heightFraction).toBeGreaterThan(lower[i - 1].heightFraction)
    }
  })
})

describe('the solstice flag stays unassigned (CLAUDE.md rule 7)', () => {
  it('designates no aperture, because no source identifies one', () => {
    expect(solsticeWindows(WINDOWS)).toEqual([])
  })

  it('has not been quietly set on whichever slit sits near the solstice bearing', () => {
    const phi = (SITE.latitude * Math.PI) / 180
    const solsticeAz = (Math.acos(Math.sin((-23.44 * Math.PI) / 180) / Math.cos(phi)) * 180) / Math.PI
    const near = WINDOWS.filter((w) => Math.abs(w.azimuthDeg - solsticeAz) < 25)
    // some openings do lie near that bearing — that is exactly why none may be flagged
    expect(near.length).toBeGreaterThan(0)
    for (const w of near) expect(w.solsticeAligned).toBe(false)
  })
})

describe('validateWindow catches bad edits to the JSON', () => {
  const good = WINDOWS[0]

  it('flags an out-of-range storey', () => {
    expect(validateWindow({ ...good, floorIndex: 99 }, FLOORS.length, 4)).toContainEqual(
      expect.stringContaining('outside'),
    )
  })
  it('flags an opening that does not flare', () => {
    expect(validateWindow({ ...good, innerWidth: 0.1 }, FLOORS.length, 4)).toContainEqual(
      expect.stringContaining('flare'),
    )
  })
  it('flags a height fraction outside the tower', () => {
    expect(validateWindow({ ...good, heightFraction: 1.4 }, FLOORS.length, 4)).toContainEqual(
      expect.stringContaining('heightFraction'),
    )
  })
})

describe('window height comes from the photograph, not from the storey', () => {
  const windows = windowData.windows as WindowSpec[]
  const drifts = centreYDrift(windows, (i) => FLOORS[i].floorY, TOWER.groundY, TOWER.height)

  it('places every opening inside the tower, clear of ground and parapet', () => {
    for (const w of windows) {
      const y = windowCentreY(w, TOWER.groundY, TOWER.height)
      expect(y - w.outerHeight / 2).toBeGreaterThan(TOWER.groundY)
      expect(y + w.outerHeight / 2).toBeLessThan(TOWER.topY)
    }
  })

  it('keeps the two topmost slits apart, as eleven photographs put them', () => {
    /*
     * upper-3 (0.84) and upper-4 (0.94) were built at IDENTICAL height while the
     * geometry read heightAboveFloor — both storeys carry the filler 1.4 — so
     * they merged into one wide double aperture 3° apart in azimuth. The
     * photographs put them about 2.9 m apart vertically.
     */
    const y = (id: string) =>
      windowCentreY(windows.find((w) => w.id === id)!, TOWER.groundY, TOWER.height)
    expect(y('upper-4') - y('upper-3')).toBeGreaterThan(2.5)
  })

  it('preserves the order the photographs establish within each column', () => {
    for (const column of groupByAzimuth(windows, 12)) {
      const byFraction = [...column].sort((a, b) => a.heightFraction - b.heightFraction)
      const ys = byFraction.map((w) => windowCentreY(w, TOWER.groundY, TOWER.height))
      for (let i = 1; i < ys.length; i += 1) expect(ys[i]).toBeGreaterThan(ys[i - 1])
    }
  })

  it('records how far the two fields disagreed, rather than hiding it', () => {
    /*
     * Not a tolerance to tighten. This asserts the disagreement was REAL and
     * large — which is the whole reason the fraction now decides. If a survey
     * ever refills heightAboveFloor with measurements, this test will fail and
     * the failure is the signal to delete it.
     */
    const worst = Math.max(...drifts.map((d) => Math.abs(d.drift)))
    expect(worst).toBeGreaterThan(1)
  })
})
