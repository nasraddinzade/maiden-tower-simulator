import { describe, expect, it } from 'vitest'
import {
  GUARDED_OPENINGS,
  MODERN_SPIRAL,
  MODERN_SPIRAL_BAND_AT,
  MODERN_SPIRAL_DRAWN_LINE,
  MODERN_SPIRAL_GUARD_AT,
  MODERN_SPIRAL_LIFT,
  MODERN_SPIRAL_RAIL,
  MODERN_SPIRAL_RISER,
  MODERN_SPIRAL_STEP_ANGLE_DEG,
  MODERN_SPIRAL_WALK_BAND,
  MODERN_SPIRAL_WELL,
  MODERN_SPIRAL_WELL_RADIUS,
  OPENING_GUARD,
} from './modern'
import { FLOORS, LIFTS, TOWER } from './tower'
import { PLAYER } from './player'
import { capsuleRadiusAtHeight } from '../lib/collision'
import { planFlight } from '../lib/staircase'

/**
 * The glass guards round the floor openings.
 *
 * These are config derivations, not renderer behaviour: which holes exist is
 * FLOORS' business, which of them a guard rings is this file's, and the answer
 * has to follow from the survey rather than from a list written out by hand.
 * The fault they pin is that the openings were drawn for months as bare holes
 * in a walking surface while the guard that MEASURED them was built nowhere.
 */
describe('GUARDED_OPENINGS', () => {
  it('rings floors, not vaults', () => {
    /*
     * OPENINGS is keyed by the storey whose VAULT is pierced — 1, 4 and 7 — and
     * a guard stands on the floor ABOVE each of those. Reading the key as the
     * guarded storey would hang three glass collars in the ceilings and leave
     * every hole a walker can reach unfenced.
     */
    for (const g of GUARDED_OPENINGS) {
      expect(FLOORS[g.floorIndex].hasFloorOpening).toBe(true)
      expect(g.floorY).toBe(FLOORS[g.floorIndex].floorY)
      // the radius is the vault BELOW, which is the one that cuts this floor
      expect(g.radius).toBe(FLOORS[g.floorIndex - 1].oculusRadius)
      expect(g.radius).toBeGreaterThan(0)
    }
  })

  it('leaves out the well the steel spiral comes up through, and only that', () => {
    /*
     * The one exclusion. MODERN_SPIRAL_VS_OPENING already records that the
     * stair measures WIDER than the hole it rises through — Ø 2.2 ±0.4 against
     * Ø 1.8 ±0.3 — so a ring standing on that opening's edge stands inside the
     * flight, and the walker who has just climbed it is inside the ring. That
     * is a cage across the visitor route's first turn, not a guard.
     *
     * If either figure is ever re-surveyed so the stair fits clear inside the
     * hole, this test fails and the exclusion should be revisited rather than
     * inherited.
     */
    const spiralFloors = LIFTS.filter((l) => l.kind === 'modernSpiral').map(
      (l) => l.toFloorNumber - 1,
    )
    expect(spiralFloors.length).toBeGreaterThan(0)

    for (const i of spiralFloors) {
      expect(FLOORS[i].hasFloorOpening).toBe(true)
      expect(GUARDED_OPENINGS.some((g) => g.floorIndex === i)).toBe(false)
      // the reason, stated as geometry rather than as a note
      expect(FLOORS[i - 1].oculusRadius).toBeLessThan(MODERN_SPIRAL.outerRadius)
    }

    // everything else pierced IS guarded — no hole quietly left out
    const expected = FLOORS.filter((f) => f.hasFloorOpening && !spiralFloors.includes(f.index))
    expect(GUARDED_OPENINGS.map((g) => g.floorIndex)).toEqual(expected.map((f) => f.index))
  })

  it('guards to a height the walker cannot step over or onto', () => {
    // the band config/tower.ts read the openings against
    expect(OPENING_GUARD.height).toBeGreaterThanOrEqual(1.0)
    expect(OPENING_GUARD.height).toBeLessThanOrEqual(1.1)
    // and well past the autostep, or the fence becomes a launch pad
    expect(OPENING_GUARD.height).toBeGreaterThan(PLAYER.autostepMaxHeight * 2)
  })
})

