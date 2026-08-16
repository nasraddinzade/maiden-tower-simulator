/**
 * THE WAY ONTO THE STAIR, AND THE WINDOW IT IS SUPPOSED TO FACE.
 *
 * [OWNER] 2026-08-16, of the model on screen: «окно при входе на лестницу должно
 * не на кривую направо выходить, а прямо». Then, after the repair of 2026-08-17:
 * «окна при входе на лестницу опять направо смотрят». Twice, and the second time
 * against a suite that said the fault was fixed — so the first thing this file
 * has to answer for is why it passed.
 *
 * IT MEASURED THE ANGLE AT THE WRONG POINT. Every number in the old version was
 * a difference of AZIMUTHS: the doorway's bearing against the slit's, which is
 * the angle the two subtend AT THE TOWER'S AXIS. Nobody stands at the axis. The
 * walker stands IN the doorway, and from there the slit's inner mouth is 0.33 m
 * of arc away across 0.72 m of passage, which is 25° of his view and not 4° of
 * the drum's. A test that only ever asked the drum was always going to certify a
 * skew he could see, and it did, twice.
 *
 * So the properties below are stated at the EYE. The walker is placed on his own
 * doorway's radial, a shoulder's width off the inner cheek, facing radially out —
 * which is how he arrives, since the doorway is a radial tunnel — and asked what
 * bearing the slit's four jambs lie on. «Прямо» is: the two mouths centred on his
 * facing, and each mouth's jambs equal and opposite about it.
 *
 * THE REPAIR IS THAT THE DOORWAY STANDS IN THE MIDDLE OF ITS LANDING, which is
 * where planPassageOpenings() has always put the slit. Then the two holes share
 * one radial and the answer is 0.000° by construction rather than by tolerance.
 * See approachAzimuthDeg() for what half a flight width was doing there and why
 * its reason expired on 2026-08-17.
 *
 * BOTH FAULTS ARE KEPT AS REFLECTIONS, not deleted: a measurement that only
 * exists while a thing is broken cannot tell you afterwards whether it came back.
 *
 * Every number below is arithmetic on azimuths, radii and box corners (CLAUDE.md
 * rule 6). Nothing here reads the built mesh: the reveal itself was cleared by a
 * ray fan on the shell and that measurement lives in the note, not in a test.
 */
import { describe, expect, it } from 'vitest'
import { PASSAGE_OPENING, STAIR, WALL_LIFTS, innerRadiusAt, stairSettings } from '../config/tower'
import { PLAYER } from '../config/player'
import {
  approachAzimuthDeg,
  approachOffsetTowardLandingDeg,
  passageLeadArcDeg,
  planAllFlights,
  stairApproaches,
} from './staircase'
import { stairRampBoxes, rotate, type BoxSpec } from './collision'
import { SHIPPED_ENDS, SHIPPED_FLIGHTS, SHIPPED_TUBES } from './openings.fixture'
import type { PassageOpening } from './passageOpenings'

const DEG = Math.PI / 180

/** Shortest signed difference a − b, in (−180, 180]. */
function delta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

/** A point on the tower's floor plan. CLAUDE.md rule 3: north −Z, east +X. */
function at(radius: number, azimuthDeg: number): { x: number; z: number } {
  return { x: radius * Math.sin(azimuthDeg * DEG), z: -radius * Math.cos(azimuthDeg * DEG) }
}

/**
 * Where a target lies relative to where the walker is looking, degrees, POSITIVE
 * TO HIS RIGHT.
 *
 * Facing radially outward on bearing α the walker's forward is (sin α, 0, −cos α)
 * and his right is forward × up = (cos α, 0, sin α), whose azimuth is α + 90 — so
 * increasing azimuth is to the right, and this returns the signed bearing of the
 * target minus his facing.
 */
function offEyeDeg(
  stance: { x: number; z: number },
  facingDeg: number,
  target: { x: number; z: number },
): number {
  return delta(Math.atan2(target.x - stance.x, -(target.z - stance.z)) / DEG, facingDeg)
}

