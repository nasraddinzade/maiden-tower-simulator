/**
 * THE HEAD-HOUSE, as arithmetic.
 *
 * Cast at the SHIPPED configuration wherever it can be — the roof flight, the
 * opening App actually cuts in the paving, PLAYER.stairHeadroom — because every
 * one of these properties is about a walker getting out of a real tower, and a
 * synthetic wedge would let all of them pass while the built one was 40° round
 * the drum from the stair. Rule 6: this file touches no renderer.
 */

import { describe, expect, it } from 'vitest'
import { FLOORS, ROOF, STAIR, STAIRHEAD, WALL_LIFTS, innerRadiusAt } from '../config/tower'
import { PLAYER } from '../config/player'
import { rotate } from './collision'
import {
  STAIRHEAD_ARC_DEG,
  stairhead,
  stairheadCheeks,
  stairheadClearance,
  stairheadColliders,
  stairheadRibs,
  stairheadSoffitY,
  type StairheadOpening,
} from './stairhead'
import { planAllFlights, stairwellSpanDeg, type StepPlacement } from './staircase'

const DEG = Math.PI / 180

/** The roof flight, planned exactly as App plans it. */
function roofFlight(): StepPlacement[] {
  const flights = planAllFlights(
    {
      winding: STAIR.winding,
      riserTarget: STAIR.riserTarget,
      goingTarget: STAIR.goingTarget,
      width: STAIR.width,
      wallClearance: STAIR.wallClearance,
      startAzimuthDeg: STAIR.startAzimuthDeg,
      landingLength: STAIR.landingLength,
      endLandingLength: STAIR.endLandingLength,
    },
    WALL_LIFTS.map((l) => ({ fromY: l.fromY, toY: l.toY, landingsAtY: l.landingsAtY })),
    innerRadiusAt,
  )
  return flights[flights.length - 1]
}

/** The opening in the paving, exactly as App cuts it. */
function deckOpening(steps: StepPlacement[]): StairheadOpening {
  const span = stairwellSpanDeg(
    steps,
    ROOF.deckY - ROOF.pavingDepth,
    PLAYER.stairHeadroom,
  )
  if (!span) throw new Error('the roof flight cuts no opening in the paving')
  const inner = innerRadiusAt(ROOF.deckY) + STAIR.wallClearance
  return {
    centreAzimuthDeg: span.centreAzimuthDeg,
    widthDeg: span.widthDeg,
    innerRadius: inner,
    outerRadius: inner + STAIR.width + 0.1,
  }
}

describe('stairhead — which end is the way out', () => {
  /**
   * The apex belongs at the head of the flight and it is FOUND, not assumed.
   * Reversing the steps must reverse the wedge; a function that hard-coded
   * `centre − width/2` would pass the shipped case and put the glass flat on the
   * paving over the door for the other winding of the stair.
   */
  it('puts the apex at the end of the opening nearest the last tread', () => {
    const steps = roofFlight()
    const opening = deckOpening(steps)
    const built = stairhead(opening, steps, ROOF.deckY, PLAYER.stairHeadroom)
    expect(built).not.toBeNull()
    const head = steps[steps.length - 1].azimuthDeg
    const foot = steps[0].azimuthDeg
    expect(Math.abs(built!.exitAzimuthDeg - head)).toBeLessThan(
      Math.abs(built!.footAzimuthDeg - head),
    )
    expect(Math.abs(built!.footAzimuthDeg - foot)).toBeLessThan(
      Math.abs(built!.exitAzimuthDeg - foot),
    )

    const mirrored = stairhead(opening, [...steps].reverse(), ROOF.deckY, PLAYER.stairHeadroom)
    expect(mirrored!.exitAzimuthDeg).toBeCloseTo(built!.footAzimuthDeg, 9)
    expect(mirrored!.footAzimuthDeg).toBeCloseTo(built!.exitAzimuthDeg, 9)
  })

  it('builds nothing where there is nothing to build', () => {
    const steps = roofFlight()
    const opening = deckOpening(steps)
    expect(stairhead(undefined, steps, ROOF.deckY, PLAYER.stairHeadroom)).toBeNull()
    expect(stairhead(opening, [], ROOF.deckY, PLAYER.stairHeadroom)).toBeNull()
    expect(stairhead(opening, steps, ROOF.deckY, 0)).toBeNull()
    expect(
      stairhead({ ...opening, widthDeg: 0 }, steps, ROOF.deckY, PLAYER.stairHeadroom),
    ).toBeNull()
  })
})

