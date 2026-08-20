import { describe, expect, it } from 'vitest'
import { rotate, stairRampBoxes, type BoxSpec, type RampStep } from './collision'
import { planAllFlights, planFlight } from './staircase'
import { entranceApproach } from './externalStair'
import { ENTRANCE, STAIR, TOWER, WALL_LIFTS, innerRadiusAt, stairSettings } from '../config/tower'
import { ENTRANCE_APPROACH, EXTERNAL_STAIR, GROUND_Y } from '../config/site'
import {
  MODERN_SPIRAL,
  MODERN_SPIRAL_BAND_AT,
  MODERN_SPIRAL_LIFT,
  MODERN_SPIRAL_WALK_BAND,
} from '../config/modern'
import { PLAYER } from '../config/player'

/**
 * THE JOINT BETWEEN TWO RAMP BOXES — the only place a collided stair in this
 * model can have a step in it that the drawn stair does not have.
 *
 * WHY THIS FILE EXISTS. On 2026-08-20 the owner reported that the camera shakes
 * as he walks. Three things were suspects and the ramp joints were one of them:
 * every flight in this tower is drawn as stone and COLLIDED AS A CHAIN OF
 * INCLINED CUBOIDS (stairRampBoxes), because per-tread cuboids make a capsule
 * grind on the corner where two boxes meet, and a chain of flat boxes cannot
 * follow a helix without leaving a ridge where two of them abut.
 *
 * The shake turned out to be PLAYER.normalNudgeFactor and not this — the note
 * there has the trace — but the ridges are real, they were never asserted
 * anywhere, and the one number the repository did state about them was measured
 * off a band the chain does not use (config/modern.test.ts). A quantity nobody
 * asserts goes stale silently, which is exactly what happened. So this file
 * states it: what the lip is, where it is zero, how big it gets, and which of
 * those facts are theorems and which are this building's particular numbers.
 *
 * THE GEOMETRY, and it is the whole argument in three lines. Each box's top
 * face is a plane, level across the box's own transverse axis (yawThenPitch
 * gives no roll) and rising at its pitch along the travel. Two consecutive
 * boxes are built through the SAME nosing at the node between them, so their
 * planes meet there exactly. Away from that point, across the flight, they
 * diverge — and the divergence is linear in the offset, because it is the
 * difference of two planes.
 *
 * lip(u) = u · [ tan(pitchB)·(n̂·t̂B) − tan(pitchA)·(n̂·t̂A) ]
 *
 * with n̂ the unit across the joint in plan and t̂ each box's own travel
 * direction. Where the two boxes share a pitch — which is every joint in the
 * raking body of every flight — this reduces to the form the repository already
 * used: u · sin(Δyaw) · tan(pitch).
 *
 * THE TWO WAYS TO GET A ZERO fall straight out of it, and both are used in this
 * building: Δyaw = 0 with equal pitch is not needed — Δyaw = 0 alone kills it,
 * whatever the pitches are, which is why the external stair's ramp→landing
 * joint is flush across its whole 1.4 m; and u = 0 kills it on any chain whose
 * consecutive boxes share their node radius, which is every masonry flight.
 *
 * WHAT CANNOT BE DONE, and it is a theorem and not a to-do: no chain of cuboids
 * turning in plan can be flush across its width. A box's top plane would have
 * to contain the horizontal radial line at the joint ahead of it AND the one
 * behind it; those two lines lie at different heights and different azimuths,
 * so they are skew, and no plane contains a skew pair. Only Δyaw = 0 (a flight
 * straight in plan) or pitch = 0 (a landing) escape it. Lengthening the overlap
 * does not help either: along the travel the two planes differ by a constant
 * lip(u), so they intersect in a line running almost ALONG the flight rather
 * than across it, and the outgoing box never catches the incoming one however
 * far it is stretched.
 */

const DEG = Math.PI / 180

/** Height of a box's TOP face above the plan point (x, z). */
function topPlaneY(b: BoxSpec, x: number, z: number): number {
  const n = rotate(b.quaternion, [0, 1, 0])
  const up = rotate(b.quaternion, [0, b.halfExtents[1], 0])
  const c = [b.position[0] + up[0], b.position[1] + up[1], b.position[2] + up[2]]
  return c[1] - (n[0] * (x - c[0]) + n[2] * (z - c[2])) / n[1]
}

/** The box's travel heading (its local +Z) and its pitch, from its quaternion. */
function axisOf(b: BoxSpec) {
  const z = rotate(b.quaternion, [0, 0, 1])
  return { yaw: Math.atan2(z[0], z[2]), pitch: Math.asin(-z[1]) }
}

interface Joint {
  /** Height of box B's top face minus box A's, at offset `u` across the joint. */
  lip: (u: number) => number
  dyaw: number
  pitchA: number
  pitchB: number
  halfWidth: number
}