const endTreadOf = (flightIndex: number, end: 'foot' | 'head') => {
  const f = SHIPPED_FLIGHTS[flightIndex]
  return end === 'foot' ? f[0] : f[f.length - 1]
}

/** The doorway that serves one passage end, as stairDoorways() places it. */
function doorwayFor(o: PassageOpening): { azimuthDeg: number; halfDeg: number } {
  const tread = endTreadOf(o.flightIndex, o.end)
  return {
    azimuthDeg: approachAzimuthDeg(
      SHIPPED_FLIGHTS[o.flightIndex],
      tread,
      STAIR.width,
      STAIR.doorwayWidth,
    ),
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

/**
 * The four jambs of one slit, and the walker who is looking at them.
 *
 * The stance is the closest a body can stand to the inner cheek — one shoulder
 * radius off it — on the bearing given. Closest is deliberately the WORST case:
 * every angle below shrinks as the walker backs away, so a stance further out
 * would flatter the arrangement.
 *
 * The mouths are taken on their own circles, the inner one on the passage cheek
 * and the outer one on the drum's face, which is windowCutter()'s own loft: a
 * straight taper between two rectangles, splayed symmetrically about the
 * opening's bearing.
 */
function readSlit(o: PassageOpening, doorwayAz: number, outerRadius = 8.25) {
  const stance = at(o.innerCheekRadius + PLAYER.radius, doorwayAz)
  const innerHalf = slitHalfDeg(o)
  const outerHalf = (o.outerWidth / 2 / outerRadius) / DEG
  const read = (radius: number, half: number) => ({
    centre: offEyeDeg(stance, doorwayAz, at(radius, o.azimuthDeg)),
    left: offEyeDeg(stance, doorwayAz, at(radius, o.azimuthDeg - half)),
    right: offEyeDeg(stance, doorwayAz, at(radius, o.azimuthDeg + half)),
  })
  return { inner: read(o.cheekRadius, innerHalf), outer: read(outerRadius, outerHalf) }
}

const FEET = SHIPPED_ENDS.filter((o) => o.end === 'foot')
const HEADS = SHIPPED_ENDS.filter((o) => o.end === 'head')

/** Where the doorway stood on 2026-08-17: half a flight width off the tread. */
function halfFlightWidthDoorway(o: PassageOpening): number {
  const f = SHIPPED_FLIGHTS[o.flightIndex]
  const tread = endTreadOf(o.flightIndex, o.end)
  const climbDir = Math.sign(f[1].azimuthDeg - f[0].azimuthDeg)
  const onward = o.end === 'foot' ? -climbDir : climbDir
  return tread.azimuthDeg + ((STAIR.width / tread.midRadius) * (180 / Math.PI)) / 2 * onward
}

/** And where it stood on 2026-08-16: the same shift sent along the climb. */
function alongTheClimbDoorway(o: PassageOpening): number {
  const tread = endTreadOf(o.flightIndex, o.end)
  return tread.azimuthDeg - delta(halfFlightWidthDoorway(o), tread.azimuthDeg)
}

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

  it('is the same landing whether the tube or the arithmetic is asked', () => {
    /*
     * passageLeadArcDeg() is what the doorway and the ramps are placed off, and
     * the tube is what the slit is placed off. They have to be the same landing
     * or the two holes drift apart again by whatever the difference is.
     *
     * They can only differ one way — stairPassageSections()' inStone() drops a
     * lead section whose floor is already above the top of the stone, which would
     * shorten a tube without shortening the arithmetic. It drops none today. The
     * day it drops one this fails, which is the point of asserting it: the fault
     * this file exists for is exactly a doorway placed on a landing of the wrong
     * length.
     */
    SHIPPED_FLIGHTS.forEach((f, i) => {
      const tube = SHIPPED_TUBES[i]
      const label = `${WALL_LIFTS[i].fromFloorNumber}->${WALL_LIFTS[i].toFloorNumber}`
      expect(
        Math.abs(delta(tube[0].azimuthDeg, f[0].azimuthDeg)),
        `${label} foot`,
      ).toBeCloseTo(passageLeadArcDeg(f, STAIR.doorwayWidth, 'foot'), 9)
      expect(
        Math.abs(delta(tube[tube.length - 1].azimuthDeg, f[f.length - 1].azimuthDeg)),
        `${label} head`,
      ).toBeCloseTo(passageLeadArcDeg(f, STAIR.doorwayWidth, 'head'), 9)
    })
  })

  it('puts the slit at the midpoint of that lead, symmetric about its own bearing', () => {
    /*
     * planPassageOpenings() centres the opening on the landing arc and
     * windowCutter() splays it symmetrically about that bearing, so the mouth's
     * two jambs are equidistant from it by construction. Stated here because the
     * rest of this file is about where the slit is RELATIVE TO THE WALKER, and
     * that claim is only worth anything once it is clear the slit is not also
     * lopsided in itself.
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

describe('the way in stands in the middle of its landing', () => {
  it('is half the landing off the end tread at every one of the twelve', () => {
    for (const o of SHIPPED_ENDS) {
      const off = approachOffsetTowardLandingDeg(
        SHIPPED_FLIGHTS[o.flightIndex],
        endTreadOf(o.flightIndex, o.end),
        STAIR.width,
        STAIR.doorwayWidth,
      )
      const half = passageLeadArcDeg(SHIPPED_FLIGHTS[o.flightIndex], STAIR.doorwayWidth, o.end) / 2
      expect(off, `${o.id}`).toBeCloseTo(half, 9)
    }
  })

  it('stands on that landing whole, with masonry at both jambs', () => {
    /*
     * AND THAT IS THE SECOND THING THE OLD PLACEMENT GOT WRONG, quietly. At half
     * a flight width the doorway's near jamb fell 1.36° SHORT of the end tread —
     * the opening was cut partly over the flight's own entry platform, which is
     * the object the owner drew an arrow at on 2026-08-16. Centred it clears the
     * treads by 2.0–2.7° and leaves the same again at the cap, because half a
     * landing minus half a doorway is the same number at both ends.
     */
    for (const o of SHIPPED_ENDS) {
      const d = doorwayFor(o)
      const landing = passageLeadArcDeg(SHIPPED_FLIGHTS[o.flightIndex], STAIR.doorwayWidth, o.end)
      const toTread = landing / 2 - d.halfDeg
      const toCap = landing / 2 - d.halfDeg
      expect(toTread, `${o.id} jamb at the treads`).toBeGreaterThan(1.9)
      expect(toCap, `${o.id} jamb at the cap`).toBeGreaterThan(1.9)
    }
  })

  it('lands on the slit’s own bearing, which is what «прямо» is in arithmetic', () => {
    for (const o of SHIPPED_ENDS) {
      const d = doorwayFor(o)
      expect(delta(d.azimuthDeg, o.azimuthDeg), o.id).toBeCloseTo(0, 9)
      /*
       * And concentric is not enough on its own — a doorway wider than the mouth
       * behind it would still show stone at the edges of the view. The mouth is
       * wider than the doorway at all twelve, by 1.20–1.62°, so the whole opening
       * is window.
       */
      const half = slitHalfDeg(o)
      expect(half - d.halfDeg, `${o.id} mouth wider than the door`).toBeGreaterThan(1.1)
      expect(
        overlapDeg(d.azimuthDeg, d.halfDeg, o.azimuthDeg, half),
        `${o.id} overlap`,
      ).toBeCloseTo(d.halfDeg + half, 9)
    }
  })
})

