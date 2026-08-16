/**
 * WHY THE SLIT AT THE WAY ONTO THE STAIR COMES OUT SKEW, as arithmetic.
 *
 * [OWNER] 2026-08-16, of the model on screen: «окно при входе на лестницу должно
 * не на кривую направо выходить, а прямо». This file measures the thing that
 * makes it do that and asserts nothing about what should be done — see the note
 * on approachAzimuthDeg() in lib/staircase.ts for the one-line change, for what
 * it costs and for why the cost is the owner's to accept rather than this
 * repository's to spend.
 *
 * THE SHAPE OF THE FINDING. A passage's lead runs AWAY from its flight at both
 * ends, so a landing is always on the far side of its end tread from the treads.
 * approachAzimuthDeg() walks ALONG THE CLIMB at both ends instead, which is the
 * same direction at a head and the opposite one at a foot. So every head doorway
 * opens onto its landing and every foot doorway opens onto the flight, while
 * planPassageOpenings() centres the slit on the landing either way — and a slit
 * the walker never stands in front of is a slit that runs off to one side.
 *
 * Every number below is a difference of azimuths or a ratio of arcs (CLAUDE.md
 * rule 6). Nothing here reads the built mesh: the reveal itself was cleared by a
 * ray fan on the shell, and that measurement lives in the note, not in a test.
 */
import { describe, expect, it } from 'vitest'
import { PASSAGE_OPENING, STAIR, WALL_LIFTS } from '../config/tower'
import { approachAzimuthDeg, approachOffsetTowardLandingDeg } from './staircase'
import { SHIPPED_ENDS, SHIPPED_FLIGHTS, SHIPPED_TUBES } from './openings.fixture'
import type { PassageOpening } from './passageOpenings'

const DEG = Math.PI / 180

/** Shortest signed difference a − b, in (−180, 180]. */
function delta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

const endTreadOf = (flightIndex: number, end: 'foot' | 'head') => {
  const f = SHIPPED_FLIGHTS[flightIndex]
  return end === 'foot' ? f[0] : f[f.length - 1]
}

/** The doorway that serves one passage end, as stairDoorways() places it. */
function doorwayFor(o: PassageOpening): { azimuthDeg: number; halfDeg: number } {
  const tread = endTreadOf(o.flightIndex, o.end)
  return {
    azimuthDeg: approachAzimuthDeg(SHIPPED_FLIGHTS[o.flightIndex], tread, STAIR.width),
    halfDeg: ((STAIR.doorwayWidth / tread.midRadius) * (180 / Math.PI)) / 2,
  }
}

/** Half the slit's inner mouth on the passage cheek, in degrees of the drum. */
const slitHalfDeg = (o: PassageOpening) => (o.innerWidth / 2 / o.cheekRadius) / DEG

/** Overlap of two arcs about the same circle, in degrees. */
function overlapDeg(aMid: number, aHalf: number, bMid: number, bHalf: number): number {
  const d = Math.abs(delta(aMid, bMid))
  return Math.max(0, aHalf + bHalf - d)
}

const FEET = SHIPPED_ENDS.filter((o) => o.end === 'foot')
const HEADS = SHIPPED_ENDS.filter((o) => o.end === 'head')

describe('a landing is on the far side of its end tread from the flight', () => {
  it('carries every tube lead away from the treads, at both ends of every flight', () => {
    /*
     * The premise the whole finding rests on, taken off the tube rather than
     * asserted: stairPassageSections()' leadIn walks BACK from the bottom tread
     * and its leadOut walks ON past the top one, so at both ends the end cap
     * stands beyond the end tread in the direction away from the flight. It is
     * this that makes "toward the landing" a direction and not a preference.
     */
    SHIPPED_FLIGHTS.forEach((f, i) => {
      const tube = SHIPPED_TUBES[i]
      const climbDir = Math.sign(f[1].azimuthDeg - f[0].azimuthDeg)
      const footCap = tube[0].azimuthDeg
      const headCap = tube[tube.length - 1].azimuthDeg
      const label = `${WALL_LIFTS[i].fromFloorNumber}->${WALL_LIFTS[i].toFloorNumber}`
      expect(delta(footCap, f[0].azimuthDeg) * -climbDir, `${label} foot lead`).toBeGreaterThan(0)
      expect(
        delta(headCap, f[f.length - 1].azimuthDeg) * climbDir,
        `${label} head lead`,
      ).toBeGreaterThan(0)
    })
  })

  it('puts the slit at the midpoint of that lead, symmetric about its own bearing', () => {
    /*
     * planPassageOpenings() centres the opening on the landing arc and
     * windowCutter() splays it symmetrically about that bearing, so the mouth's
     * two jambs are equidistant from it by construction. Stated here because the
     * rest of this file is about the slit being in the wrong place RELATIVE TO
     * THE WALKER, and that claim is only worth anything once it is clear the
     * slit is not also lopsided in itself.
     */
    for (const o of SHIPPED_ENDS) {
      const mid = o.capAzimuthDeg + delta(o.treadAzimuthDeg, o.capAzimuthDeg) / 2
      expect(delta(o.azimuthDeg, mid), o.id).toBeCloseTo(0, 9)
      const half = slitHalfDeg(o)
      expect(delta(o.azimuthDeg + half, o.azimuthDeg), o.id).toBeCloseTo(half, 9)
      expect(delta(o.azimuthDeg - half, o.azimuthDeg), o.id).toBeCloseTo(-half, 9)
    }
  })

  it('leaves the slit no room to slide along that lead — a degree of jamb, no more', () => {
    /*
     * WHY THE SLIT IS NOT THE THING THAT CAN MOVE. Its inner mouth all but fills
     * the landing: 14.47–18.23° of mouth on a 16.47–20.44° landing, which is
     * fitReveal()'s clamp doing its job and leaves the configured jamb margin and
     * nothing else. Slack here is what a repair inside passageOpenings.ts would
     * have to spend, and there is 0.21° of it at the widest end, 0.07° at the
     * next, and none at all at the eight that came back clamped.
     */
    for (const o of SHIPPED_ENDS) {
      const landingArc = Math.abs(delta(o.capAzimuthDeg, o.treadAzimuthDeg))
      const slack = landingArc - 2 * slitHalfDeg(o) - 2 * PASSAGE_OPENING.jambMarginDeg
      expect(slack, `${o.id} slack`).toBeGreaterThan(-1e-6)
      expect(slack, `${o.id} slack`).toBeLessThan(0.25)
    }
  })
})