describe('stairhead — the rake', () => {
  /**
   * The apex is the stair's own clear height and the foot is the paving. Those
   * two ends are the whole definition of the wedge, and nothing in this module
   * may introduce a third height.
   */
  it('stands one headroom over the deck at the way out and lands on it at the foot', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    expect(stairheadSoffitY(h, h.exitAzimuthDeg)).toBeCloseTo(
      ROOF.deckY + PLAYER.stairHeadroom,
      9,
    )
    expect(stairheadSoffitY(h, h.footAzimuthDeg)).toBeCloseTo(ROOF.deckY, 9)
  })

  /**
   * A STRAIGHT line, which is what every frame of it shows and what an offset of
   * the treads would not be: the roof climb has a landing in it, and an offset
   * surface goes flat over a landing. Tested as a second difference, so a rake
   * that kinked anywhere along its length would fail wherever the kink was.
   */
  it('is one plane from end to end, not an offset of the treads', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const ribs = stairheadRibs(h, STAIRHEAD_ARC_DEG)
    expect(ribs.length).toBeGreaterThan(8)
    for (let i = 1; i < ribs.length - 1; i += 1) {
      const second =
        ribs[i + 1].soffitY - 2 * ribs[i].soffitY + ribs[i - 1].soffitY
      expect(Math.abs(second)).toBeLessThan(1e-9)
    }
    // and the treads underneath are NOT one plane, which is the point
    const treads = steps.map((s) => s.treadY)
    expect(new Set(treads).size).toBeLessThan(treads.length)
  })

  /** Off the ends it is clamped, so nothing samples a soffit under the paving. */
  it('never dips below the paving or climbs past the apex', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    for (let az = -360; az <= 360; az += 3) {
      const y = stairheadSoffitY(h, az)
      expect(y).toBeGreaterThanOrEqual(ROOF.deckY - 1e-12)
      expect(y).toBeLessThanOrEqual(ROOF.deckY + PLAYER.stairHeadroom + 1e-12)
    }
  })
})