/**
 * THE MODERN SPIRAL, AND WHETHER A BODY GETS UP IT.
 *
 * "На верхней части винтовой лестницы очень сложно проходить пешком." Walked
 * with the deterministic harness before anything was touched: on the drawn
 * walking line the capsule climbed eleven treads and stopped dead — feet 2.089,
 * 2.141 and 2.276 m on three runs aimed at three different lines, and every one
 * of them pinned at r 0.581. Aimed inward from the stall it moved at once, and
 * climbed the same treads to the top. The obstruction is radial, it is the rim
 * of the well the flight rises through, and the arithmetic below is all of it.
 *
 * These are config derivations, not renderer behaviour: where a body may stand
 * follows from two surveyed radii and the walker's own size, and it must follow
 * from them rather than from a width somebody typed into a component.
 */
describe('the band the steel spiral is collided on', () => {
  const band = MODERN_SPIRAL_WALK_BAND!

  it('exists at all — the survey does leave room for a walker', () => {
    expect(band).not.toBeNull()
    expect(MODERN_SPIRAL_WELL_RADIUS).toBe(FLOORS[0].oculusRadius)
    expect(MODERN_SPIRAL_WELL_RADIUS).toBeGreaterThan(0)
  })

  it('fits a walker through the well AT EVERY POINT OF IT, not just on the line', () => {
    /*
     * THE TEST THE OLD COLLIDER FAILED, and it failed it by 0.274 m.
     *
     * The band used to be 0.55 m wide about the DRAWN walking line at 0.57875,
     * so it ran out to 0.85375 while a body fits no further than 0.900 − 0.300 −
     * 0.020 = 0.580. Standing anywhere in that outer quarter-metre put the
     * walker's shoulders inside the slab, and the ramp chain's joints — which
     * stand ~0.08 m proud on the inner side and so shed a capsule outward —
     * delivered them there within a turn.
     *
     * The line ALONE passed: 0.57875 + 0.32 = 0.89875 against 0.900, clear by
     * 1.25 mm. That is why the fault has to be stated over the band and not over
     * the line, and why a test written the obvious way would have gone on
     * passing while nobody could climb the stair.
     */
    for (let t = 0; t <= 1; t += 0.05) {
      const r = band.innerRadius + band.width * t
      expect(r + PLAYER.radius + PLAYER.characterOffset).toBeLessThanOrEqual(
        MODERN_SPIRAL_WELL_RADIUS + 1e-12,
      )
    }
  })

  it('stands on the drawn treads, end to end', () => {
    // a walking surface that reached past the steel would be a floor in mid-air,
    // and one that started inside the tube would be a floor inside a column
    expect(band.innerRadius).toBeGreaterThanOrEqual(MODERN_SPIRAL.columnRadius)
    expect(band.outerRadius).toBeLessThanOrEqual(MODERN_SPIRAL.outerRadius)
  })

  it('leaves a flight the character controller can still climb', () => {
    /*
     * The bound on this whole change, and the reason the band is not simply
     * pulled as far in as it will go. Bringing the walking line in shortens the
     * going without touching the riser — planFlight holds the step ANGLE, which
     * it takes from the drawn line — so the pitch on the collided line is
     * steeper than the pitch on the drawn one, and past PLAYER's climb limit a
     * stair that a body fits on becomes a stair a body cannot mount. Measured
     * here: 31.8° drawn, 37.4° collided, against a 60° limit.
     */
    const lift = LIFTS.find((l) => l.kind === 'modernSpiral')!
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
    expect(steps.length).toBeGreaterThan(1)
    const stepAngleRad = Math.abs(steps[1].azimuthDeg - steps[0].azimuthDeg) * (Math.PI / 180)
    const riser = Math.abs(steps[1].treadY - steps[0].treadY)
    // chord between two nosings, taken on the line the ramp chain is built on
    const chord = 2 * band.midRadius * Math.sin(stepAngleRad / 2)
    const pitchDeg = Math.atan2(riser, chord) * (180 / Math.PI)
    expect(pitchDeg).toBeLessThan(PLAYER.maxSlopeClimbAngleDeg)

    /*
     * And the lip, which is the other thing the band's width buys. A chain of
     * yawed boxes cannot follow a helix: consecutive top planes meet on the
     * walking line and diverge away from it, by half-width × sin(step angle) ×
     * tan(pitch). Narrowing the band beats steepening it — 0.079 m before,
     * 0.040 m now — and the whole point is that this number falls rather than
     * rises when the stair is made walkable.
     */
    const lip = (band.width / 2) * Math.sin(stepAngleRad) * Math.tan(pitchDeg * (Math.PI / 180))
    const drawnLine = MODERN_SPIRAL.columnRadius + (MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius) / 2
    const drawnPitch = Math.atan2(riser, 2 * drawnLine * Math.sin(stepAngleRad / 2))
    const drawnLip = (0.55 / 2) * Math.sin(stepAngleRad) * Math.tan(drawnPitch)
    expect(lip).toBeLessThan(drawnLip)
  })
})

