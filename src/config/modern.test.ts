import { describe, expect, it } from 'vitest'
import {
  GUARDED_OPENINGS,
  MODERN_SPIRAL,
  MODERN_SPIRAL_WALK_BAND,
  MODERN_SPIRAL_WELL_RADIUS,
  OPENING_GUARD,
} from './modern'
import { FLOORS, LIFTS } from './tower'
import { PLAYER } from './player'
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