/**
 * Every joint of a built chain, as a function of the offset across it.
 *
 * The offset runs ACROSS THE JOINT — perpendicular in plan to the mean of the
 * two boxes' headings — and not radially. On a flight concentric with the drum
 * the two agree to within half a box's arc; on one that is straight in plan
 * (the external stair) the radial direction has a component ALONG the travel,
 * and sampling down it would read a height difference that is simply further up
 * the ramp rather than a step across it.
 */
function jointsOf(steps: RampStep[], width: number, stepsPerBox: number): Joint[] {
  const boxes = stairRampBoxes(steps, width, stepsPerBox)
  const out: Joint[] = []
  for (let i = 0; i < boxes.length - 1; i++) {
    const A = boxes[i]
    const B = boxes[i + 1]
    const a = axisOf(A)
    const b = axisOf(B)
    // the shared node: the step both boxes are built through
    const s = steps[Math.min((i + 1) * stepsPerBox, steps.length - 1)]
    const rad = s.azimuthDeg * DEG
    const nx = Math.sin(rad) * s.midRadius
    const nz = -Math.cos(rad) * s.midRadius

    const tA = [Math.sin(a.yaw), Math.cos(a.yaw)]
    const tB = [Math.sin(b.yaw), Math.cos(b.yaw)]
    const mx = tA[0] + tB[0]
    const mz = tA[1] + tB[1]
    const ml = Math.hypot(mx, mz)
    const lx = mz / ml
    const lz = -mx / ml

    let dyaw = b.yaw - a.yaw
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI

    out.push({
      lip: (u: number) => topPlaneY(B, nx + lx * u, nz + lz * u) - topPlaneY(A, nx + lx * u, nz + lz * u),
      dyaw,
      pitchA: a.pitch,
      pitchB: b.pitch,
      halfWidth: A.halfExtents[0],
    })
  }
  return out
}

/** The six masonry flights, exactly as Staircase builds them. */
const MASONRY = planAllFlights(stairSettings({}), WALL_LIFTS, innerRadiusAt).map((f) =>
  jointsOf(f, STAIR.width, 2),
)

/** The external stair, exactly as SiteAndEntranceStair builds it. */
const EXTERNAL = jointsOf(
  entranceApproach({
    entranceAzimuthDeg: ENTRANCE.azimuthDeg,
    outerRadius: TOWER.outerRadius,
    width: EXTERNAL_STAIR.width,
    landingLength: ENTRANCE_APPROACH.landingLength,
    risers: EXTERNAL_STAIR.risers,
    riser: EXTERNAL_STAIR.riser,
    going: EXTERNAL_STAIR.going,
    groundY: GROUND_Y,
    thresholdY: ENTRANCE.thresholdY,
    handedness: ENTRANCE_APPROACH.handedness,
  }).walkingLine,
  EXTERNAL_STAIR.width,
  1,
)

/** The steel spiral, exactly as ModernSpiralStair builds it — band and all. */
const SPIRAL_BUILD = (() => {
  const lift = MODERN_SPIRAL_LIFT
  const narrowest = MODERN_SPIRAL_WALK_BAND
  if (!lift || !narrowest) return { joints: [] as Joint[], quotedLip: 0 }
  const steps = planFlight({
    fromY: lift.fromY,
    toY: lift.toY,
    startAzimuthDeg: 0,
    innerRadiusAt: () => MODERN_SPIRAL.columnRadius,
    width: MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius,
    riserTarget: MODERN_SPIRAL.riser,
    goingTarget: MODERN_SPIRAL.going,
    winding: MODERN_SPIRAL.winding,
  })
  const flight: RampStep[] = steps.map((s) => {
    const band = MODERN_SPIRAL_BAND_AT(s.treadY) ?? narrowest
    return {
      azimuthDeg: s.azimuthDeg,
      treadY: s.treadY,
      midRadius: band.midRadius,
      halfWidth: band.width / 2,
    }
  })
  /*
   * And the same arithmetic config/modern.test.ts does, on the band IT uses:
   * the pitch taken on MODERN_SPIRAL_WALK_BAND's own mid radius, times that
   * band's half width. Reproduced here so the two figures can be compared
   * rather than argued about.
   */
  const stepAngle = Math.abs(steps[1].azimuthDeg - steps[0].azimuthDeg) * DEG
  const riser = Math.abs(steps[1].treadY - steps[0].treadY)
  const quotedPitch = Math.atan2(riser, 2 * narrowest.midRadius * Math.sin(stepAngle / 2))
  return {
    joints: jointsOf(flight, narrowest.width, 1),
    quotedLip: (narrowest.width / 2) * Math.sin(stepAngle) * Math.tan(quotedPitch),
  }
})()
const SPIRAL = SPIRAL_BUILD.joints