/**
 * THE STEEL SPIRAL AS SOMETHING A BODY CAN WALK, which it was not.
 *
 * [OWNER] 2026-08-17: «по винтовой лестнице проходить сложно. постоянно через
 * перила обваливаешься. кажется там перила просто фасад прозрачный. плюс
 * последние ступени неудобно на ярус выходят.»
 *
 * Three faults and all three were arithmetic. The balustrade had no collider at
 * all — measured on the built model, a ray straight outward from the tenth tread
 * found the drum at 2.99 m and nothing where the posts are drawn 0.59 m ahead.
 * The band was 0.2225 m wide on treads drawn 1.0425 m wide, because the rim of
 * the well was applied to every tread instead of to the ones that pass through
 * it. And the collider stopped AT the last nosing while the drawn tread runs
 * half a wedge further, so arriving meant overrunning the floor onto steel with
 * nothing under it.
 *
 * These are config derivations, not renderer behaviour: where a body may stand,
 * and where the wall beside it is, must follow from the survey and the walker's
 * own size rather than from numbers typed into a component.
 */
describe('the steel spiral, as a thing to walk', () => {
  const treads = () =>
    planFlight({
      fromY: MODERN_SPIRAL_LIFT!.fromY,
      toY: MODERN_SPIRAL_LIFT!.toY,
      startAzimuthDeg: 0,
      innerRadiusAt: () => MODERN_SPIRAL.columnRadius,
      width: MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius,
      riserTarget: MODERN_SPIRAL.riser,
      goingTarget: MODERN_SPIRAL.going,
      winding: MODERN_SPIRAL.winding,
    })

  it('agrees with the planner about the angle each tread turns through', () => {
    /*
     * The band, the balustrade and the landing are all built from this config
     * without any of them being able to see the planned flight. If the two
     * derivations ever part company the guard stops standing over the treads.
     */
    const steps = treads()
    expect(MODERN_SPIRAL_STEP_ANGLE_DEG).toBeCloseTo(steps[0].angularWidthDeg, 12)
    expect(MODERN_SPIRAL_RISER).toBeCloseTo(steps[1].treadY - steps[0].treadY, 12)
    expect(MODERN_SPIRAL_DRAWN_LINE).toBeCloseTo(steps[0].midRadius, 12)
  })

  it('puts the rail face where a shoulder meets the drawn tube', () => {
    // the posts are drawn on their axis; a body meets the near side of them
    expect(MODERN_SPIRAL_RAIL.postRadius).toBeCloseTo(
      MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.rodRadius * 2,
      12,
    )
    expect(MODERN_SPIRAL_RAIL.faceRadius).toBeCloseTo(
      MODERN_SPIRAL_RAIL.postRadius - MODERN_SPIRAL.rodRadius,
      12,
    )
    // and inside the treads, or the guard would stand over nothing
    expect(MODERN_SPIRAL_RAIL.faceRadius).toBeLessThan(MODERN_SPIRAL.outerRadius)
  })

  it('reads the well as a solid with two levels, not as a radius', () => {
    expect(MODERN_SPIRAL_WELL).not.toBeNull()
    expect(MODERN_SPIRAL_WELL!.radius).toBe(MODERN_SPIRAL_WELL_RADIUS)
    expect(MODERN_SPIRAL_WELL!.topY).toBe(MODERN_SPIRAL_LIFT!.toY)
    expect(MODERN_SPIRAL_WELL!.topY - MODERN_SPIRAL_WELL!.bottomY).toBeCloseTo(TOWER.floorSlab, 12)
  })

  it('never lets a body into the well, on any tread of the flight', () => {
    /*
     * The property MODERN_SPIRAL_WALK_BAND holds at one height, held at all of
     * them — over the whole band, not over the walking line. 9c97c79 measured
     * what the line-only version costs: the walker jammed at r 0.581 against a
     * rim at 0.900, three runs out of three.
     */
    for (const s of treads()) {
      const band = MODERN_SPIRAL_BAND_AT(s.treadY)!
      expect(band).not.toBeNull()
      for (let t = 0; t <= 1; t += 0.1) {
        const r = band.innerRadius + band.width * t
        for (let y = MODERN_SPIRAL_WELL!.bottomY; y <= MODERN_SPIRAL_WELL!.topY; y += 0.02) {
          const half = capsuleRadiusAtHeight(PLAYER.radius, PLAYER.height, s.treadY, y)
          if (half === 0) continue
          expect(r + half).toBeLessThanOrEqual(MODERN_SPIRAL_WELL!.radius - PLAYER.characterOffset + 1e-12)
        }
      }
    }
  })

  it('gives back the 0.14 m the flat band was taking from most of the flight', () => {
    /*
     * WHAT THE OWNER WAS ACTUALLY WALKING ON. Two thirds of this stair is
     * nowhere near the slab, and on those treads the band now runs out to the
     * balustrade — so the rail is a thing you lean on rather than an edge you
     * are invited to and then fall through.
     */
    const flat = MODERN_SPIRAL_WALK_BAND!
    const foot = MODERN_SPIRAL_BAND_AT(MODERN_SPIRAL_RISER)!
    expect(foot.width - flat.width).toBeCloseTo(0.14, 6)
    expect(foot.outerRadius + PLAYER.radius + PLAYER.characterOffset).toBeCloseTo(
      MODERN_SPIRAL_RAIL.faceRadius,
      12,
    )

    // and the count: how many treads keep the full width, and how many pay for
    // the well. Asserted so that moving the storey height says which.
    const wide = treads().filter(
      (s) => MODERN_SPIRAL_BAND_AT(s.treadY)!.width > flat.width + 1e-9,
    )
    expect(wide.length).toBe(14)
    expect(treads().length - wide.length).toBe(8)
  })

  it('stands the guard where the walker is stopped, whatever is standing there', () => {
    /*
     * Below the slab that is the balustrade, and the two coincide by
     * construction. Above it the rail is inside storey 2's floor and the thing
     * beside the walker is the rim — 24 cuboids whose inner faces are chords,
     * 0.900 m at the middle of each sector and 1.024 m at every corner. The
     * walk that found this jammed in one of those corners.
     */
    for (const s of treads()) {
      const band = MODERN_SPIRAL_BAND_AT(s.treadY)!
      const guard = MODERN_SPIRAL_GUARD_AT(s.treadY)!
      expect(guard.faceRadius).toBeCloseTo(
        band.outerRadius + PLAYER.radius + PLAYER.characterOffset,
        12,
      )
      expect(guard.faceRadius).toBeLessThanOrEqual(MODERN_SPIRAL_RAIL.faceRadius + 1e-12)
      // where it is inside the well it is the stone, and stone stops at the floor
      if (guard.faceRadius < MODERN_SPIRAL_WELL!.radius) {
        expect(guard.topY).toBeLessThanOrEqual(MODERN_SPIRAL_WELL!.topY + 1e-12)
      }
    }
  })

  it('lands the last tread ON storey 2, which is what makes a landing possible', () => {
    /*
     * The collider for the head of the flight is the drawn top tread carried out
     * to the storey's own slab, and that is only legitimate because the tread is
     * at the floor's own level: a body standing there has its feet above the
     * slab, so the rim it has been dodging the whole way up is behind it. If the
     * flight ever stopped landing exactly on floorY this would be a shelf in
     * mid-air.
     */
    const steps = treads()
    const last = steps[steps.length - 1]
    expect(last.treadY).toBeCloseTo(FLOORS[1].floorY, 12)
    const band = MODERN_SPIRAL_BAND_AT(last.treadY)!
    expect(band.outerRadius).toBeCloseTo(
      MODERN_SPIRAL_RAIL.faceRadius - PLAYER.radius - PLAYER.characterOffset,
      12,
    )
    // and the landing reaches past the edge of the well, so it meets the stone
    expect(MODERN_SPIRAL.outerRadius).toBeGreaterThan(MODERN_SPIRAL_WELL!.radius)
  })
})