describe('stairhead — a visitor can walk out', () => {
  /**
   * THE PROPERTY THE WHOLE THING EXISTS FOR. A structure over the exit you
   * cannot pass is worse than no structure, so every tread under the wedge keeps
   * more than the walker's own height of clear air over it.
   *
   * The margin is asserted at PLAYER.height and the actual figure is pinned
   * separately below, because those are two different statements: one is what
   * must never break, the other is what the shipped numbers happen to give.
   */
  it('keeps more than the walker is tall over every tread it covers', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const tight = stairheadClearance(h, steps)
    expect(tight).not.toBeNull()
    expect(tight!.minimum).toBeGreaterThan(PLAYER.height)
  })

  /**
   * WHERE THE CHORD IS TIGHTEST, and it is not an accident of sampling: the
   * soffit falls at the stair's MEAN gradient and the treads fall at its true
   * one, so the two are closest at the top of the last riser, where the level
   * head platform begins. 1.864 m on the shipped configuration.
   *
   * Pinned because it is the number that would move first if anyone changed the
   * riser, the headroom or the margin stairwellSpanDeg() puts on the opening,
   * and because config/tower.ts's STAIRHEAD note quotes it as the reason the
   * apex is built at the derived 2.30 rather than the frames' 2.1.
   */
  it('is tightest over the last riser, at 1.86 m', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const tight = stairheadClearance(h, steps)!
    expect(tight.minimum).toBeCloseTo(1.864, 2)
    expect(tight.treadY).toBeCloseTo(ROOF.deckY, 6)
    // the tread it is over is the first one at deck level going up-stair, i.e.
    // the foot of the head platform, not the last tread of it
    const atDeck = steps.filter((s) => Math.abs(s.treadY - ROOF.deckY) < 1e-9)
    const furthestDownStair = atDeck.reduce((a, b) =>
      Math.abs(b.azimuthDeg - h.footAzimuthDeg) < Math.abs(a.azimuthDeg - h.footAzimuthDeg)
        ? b
        : a,
    )
    expect(tight.azimuthDeg).toBeCloseTo(furthestDownStair.azimuthDeg, 6)
  })

  /** The clearance only ever reports treads the wedge is actually over. */
  it('ignores treads that have the paving over them, not the glass', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const lo = Math.min(h.exitAzimuthDeg, h.footAzimuthDeg)
    const hi = Math.max(h.exitAzimuthDeg, h.footAzimuthDeg)
    const outside = steps.filter((s) => s.azimuthDeg < lo - 1e-9 || s.azimuthDeg > hi + 1e-9)
    expect(outside.length).toBeGreaterThan(0)
    const covered = steps.filter((s) => s.azimuthDeg >= lo && s.azimuthDeg <= hi)
    const tight = stairheadClearance(h, covered)!
    expect(tight.minimum).toBeCloseTo(stairheadClearance(h, steps)!.minimum, 9)
  })
})

describe('stairhead — the cheeks stand on stone', () => {
  /**
   * The inner cheek fills the strip of paving between the well and the storey-8
   * room face, and that strip is STAIR.wallClearance wide because the opening's
   * inner radius is the room face plus exactly that. A cheek thickness that did
   * not match it would either hang a ledge of paving over the room or stand the
   * wall out past the room face on nothing.
   */
  it('fills the paving between the well and the room face exactly', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const [inner, outer] = stairheadCheeks(h, STAIRHEAD)
    expect(STAIRHEAD.cheekThickness).toBeCloseTo(STAIR.wallClearance, 9)
    expect(inner.innerRadius).toBeCloseTo(ROOF.deckInnerRadius, 9)
    expect(inner.outerRadius).toBeCloseTo(h.innerRadius, 9)
    expect(outer.innerRadius).toBeCloseTo(h.outerRadius, 9)
    // and neither of them stands over the hole
    expect(inner.outerRadius).toBeLessThanOrEqual(h.innerRadius + 1e-12)
    expect(outer.innerRadius).toBeGreaterThanOrEqual(h.outerRadius - 1e-12)
  })

  /** Nothing it is built of reaches anywhere near the parapet ring. */
  it('stays clear of the parapet by more than a metre', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const [, outer] = stairheadCheeks(h, STAIRHEAD)
    expect(outer.outerRadius).toBeLessThan(ROOF.deckOuterRadius - 1)
    expect(outer.outerRadius).toBeLessThan(ROOF.channelInnerRadius)
  })

  /** The stair fits between the cheeks with its own side clearance untouched. */
  it('leaves the flight its full width between the cheeks', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    expect(h.outerRadius - h.innerRadius).toBeGreaterThanOrEqual(STAIR.width)
  })
})