const ALL_MASONRY = MASONRY.flat()

describe('the lip at a ramp joint', () => {
  it('has joints to talk about at all', () => {
    expect(ALL_MASONRY.length).toBe(70)
    expect(EXTERNAL.length).toBe(1)
    expect(SPIRAL.length).toBe(20)
  })

  it('is exactly zero on the walking line of every masonry flight', () => {
    // both boxes are built THROUGH the node's nosing, so their top planes meet
    // there by construction — not approximately, identically
    for (const [i, j] of ALL_MASONRY.entries()) {
      expect(Math.abs(j.lip(0)), `masonry joint ${i}`).toBeLessThan(1e-12)
    }
  })

  it('is linear in the offset, and therefore antisymmetric about the line', () => {
    for (const [i, j] of ALL_MASONRY.entries()) {
      const at = j.lip(0.2)
      expect(j.lip(-0.2), `masonry joint ${i}`).toBeCloseTo(-at, 12)
      expect(j.lip(0.4), `masonry joint ${i}`).toBeCloseTo(2 * at, 12)
      // which is what makes a joint a kerb under one foot and a hole under the
      // other, rather than a bump the whole body rides over together
    }
  })

  it('is u·sin(Δyaw)·tan(pitch) wherever the two boxes share a pitch', () => {
    let checked = 0
    for (const j of ALL_MASONRY.concat(SPIRAL)) {
      if (Math.abs(j.pitchA - j.pitchB) > 1e-6) continue
      if (Math.abs(j.lip(0)) > 1e-9) continue // the spiral's radial jogs, below
      checked++
      const u = j.halfWidth
      const closed = u * 2 * Math.sin(Math.abs(j.dyaw) / 2) * Math.tan(Math.abs(j.pitchA))
      // to 0.1 µm and no closer: the two pitches are equal only to a few times
      // 1e-6 rad, because the walking radius creeps outward as the wall tapers
      expect(Math.abs(j.lip(u))).toBeCloseTo(closed, 7)
      // and the form the repository already wrote — u·sin(Δyaw)·tan(pitch) — is
      // this same lip sampled down the RADIUS instead of across the joint, so it
      // reads larger by exactly 1/cos(Δyaw/2): 0.25% on the masonry stair, 2.9%
      // on the spiral. Worth knowing which one a quoted number is.
      if (closed === 0) continue
      const radial = u * Math.sin(Math.abs(j.dyaw)) * Math.tan(Math.abs(j.pitchA))
      expect(radial / closed).toBeCloseTo(Math.cos(Math.abs(j.dyaw) / 2), 9)
    }
    expect(checked).toBeGreaterThan(60)
  })

  it('vanishes across the WHOLE width of a chain that is straight in plan', () => {
    /*
     * The external stair, and it is the theorem's other exclusion rather than a
     * coincidence: its one joint runs a 28.81° rake into a level landing, so the
     * PITCHES differ as much as they can, and the lip is still nil because
     * Δyaw = 0. Walked, this is the smoothest surface in the building — 0.37 mm
     * of peak-to-peak deviation over 120 frames against 1.2 mm anywhere else —
     * and this is why.
     */
    const [j] = EXTERNAL
    expect(Math.abs(j.dyaw)).toBeLessThan(1e-12)
    expect(Math.abs(j.pitchA - j.pitchB)).toBeGreaterThan(0.4)
    for (const u of [0, 0.175, 0.35, 0.7, -0.35, -0.7]) {
      expect(Math.abs(j.lip(u)), `external stair at u=${u}`).toBeLessThan(1e-12)
    }
  })
})

