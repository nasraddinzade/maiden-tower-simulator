/**
 * THE WAY ONTO THE STAIR, AND THE SIGN THAT HAD IT BACKWARDS AT SIX ENDS.
 *
 * [OWNER] 2026-08-16, of the model on screen: «окно при входе на лестницу должно
 * не на кривую направо выходить, а прямо». This file measured why, in the sure
 * knowledge that nothing would be done about it; on 2026-08-17 he walked the
 * tower again, found it still there, and it was done. The file now pins the
 * repair AND keeps the fault, because a measurement that only exists while it is
 * broken cannot tell you afterwards whether it came back.
 *
 * THE SHAPE OF IT. A passage's lead runs AWAY from its flight at both ends, so a
 * landing is always on the far side of its end tread from the treads.
 * approachAzimuthDeg() used to walk ALONG THE CLIMB at both ends, which is the
 * same direction at a head and the opposite one at a foot. So every head doorway
 * opened onto its landing and every foot doorway opened onto the flight's own
 * second, third and fourth treads, while planPassageOpenings() centred the slit
 * on the landing either way — and a slit the walker never stands in front of is a
 * slit that runs off to one side. One sign, six doorways, twelve degrees each.
 *
 * WHAT IT COST TO SPEND, all of it carried and none of it hidden: the daylight
 * census went from four chambers of eight to seven, WELL.azimuthDeg followed its
 * doorway from 171 to 182, and junctions.test.ts's doorway-to-passage heuristic
 * needed the flight named rather than guessed. Those are argued where they land.
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

  it('signs that offset TOWARD the landing at all twelve, feet included', () => {
    /*
     * THE ASSERTION THE REPAIR IS. It read "toward at all six heads and AWAY at
     * all six feet", and both halves passed: +4.94…+5.93° at the heads,
     * −5.08…−6.13° at the feet, the same magnitude either way because the
     * magnitude is half a flight width and only the sign was ever in question.
     *
     * The feet are positive now and the two bands have merged into one, so a
     * return of the fault shows up as a negative number rather than as a picture
     * somebody has to notice.
     */
    expect(HEADS).toHaveLength(6)
    expect(FEET).toHaveLength(6)
    for (const o of SHIPPED_ENDS) {
      const off = approachOffsetTowardLandingDeg(
        SHIPPED_FLIGHTS[o.flightIndex],
        endTreadOf(o.flightIndex, o.end),
        STAIR.width,
      )
      expect(off, `${o.id}`).toBeGreaterThan(4.9)
      expect(off, `${o.id}`).toBeLessThan(6.2)
    }
  })
})

describe('what the slit reads like now, and what it read like before', () => {
  it('stands every head’s doorway inside the mouth of its own recess', () => {
    for (const o of HEADS) {
      const d = doorwayFor(o)
      const half = slitHalfDeg(o)
      expect(Math.abs(delta(d.azimuthDeg, o.azimuthDeg)), `${o.id} apart`).toBeLessThan(4.0)
      expect(Math.abs(delta(d.azimuthDeg, o.azimuthDeg)), `${o.id} inside mouth`).toBeLessThan(half)
      expect(overlapDeg(d.azimuthDeg, d.halfDeg, o.azimuthDeg, half), `${o.id} overlap`).toBeGreaterThan(9.9)
    }
  })

  it('stands every foot’s doorway inside it too, which is the repair', () => {
    /*
     * AND NOW A FOOT READS EXACTLY LIKE A HEAD, which is what «прямо» means when
     * it is turned into arithmetic: 3.3–4.1° from the slit that serves the end
     * you are standing at, with 10.2–12.6° of the mouth in front of you. Same
     * bounds as the heads above, deliberately, because foot-N and head-(N−1)
     * share a landing and there was never a reason for the two to differ.
     */
    for (const o of FEET) {
      const d = doorwayFor(o)
      const half = slitHalfDeg(o)
      const apart = Math.abs(delta(d.azimuthDeg, o.azimuthDeg))
      expect(apart, `${o.id} apart`).toBeGreaterThan(3.3)
      expect(apart, `${o.id} apart`).toBeLessThan(4.1)
      expect(apart, `${o.id} inside mouth`).toBeLessThan(half)
      expect(overlapDeg(d.azimuthDeg, d.halfDeg, o.azimuthDeg, half), `${o.id} overlap`).toBeGreaterThan(10.2)
    }
  })

  it('reproduces the fault exactly when the shift is sent back along the climb', () => {
    /*
     * THE PICTURE HE SENT, KEPT AS A REFLECTION SO IT CANNOT BE ARGUED WITH
     * LATER. Send a foot doorway back to the far side of its own end tread — the
     * whole of the fault, one sign — and the walker steps onto the stair
     * 13.5–16.4° of drum from the slit that serves him, past its far jamb rather
     * than merely off its centre, with 0.3° of the mouth in view. That was the
     * shipped model until 2026-08-17: at r 4.2 in the foot-2-3 doorway the slit's
     * outer mouth bore 222.5° against a facing of 190.6°.
     *
     * Which also fixes the magnitude of the repair at one flight width of arc,
     * since the two readings are reflections of each other about the end tread.
     */
    for (const o of FEET) {
      const d = doorwayFor(o)
      const tread = endTreadOf(o.flightIndex, 'foot')
      const reflected = tread.azimuthDeg - delta(d.azimuthDeg, tread.azimuthDeg)
      const half = slitHalfDeg(o)
      const apart = Math.abs(delta(reflected, o.azimuthDeg))
      expect(apart, `${o.id} apart`).toBeGreaterThan(13.5)
      expect(apart, `${o.id} apart`).toBeLessThan(16.4)
      expect(apart, `${o.id} outside mouth`).toBeGreaterThan(half)
      expect(overlapDeg(reflected, d.halfDeg, o.azimuthDeg, half), `${o.id} overlap`).toBeLessThan(0.3)
      // the move itself: one flight width of arc at the end tread's radius
      expect(
        Math.abs(delta(d.azimuthDeg, reflected)),
        `${o.id} moved`,
      ).toBeCloseTo((STAIR.width / tread.midRadius) * (180 / Math.PI), 9)
    }
  })
})