describe('what the walker in the doorway actually sees', () => {
  it('puts both mouths of the slit dead ahead of him at all twelve ends', () => {
    for (const o of SHIPPED_ENDS) {
      const r = readSlit(o, doorwayFor(o).azimuthDeg)
      expect(r.inner.centre, `${o.id} inner mouth`).toBeCloseTo(0, 9)
      expect(r.outer.centre, `${o.id} outer mouth`).toBeCloseTo(0, 9)
    }
  })

  it('splays the reveal equally to his left and his right, at both mouths', () => {
    /*
     * The centre being straight ahead is not on its own «прямо» — a hole can be
     * centred and still be seen edge-on. What makes the shaft read as straight is
     * that its jambs open the same amount either side of the nose, which they do
     * only when the eye is ON the opening's axis. It is exact here, so the bound
     * is a rounding tolerance and not an allowance.
     */
    for (const o of SHIPPED_ENDS) {
      const r = readSlit(o, doorwayFor(o).azimuthDeg)
      expect(r.inner.right + r.inner.left, `${o.id} inner jambs`).toBeCloseTo(0, 9)
      expect(r.outer.right + r.outer.left, `${o.id} outer jambs`).toBeCloseTo(0, 9)
      // and the reveal narrows with distance, which is what a splay looks like
      expect(r.outer.right, `${o.id} splay`).toBeLessThan(r.inner.right)
    }
  })

  it('read 24.9–25.4° to the right yesterday, and 7.9–8.4° at the far mouth', () => {
    /*
     * THE SECOND PICTURE HE SENT, KEPT AS A REFLECTION. Put the doorway back
     * where 4f92518 left it — half a flight width from the end tread, on the
     * landing, 3.3–4.1° of DRUM from the slit and passing every assertion this
     * file used to make — and the man standing in it is looking 27° off the mouth
     * he is supposed to be facing, with the shaft bending 17° across his view as
     * it runs out to the drum. Positive is his right at a foot; a head is the
     * mirror of it, because the stair is on his other hand there.
     */
    for (const o of SHIPPED_ENDS) {
      const hand = o.end === 'foot' ? 1 : -1
      const r = readSlit(o, halfFlightWidthDoorway(o))
      expect(r.inner.centre * hand, `${o.id} inner mouth`).toBeGreaterThan(24.8)
      expect(r.inner.centre * hand, `${o.id} inner mouth`).toBeLessThan(25.5)
      expect(r.outer.centre * hand, `${o.id} outer mouth`).toBeGreaterThan(7.8)
      expect(r.outer.centre * hand, `${o.id} outer mouth`).toBeLessThan(8.5)
      // the bend: 16.5–17.5° of swing between the near mouth and the far one
      expect((r.inner.centre - r.outer.centre) * hand, `${o.id} bend`).toBeGreaterThan(16.4)
    }
  })

  it('read worse still on 2026-08-16, when a foot doorway opened over its flight', () => {
    /*
     * THE FIRST PICTURE. The shift sent ALONG the climb put every foot doorway on
     * the far side of its own end tread, over the flight's second, third and
     * fourth treads, 13.6–16.4° of drum from the slit and past its far jamb — so
     * the slit was not merely off centre, it was behind the walker's shoulder.
     * Both readings are kept because both passed a suite in their day.
     */
    for (const o of FEET) {
      const r = readSlit(o, alongTheClimbDoorway(o))
      expect(r.inner.centre, `${o.id} inner mouth`).toBeGreaterThan(66.4)
      expect(r.outer.centre, `${o.id} outer mouth`).toBeGreaterThan(30.5)
      const half = slitHalfDeg(o)
      expect(
        Math.abs(delta(alongTheClimbDoorway(o), o.azimuthDeg)),
        `${o.id} outside the mouth`,
      ).toBeGreaterThan(half)
    }
    expect(HEADS).toHaveLength(6)
    expect(FEET).toHaveLength(6)
  })
})