describe('the way in stands on the landing at a head and on the treads at a foot', () => {
  it('is half a flight width off the end tread at every one of the twelve', () => {
    /*
     * The magnitude is not in question and never was: it is half a flight width
     * of arc at the end tread's own walking radius, at both ends. Only the sign
     * is.
     */
    for (const o of SHIPPED_ENDS) {
      const tread = endTreadOf(o.flightIndex, o.end)
      const half = ((STAIR.width / tread.midRadius) * (180 / Math.PI)) / 2
      const off = approachOffsetTowardLandingDeg(SHIPPED_FLIGHTS[o.flightIndex], tread, STAIR.width)
      expect(Math.abs(off), `${o.id} magnitude`).toBeCloseTo(half, 9)
    }
  })

  it('signs that offset toward the landing at all six heads and away at all six feet', () => {
    expect(HEADS).toHaveLength(6)
    expect(FEET).toHaveLength(6)
    for (const o of HEADS) {
      const off = approachOffsetTowardLandingDeg(
        SHIPPED_FLIGHTS[o.flightIndex],
        endTreadOf(o.flightIndex, 'head'),
        STAIR.width,
      )
      expect(off, `${o.id}`).toBeGreaterThan(4.9)
      expect(off, `${o.id}`).toBeLessThan(6.0)
    }
    for (const o of FEET) {
      const off = approachOffsetTowardLandingDeg(
        SHIPPED_FLIGHTS[o.flightIndex],
        endTreadOf(o.flightIndex, 'foot'),
        STAIR.width,
      )
      expect(off, `${o.id}`).toBeLessThan(-5.0)
      expect(off, `${o.id}`).toBeGreaterThan(-6.2)
    }
  })
})

describe('what that costs the slit, which is the owner’s complaint measured', () => {
  it('stands every head’s doorway inside the mouth of its own recess', () => {
    for (const o of HEADS) {
      const d = doorwayFor(o)
      const half = slitHalfDeg(o)
      expect(Math.abs(delta(d.azimuthDeg, o.azimuthDeg)), `${o.id} apart`).toBeLessThan(4.0)
      expect(Math.abs(delta(d.azimuthDeg, o.azimuthDeg)), `${o.id} inside mouth`).toBeLessThan(half)
      expect(overlapDeg(d.azimuthDeg, d.halfDeg, o.azimuthDeg, half), `${o.id} overlap`).toBeGreaterThan(9.9)
    }
  })

  it('stands every foot’s doorway outside it, 13.5–16.4° round the drum', () => {
    /*
     * THE PICTURE HE SENT. The walker steps onto the stair 13.5–16.4° of drum
     * from the slit that serves the end he is standing at — past its far jamb,
     * not merely off its centre — so the recess is beside him and its 3.5 m of
     * reveal runs away to his right. At r 4.2 in the foot-2-3 doorway the slit's
     * outer mouth bears 222.5° against a facing of 190.6°.
     */
    for (const o of FEET) {
      const d = doorwayFor(o)
      const half = slitHalfDeg(o)
      const apart = Math.abs(delta(d.azimuthDeg, o.azimuthDeg))
      expect(apart, `${o.id} apart`).toBeGreaterThan(13.5)
      expect(apart, `${o.id} apart`).toBeLessThan(16.4)
      expect(apart, `${o.id} outside mouth`).toBeGreaterThan(half)
      expect(overlapDeg(d.azimuthDeg, d.halfDeg, o.azimuthDeg, half), `${o.id} overlap`).toBeLessThan(0.3)
    }
  })

  it('would read exactly like a head if the shift were sent toward the landing', () => {
    /*
     * AND BY HOW MUCH, so that the change is a quantity rather than an opinion.
     * Reflecting a foot doorway through its own end tread — the whole of the
     * one-line change — puts it 3.4–4.1° from its slit with 10.2–12.6° of
     * overlap, which is the band the six heads already occupy. Nothing here
     * applies it; see the note on approachAzimuthDeg() for the bill.
     */
    for (const o of FEET) {
      const d = doorwayFor(o)
      const tread = endTreadOf(o.flightIndex, 'foot')
      const reflected = tread.azimuthDeg - delta(d.azimuthDeg, tread.azimuthDeg)
      const half = slitHalfDeg(o)
      const apart = Math.abs(delta(reflected, o.azimuthDeg))
      expect(apart, `${o.id} apart`).toBeGreaterThan(3.3)
      expect(apart, `${o.id} apart`).toBeLessThan(4.1)
      expect(overlapDeg(reflected, d.halfDeg, o.azimuthDeg, half), `${o.id} overlap`).toBeGreaterThan(10.2)
    }
  })
})
