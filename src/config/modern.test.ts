import { describe, expect, it } from 'vitest'
import { GUARDED_OPENINGS, MODERN_SPIRAL, OPENING_GUARD } from './modern'
import { FLOORS, LIFTS } from './tower'
import { PLAYER } from './player'

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
