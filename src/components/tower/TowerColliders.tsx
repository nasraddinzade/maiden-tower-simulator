import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { ENTRANCE, FLOORS, TOWER, innerRadiusAt } from '../../config/tower'
import { floorColliders, wallColliders, type BoxSpec, type PassageWindow } from '../../lib/collision'
import type { PassageSection, StairDoorway } from '../../lib/staircase'
import type { StairwellCut } from './FloorStructures'

export interface TowerCollidersProps {
  /** The stair passage, so the wall is not built across it. */
  stairPassage?: PassageSection[][]
  /** Openings the stair needs through each floor slab. */
  stairwells?: Array<StairwellCut | undefined>
  /** Arched doorways between the rooms and the stair passage. */
  doorways?: StairDoorway[]
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
    const sections = (stairPassage ?? []).flat()

    /**
     * The passage crossings at one azimuth.
     *
     * The helix wraps about 1.4 turns, so a single azimuth can be crossed twice
     * at different heights; sections within the sector are merged into as many
     * windows as there are separate crossings, never one tall window spanning
     * the gap between them.
     */
    const sectorDeg = 360 / sectors
    const passageAt = (azimuthDeg: number): PassageWindow[] => {
      const hits = sections.filter((s) => {
        const d = Math.abs(((((s.azimuthDeg - azimuthDeg) % 360) + 540) % 360) - 180)
        return d <= sectorDeg / 2 + 3
      })
      if (hits.length === 0) return []

      const sorted = [...hits].sort((a, b) => a.bottomY - b.bottomY)
      const windows: PassageWindow[] = []
      for (const s of sorted) {
        const last = windows[windows.length - 1]
        if (last && s.bottomY <= last.topY + 0.5) {
          last.topY = Math.max(last.topY, s.topY)
          last.outerRadius = Math.max(last.outerRadius, s.outerRadius)
          // the jamb is only as thick as the THINNEST crossing allows
          last.innerRadius = Math.min(last.innerRadius, s.innerRadius)
        } else {
          windows.push({
            bottomY: s.bottomY,
            topY: s.topY,
            innerRadius: s.innerRadius,
            outerRadius: s.outerRadius,
          })
        }
      }
      return windows
    }

    // one band per storey, plus the parapet above the top floor
    const bands = [
      ENTRANCE.groundY - 0.5,
      ...FLOORS.map((f) => f.floorY),
      TOWER.height - TOWER.parapetHeight,
      TOWER.height,
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
      topY: TOWER.height,
      bandBoundaries: bands,
      entrance: {
        azimuthDeg: ENTRANCE.azimuthDeg,
        // arc the opening subtends at the outer face
        widthDeg: (ENTRANCE.width / TOWER.outerRadius) * (180 / Math.PI),
        sillY: ENTRANCE.thresholdY,
        headY: ENTRANCE.thresholdY + ENTRANCE.height,
      },
      openings: (doorways ?? []).map((d) => ({
        azimuthDeg: d.azimuthDeg,
        widthDeg: d.widthDeg,
        sillY: d.bottomY,
        headY: d.topY,
      })),
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

    return [...walls, ...floors]
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