describe('and the landing has a floor for its whole length', () => {
  /*
   * THE BILL FOR MOVING THE DOORWAY, AND IT WAS ALREADY OVERDUE.
   *
   * The walking surface at a passage end is one ramp box a flight-width across,
   * laid on the doorway's bearing — so it covered a flight width of arc and no
   * more. Half a flight width was exactly the offset that made its near edge land
   * ON the end tread, which is why the hand-off to the stair worked and why
   * nobody looked at the other end of it. The other end stopped 12.27° past the
   * tread with the cap 20.44° out: 0.60 m of landing, the far third, the part the
   * slit is cut over, with nothing under it.
   *
   * Moving the doorway to the middle of the landing without also laying the
   * landing would have opened a 0.25 m hole between the ramp and the flight. So
   * stairApproaches() lays the landing itself now, end tread to end cap, and this
   * asks the only question that matters about it: can a walker cross from the
   * first tread to the far wall without leaving the floor.
   */
  const FLIGHTS = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
  const BOXES: BoxSpec[] = [
    ...FLIGHTS.flatMap((s) => stairRampBoxes(s, STAIR.width)),
    ...stairApproaches(
      FLIGHTS,
      STAIR.width,
      innerRadiusAt,
      (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
    ).flatMap((p) => stairRampBoxes(p, STAIR.width)),
  ]

  /** Is (x, z) inside the vertical prism of this box, at within 0.1 m of `y`? */
  function carries(b: BoxSpec, x: number, y: number, z: number): boolean {
    const q = b.quaternion as [number, number, number, number]
    const conj: [number, number, number, number] = [-q[0], -q[1], -q[2], q[3]]
    // the top face is halfExtents[1] up the box's own normal from its centre
    const up = rotate(q, [0, b.halfExtents[1], 0])
    const l = rotate(conj, [x - b.position[0] - up[0], y - b.position[1] - up[1], z - b.position[2] - up[2]])
    return (
      Math.abs(l[0]) <= b.halfExtents[0] &&
      Math.abs(l[2]) <= b.halfExtents[2] &&
      Math.abs(l[1]) <= 0.1
    )
  }

  it('carries the walking line from the end tread to the end cap at all twelve ends', () => {
    for (const o of SHIPPED_ENDS) {
      const f = FLIGHTS[o.flightIndex]
      const tread = o.end === 'foot' ? f[0] : f[f.length - 1]
      const climbDir = Math.sign(f[1].azimuthDeg - f[0].azimuthDeg)
      const onward = o.end === 'foot' ? -climbDir : climbDir
      const arc = passageLeadArcDeg(f, STAIR.doorwayWidth, o.end)
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const az = tread.azimuthDeg + arc * t * onward
        const p = at(tread.midRadius, az)
        const held = BOXES.some((b) => carries(b, p.x, tread.treadY, p.z))
        expect(held, `${o.id} at ${(arc * t).toFixed(2)}° along its landing`).toBe(true)
      }
    }
  })

  it('did not, before: the far third of every landing was open air', () => {
    /*
     * Proved by rebuilding the surface the way it was — the radial ramp alone, on
     * the old bearing — and asking the same question. It fails from the doorway's
     * far edge onward, which at the foot of 2→3 is 12.27° of a 20.44° landing.
     */
    const old = stairApproaches(
      FLIGHTS,
      STAIR.width,
      innerRadiusAt,
      (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
      // radial runs only: no landing laid
    ).filter((pair) => Math.abs(delta(pair[0].azimuthDeg, pair[1].azimuthDeg)) < 1e-9)
    const oldBoxes = [
      ...FLIGHTS.flatMap((s) => stairRampBoxes(s, STAIR.width)),
      ...old.flatMap((p) => stairRampBoxes(p, STAIR.width)),
    ]
    for (const o of SHIPPED_ENDS) {
      const f = FLIGHTS[o.flightIndex]
      const tread = o.end === 'foot' ? f[0] : f[f.length - 1]
      const climbDir = Math.sign(f[1].azimuthDeg - f[0].azimuthDeg)
      const onward = o.end === 'foot' ? -climbDir : climbDir
      const arc = passageLeadArcDeg(f, STAIR.doorwayWidth, o.end)
      const p = at(tread.midRadius, tread.azimuthDeg + arc * 0.95 * onward)
      const held = oldBoxes.some((b) => carries(b, p.x, tread.treadY, p.z))
      expect(held, `${o.id} used to be held at the cap`).toBe(false)
    }
  })
})
