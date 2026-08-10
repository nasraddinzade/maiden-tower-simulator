import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { ENTRANCE, FLOORS, TOWER, innerRadiusAt } from '../../config/tower'
import { GUARDED_OPENINGS, OPENING_GUARD } from '../../config/modern'
import {
  floorColliders,
  guardRingBoxes,
  stairPassageBandsAt,
  wallColliders,
  type BoxSpec,
} from '../../lib/collision'
import type { PassageSection, StairDoorway } from '../../lib/staircase'
import type { StairwellCut } from './FloorStructures'

export interface TowerCollidersProps {
  /** The stair passage, so the wall is not built across it. */
  stairPassage?: PassageSection[][]
  /** Openings the stair needs through each floor slab. */
  stairwells?: Array<StairwellCut | undefined>
  /** Arched doorways between the rooms and the stair passage. */
  doorways?: StairDoorway[]
  /*
   * There used to be an `embrasures` prop here — the stepped recesses at the high
   * windows, which are cut out of the SHELL as chases and so needed the wall
   * boxes opened for them. There are no chamber openings to recess into since
   * [OWNER] 2026-08-10, the layer is gone, and this component got simpler rather
   * than being taught a new case.
   *
   * A slit at the end of a stair passage needs nothing here either: the void is
   * already the passage, whose own boxes stop at the outer cheek, and the reveal
   * beyond that is masonry the walker must not enter.
   */
  /** Boxes around the circumference. The addendum asks for 24–32 per storey. */
  sectors?: number
  onCount?: (n: number) => void
}

/**
 * Every static collider in the tower, built from cuboids.
 *
 * Replaces the trimesh colliders that used to hang off the CSG shell and the
 * lathe floor slabs. Two reasons, and both matter:
 *
 *  - docs/optimization-addendum.md, Phases 4 and 6: collision geometry must be
 *    primitives, separate from the visual mesh.
 *  - the CSG result is not watertight, and rapier's trimesh contacts off a
 *    non-watertight mesh are unreliable — which is exactly the wall-tunnelling
 *    that made the model look walkable when the stair was still entombed.
 *
 * The shapes themselves come from lib/collision.ts, which is pure and tested.
 */