describe('stairhead — the colliders describe the shape that is drawn', () => {
  /**
   * The roof boxes are PITCHED, and a box pitched the wrong way about the wrong
   * axis is the fault this repo has met on the balustrade panes and on the wall
   * bands. So the test performs the rotation instead of trusting it: take each
   * roof box's own downward face centre, and it must land on the soffit the
   * drawn glass lies on.
   */
  it('hangs the roof with its underside on the soffit, ends and all', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const boxes = stairheadColliders(h, STAIRHEAD, STAIRHEAD_ARC_DEG)
    const roof = boxes.filter((b) => b.kind === 'guard')
    expect(roof.length).toBeGreaterThan(8)
    for (const b of roof) {
      /*
       * BOTH TANGENTIAL ENDS, not just the middle. A box hung by its centre with
       * no pitch at all puts its underside centre exactly on the soffit and is
       * level: only its ends give it away, and they give it away by 0.075 m
       * against a rake of 0.358. The 0.003 m left over at the corners is the
       * chord standing 1.06 over its own arc — floorColliders' overlap, which
       * every box in this model carries.
       */
      for (const alongZ of [-b.halfExtents[2], 0, b.halfExtents[2]]) {
        const off = rotate(b.quaternion, [0, -b.halfExtents[1], alongZ])
        const p = [
          b.position[0] + off[0],
          b.position[1] + off[1],
          b.position[2] + off[2],
        ]
        const az = (Math.atan2(p[0], -p[2]) / DEG + 360) % 360
        expect(Math.abs(p[1] - stairheadSoffitY(h, az))).toBeLessThan(0.01)
      }
    }
  })

  /**
   * The cheeks stand on the paving and reach the rake — no box floating over the
   * deck, none buried under it, none standing proud of the glass.
   */
  it('stands the cheek boxes on the deck and stops them at the rake', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const walls = stairheadColliders(h, STAIRHEAD, STAIRHEAD_ARC_DEG).filter(
      (b) => b.kind === 'wall',
    )
    expect(walls.length).toBeGreaterThan(16)
    for (const b of walls) {
      const bottom = b.position[1] - b.halfExtents[1]
      const top = b.position[1] + b.halfExtents[1]
      const az = (Math.atan2(b.position[0], -b.position[2]) / DEG + 360) % 360
      expect(bottom).toBeCloseTo(ROOF.deckY, 9)
      expect(top).toBeCloseTo(stairheadSoffitY(h, az), 6)
    }
  })

  /**
   * NOTHING BLOCKS THE WAY OUT. Every solid the head-house raises stands either
   * inboard of the well's inner edge or outboard of its outer one; the arc
   * between them is air from the paving to the glass, which is what a doorway
   * is. This is the property the brief calls out by name and it is the one that
   * a later "tidy the wedge into one box" would break first.
   */
  it('raises no solid across the well itself below the rake', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const boxes = stairheadColliders(h, STAIRHEAD, STAIRHEAD_ARC_DEG)
    const walkY = ROOF.deckY + PLAYER.height / 2
    for (const b of boxes.filter((x) => x.kind === 'wall')) {
      // the box's own +X is radial; its corners in radius are centre ± halfX
      const r = Math.hypot(b.position[0], b.position[2])
      const near = r - b.halfExtents[0]
      const far = r + b.halfExtents[0]
      const insideWell = far > h.innerRadius + 1e-9 && near < h.outerRadius - 1e-9
      expect(insideWell).toBe(false)
    }
    // and at walking height the only thing over the well is the rake, which at
    // the way out is a whole headroom up
    expect(stairheadSoffitY(h, h.exitAzimuthDeg)).toBeGreaterThan(walkY + PLAYER.height / 2)
  })

  /**
   * The wedge is described as finely as the stone it stands on. Coarser and the
   * raking roof steps at every joint; the drawn sweep and the collider chain use
   * the same constant so the two cannot part company.
   */
  it('steps the rake by less than a riser at every joint', () => {
    const steps = roofFlight()
    const h = stairhead(deckOpening(steps), steps, ROOF.deckY, PLAYER.stairHeadroom)!
    const ribs = stairheadRibs(h, STAIRHEAD_ARC_DEG)
    for (let i = 1; i < ribs.length; i += 1) {
      expect(Math.abs(ribs[i].soffitY - ribs[i - 1].soffitY)).toBeLessThan(STAIR.riserTarget)
    }
    expect(FLOORS.length).toBeGreaterThan(0)
  })
})