describe('how big the lip actually gets in this tower', () => {
  /**
   * How far the capsule's AXIS can get from the walking line before its
   * inflated surface meets the passage wall. The collider is STAIR.width across
   * and the controller keeps characterOffset clear of anything it touches, so
   * the walker cannot reach the outer part of the box at all — which is the
   * difference between the lip the geometry has and the lip anybody feels.
   */
  const reach = STAIR.width / 2 - PLAYER.radius - PLAYER.characterOffset

  it('is 12.6 mm at the furthest a body can stand from the masonry walking line', () => {
    expect(reach).toBeCloseTo(0.13, 6)
    const worst = Math.max(...ALL_MASONRY.map((j) => Math.abs(j.lip(reach))))
    // [MEASURED] on the built chain: 12.62 mm, once every 0.573 m of plan — one
    // step in about 24 frames at walking pace. Episodic, not the 30 Hz saw the
    // owner reported; see PLAYER.normalNudgeFactor for what that was.
    expect(worst).toBeGreaterThan(0.012)
    expect(worst).toBeLessThan(0.013)
  })

  it('is 43.7 mm at the collider edge, where no body in this model can go', () => {
    const worst = Math.max(...ALL_MASONRY.map((j) => Math.abs(j.lip(STAIR.width / 2))))
    expect(worst).toBeGreaterThan(0.043)
    expect(worst).toBeLessThan(0.044)
    // 3.4 times the reachable figure, and quoting it as the flight's lip would
    // be describing a kerb on stone the walker's shoulder is already inside
  })

  it('grows with stepsPerBox and shrinks with the collided width, and nothing else', () => {
    /*
     * The three levers, measured rather than argued, on masonry flight 0. None
     * of them touches what stairRampBoxes exists to prevent — a capsule grinding
     * on the corner between per-tread cuboids — because all three change the
     * number and width of the boxes, not their convexity.
     *
     * NOT SPENT HERE, and deliberately: the shake was the nudge, and after that
     * was fixed the walk over these joints measures 1.9 mm on the masonry stair
     * against 1.2 mm on a flat floor. Halving the lip would buy tenths of a
     * millimetre for +65 colliders. Rule 7's habit, applied to a controller
     * instead of a hypothesis: the fix goes where the measurement points.
     */
    const flight = planAllFlights(stairSettings({}), WALL_LIFTS, innerRadiusAt)[0]
    const edge = (spb: number, width: number) =>
      Math.max(...jointsOf(flight, width, spb).map((j) => Math.abs(j.lip(width / 2))))

    const one = edge(1, STAIR.width)
    const two = edge(2, STAIR.width)
    const four = edge(4, STAIR.width)
    expect(two / one).toBeGreaterThan(1.9)
    expect(two / one).toBeLessThan(2.1)
    expect(four).toBeGreaterThan(two)

    // and linear in the collided width, at fixed stepsPerBox
    expect(edge(2, STAIR.width / 2)).toBeCloseTo(two / 2, 9)
  })
})

describe('the steel spiral, whose lip the repository had wrong', () => {
  /*
   * config/modern.test.ts computes this flight's lip from
   * MODERN_SPIRAL_WALK_BAND — half-width 0.1113 m — and its note reports the
   * result as "0.079 m before, 0.040 m now". The chain is not built on that
   * band. ModernSpiralStair takes MODERN_SPIRAL_BAND_AT(y) for every tread,
   * which below the well's rim opens out to the balustrade instead, and the
   * boxes it produces are 0.10125…0.18125 m of half-width. The lip that gets
   * built is therefore 57.8 mm all down the wide run and 73.9 mm at the worst
   * joint — not the 39.6 mm that arithmetic gives, which the note rounds to
   * 0.040.
   *
   * The 40 mm was true of the band and false of the stair, which is the same
   * shape of fault as lamp.test.ts agreeing with a solve aimed at the wrong
   * stone (88da132): a test that measures the right quantity on the wrong
   * object agrees with itself forever.
   */
  it('is built on a wider band than the one the lip was quoted from', () => {
    const built = Math.max(...SPIRAL.map((j) => j.halfWidth))
    const quoted = MODERN_SPIRAL_WALK_BAND!.width / 2
    expect(quoted).toBeCloseTo(0.1113, 4)
    expect(built).toBeCloseTo(0.18125, 5)
    expect(built).toBeGreaterThan(quoted)
  })

  it('has a 57.8 mm lip on its wide run and 73.9 mm at its worst joint', () => {
    const uniform = SPIRAL.slice(0, 9).map((j) => Math.abs(j.lip(j.halfWidth)))
    for (const v of uniform) expect(v).toBeCloseTo(0.05782, 5)
    const worst = Math.max(...SPIRAL.map((j) => Math.abs(j.lip(j.halfWidth))))
    expect(worst).toBeGreaterThan(0.073)
    expect(worst).toBeLessThan(0.075)
    // and the figure config/modern.test.ts quotes, computed here the way that
    // file computes it, so the two can be compared instead of argued about
    expect(SPIRAL_BUILD.quotedLip).toBeCloseTo(0.0396, 4)
    expect(worst / SPIRAL_BUILD.quotedLip).toBeGreaterThan(1.8)
  })

  it('is not even flush on its own walking line where the band changes width', () => {
    /*
     * Three joints of the twenty have a step ON the centre line — 12.4 mm at one
     * of them. stairRampBoxes takes each box's radius from the INTERSECTION of
     * its two ends' bands when a per-step halfWidth is given, so a change of
     * band between two treads moves the box's centre line radially and the chain
     * jogs sideways. The masonry flights never do this because they pass no
     * halfWidth at all, and the check above is why that distinction is worth
     * keeping in the signature.
     */
    const offLine = SPIRAL.filter((j) => Math.abs(j.lip(0)) > 1e-9)
    expect(offLine).toHaveLength(3)
    expect(Math.max(...offLine.map((j) => Math.abs(j.lip(0))))).toBeCloseTo(0.01236, 5)
  })
})