export function TowerColliders({
  stairPassage,
  stairwells,
  doorways,
  sectors = 32,
  onCount,
}: TowerCollidersProps) {
  const boxes = useMemo(() => {
    /*
     * TAGGED WITH THE FLIGHT THEY BELONG TO, and flattened only after that.
     *
     * See passageAt: two flights' passages at one azimuth must never be merged
     * into one opening, and once the arrays are flattened there is nothing left
     * to tell them apart by.
     */
    const sections = (stairPassage ?? []).flatMap((tube, flight) =>
      tube.map((s) => ({ ...s, flight })),
    )

    const sectorDeg = 360 / sectors
    const passageAt = (azimuthDeg: number) => stairPassageBandsAt(sections, azimuthDeg, sectorDeg)

    // one band per storey, plus the parapet above the top floor
    const bands = [
      ENTRANCE.groundY - 0.5,
      ...FLOORS.map((f) => f.floorY),
      TOWER.topY - TOWER.parapetHeight,
      TOWER.topY,
    ]
      .filter((y, i, a) => a.indexOf(y) === i)
      .sort((a, b) => a - b)

    const walls = wallColliders({
      sectors,
      outerRadius: TOWER.outerRadius,
      innerRadiusAt,
      // down to the plinth, so the wall is solid where it meets the street and a
      // walker outside cannot step into the tower's base
      baseY: ENTRANCE.groundY - 0.5,
      topY: TOWER.topY,
      bandBoundaries: bands,
      entrance: {
        azimuthDeg: ENTRANCE.azimuthDeg,
        // arc the opening subtends at the outer face
        widthDeg: (ENTRANCE.width / TOWER.outerRadius) * (180 / Math.PI),
        sillY: ENTRANCE.thresholdY,
        headY: ENTRANCE.thresholdY + ENTRANCE.height,
      },
      openings: [
        ...(doorways ?? []).map((d) => ({
          azimuthDeg: d.azimuthDeg,
          widthDeg: d.widthDeg,
          sillY: d.bottomY,
          headY: d.topY,
        })),
      ],
      passageAt,
    })

    const floors: BoxSpec[] = []
    FLOORS.forEach((f, i) => {
      const cut = stairwells?.[i]
      floors.push(
        ...floorColliders({
          sectors: Math.min(sectors, 24),
          floorY: f.floorY,
          thickness: TOWER.floorSlab,
          /*
           * The hole in THIS floor is cut by the vault BELOW it, not by this
           * storey's own vault — which is usually closed. Reading f.oculusRadius
           * made storey 2's slab solid in the physics world while the model drew
           * an opening in it, and the walker climbing the steel spiral hit the
           * underside at 3.50 m standing well inside the opening's radius.
           * Storey 1 rests on the rock and has nothing beneath it to pierce it.
           */
          oculusRadius: FLOORS[i - 1]?.oculusRadius ?? 0,
          outerRadius: f.innerRadiusAtLevel,
          stairwell: cut
            ? {
                centreAzimuthDeg: cut.centreAzimuthDeg,
                widthDeg: cut.widthDeg,
                innerRadius: cut.innerRadius,
              }
            : undefined,
        }),
      )
    })

    /*
     * THE ROOF DECK, which is walked on and was not carried.
     *
     * The last lift climbs from storey 8 to `TOP_OF_FLOORS` — the level this same
     * expression already marks as a wall band boundary a few lines up, and the
     * level config/tower.ts hands the 8→roof lift as its toY. FLOORS stops at
     * storey 8, so the loop above emitted nothing here, and the parapet band is a
     * vertical ring of wall boxes, which holds a walker in but does not hold one
     * up. The walker therefore arrived at the head of the last flight with
     * nothing underfoot, on drawn deck (FloorStructures' ceiling fill tops out
     * exactly here), and fell 3.28 m to storey 8. Same class of fault as the
     * stairwell wedge that used to be dropped whole out of a slab.
     *
     * It is NOT a floor slab — it is the top of the masonry mass, which is why it
     * has no FLOORS entry and no stairwell cut in App.tsx — but the walker cannot
     * tell the difference, so it gets a ring like any storey.
     *
     * FLUSH, never proud. floorColliders() hangs its boxes BELOW floorY, so the
     * surface lands exactly on the level the last tread and the head landing sit
     * at, and the walker steps off the landing onto it sideways. A deck a
     * centimetre higher would be a lip, and this controller will not climb a lip
     * of any height — measured, it refused 0.20 m with autostep at 0.60.
     */
    const deckY = TOWER.topY - TOWER.parapetHeight
    floors.push(
      ...floorColliders({
        sectors: Math.min(sectors, 24),
        floorY: deckY,
        thickness: TOWER.floorSlab,
        // the same rule the storeys follow: the hole in a surface is cut by the
        // vault BELOW it. Storey 8's vault is closed, so the deck is unbroken.
        oculusRadius: FLOORS[FLOORS.length - 1].oculusRadius,
        // out to the room face, where the parapet band's inner face begins — the
        // two are the same radius at this height, so they meet without a seam
        outerRadius: innerRadiusAt(deckY),
      }),
    )

    /*
     * THE GLASS GUARDS round the floor openings.
     *
     * floorColliders() cuts each pierced slab back to the opening radius and
     * stops there, which is correct — dropping through an oculus should land you
     * on the floor below, and that is what an oculus is. What was missing is the
     * thing standing at that edge. config/tower.ts's OPENINGS diameters were
     * MEASURED against a frameless glass guard, so the guard is documented in
     * the same sentence as the holes; the model drew the holes and not the
     * guard, leaving two unfenced drops of 1.4 and 2.4 m across in surfaces the
     * walker crosses on the way up.
     *
     * Which openings get one, and why storey 2's does not, is argued out in
     * GUARDED_OPENINGS. The rings are built here rather than in
     * FloorStructures for the reason at the top of that file: structure is
     * drawn, collision is primitives, and the two never come off one mesh.
     */
    const guards: BoxSpec[] = []
    for (const g of GUARDED_OPENINGS) {
      guards.push(
        ...guardRingBoxes({
          // a 1.2 m ring does not need the drum's 32: at 16 the chord is 0.23 m
          // and the corners stand 0.02 m proud of the circle, against a 0.3 m
          // capsule. Still taken off `sectors` so it can never exceed the drum's.
          sectors: Math.min(sectors, 16),
          openingRadius: g.radius,
          floorY: g.floorY,
          height: OPENING_GUARD.height,
        }),
      )
    }

    return [...walls, ...floors, ...guards]
  }, [stairPassage, stairwells, doorways, sectors])

  onCount?.(boxes.length)

  return (
    <RigidBody type="fixed" colliders={false}>
      {boxes.map((b, i) => (
        <CuboidCollider
          key={`${b.kind}-${i}`}
          args={b.halfExtents}
          position={b.position}
          quaternion={b.quaternion}
        />
      ))}
    </RigidBody>
  )
}
