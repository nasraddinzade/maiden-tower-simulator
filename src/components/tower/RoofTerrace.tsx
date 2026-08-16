import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BALUSTRADE, FLOORS, ROOF } from '../../config/tower'
import {
  pavingProfile,
  roofBalustrade,
  yawForBearing,
  type PavingSpec,
} from '../../lib/roofTerrace'
import { WALL_EMBED, cutStairwell, type StairwellCut } from './FloorStructures'

/**
 * THE TERRACE — the paving that crosses the wall, and the glass standing on it.
 *
 * What the shell does and what this does are two halves of one change. The shell
 * subtracts a terrace void of ROOF.deckOuterRadius standing on ROOF.masonryTopY,
 * which takes the inboard four fifths of the wall top away and leaves the
 * parapet as a thin ring on the rim; this lays the paving course on the bed that
 * cut exposes, and opens it where the stair comes through. Neither half is any
 * use alone: without the cut the paving is buried in solid wall, without the
 * paving the terrace is a hole where the top of the tower used to be.
 *
 * WHERE THE DECISIONS ARE. Not here. lib/roofTerrace.ts says which way a pane
 * faces and where the drainage channel is cut; this file only revolves one and
 * lays out matrices for the other. See ROOF and BALUSTRADE in config/tower.ts
 * for where every number came from. Nothing in this file may carry a dimension
 * of its own (rule 2).
 */

const RADIAL_SEGMENTS = 96

/** The terrace's own surface, shared by the course that is drawn and the fence
 * that stands on it — one description, so the two cannot part company. */
const PAVING: PavingSpec = {
  deckY: ROOF.deckY,
  masonryTopY: ROOF.masonryTopY,
  deckOuterRadius: ROOF.deckOuterRadius,
  wallEmbed: WALL_EMBED,
  channelWidth: ROOF.channelWidth,
  channelDepth: ROOF.channelDepth,
}

/**
 * The paving: one course of stone from the axis out past the parapet's foot,
 * with the drainage channel sunk in it at the edge.
 *
 * A DISC, not an annulus, and that is a fact about the building rather than a
 * shortcut. Storey 8's vault is closed — FLOORS' last entry has oculusRadius 0 —
 * so there is no shaft coming up through the terrace and nothing to leave a hole
 * for. The one hole it does get is the stair's, and that comes from the same
 * StairwellCut every storey slab takes.
 *
 * The meridian, channel included, comes from lib/roofTerrace.pavingProfile();
 * all this does is revolve it and take the stair's bite out of the result.
 */
function usePavingGeometry(cut: StairwellCut | undefined, segments = RADIAL_SEGMENTS) {
  return useMemo(() => {
    const outer = ROOF.deckOuterRadius + WALL_EMBED
    const top = ROOF.deckY
    const bottom = ROOF.masonryTopY
    const pts = pavingProfile(PAVING).map((p) => new THREE.Vector2(p.r, p.y))
    const geom = new THREE.LatheGeometry(pts, segments)
    if (!cut) return geom
    /*
     * THE ONE CUT IN THE TOWER THAT ACTUALLY REMOVES STONE. Every storey's
     * opening is tangent to the slab it is handed and takes nothing — see
     * cutStairwell — because a flight runs in the WALL and a slab stops at the
     * wall's face. The terrace is the exception the whole rebuild turned on: its
     * paving crosses the full thickness, so the stair comes up THROUGH it, and
     * this is where the hole is.
     */
    return cutStairwell(geom, cut, (top + bottom) / 2, (top - bottom) * 3, outer, segments)
  }, [cut, segments])
}

/**
 * The balustrade, as three merged geometries and three draw calls.
 *
 * Fifty-odd posts, fifty-odd panes and four clamps apiece is two hundred meshes
 * if each is its own; docs/optimization-addendum.md is explicit that this is the
 * kind of thing that must be merged, and there is nothing to animate here.
 *
 * WHAT IS DELIBERATELY NOT DRAWN: the raking stay. Every frame that shows a post
 * shows a thin stainless rod raking across the parapet beside it — roof/010,
 * roof/021, roof/028, roof/032, roof/001 — and in none of them can both of its
 * ends be seen at once. It anchors high on the parapet's inner face in one
 * reading and at the post's mid-height in another, and its foot is somewhere on
 * the paving in both. A strut drawn between the wrong two points is a fabrication
 * with a bolt on each end, so it is left out until a frame settles it.
 */
function useBalustradeGeometry() {
  return useMemo(() => {
    const laid = roofBalustrade(BALUSTRADE, PAVING)
    const steel: THREE.BufferGeometry[] = []
    const glass: THREE.BufferGeometry[] = []

    for (const p of [...laid.posts, ...laid.flanges]) {
      const tube = new THREE.CylinderGeometry(p.diameter / 2, p.diameter / 2, p.height, 12)
      // baseY is the FOOT, and it is not always the deck: see roofBalustrade
      tube.translate(p.x, ROOF.deckY + p.baseY + p.height / 2, p.z)
      steel.push(tube)
    }
    for (const c of laid.clamps) {
      const disc = new THREE.CylinderGeometry(c.diameter / 2, c.diameter / 2, c.reach, 10)
      // a cylinder's axis is its local +Y; laid on its side it becomes local +X,
      // and the yaw below puts that on the clamp's own bearing — outward along
      // the radius, from the post's face to the glass
      disc.rotateZ(Math.PI / 2)
      disc.rotateY(yawForBearing(c.azimuthDeg))
      disc.translate(c.x, ROOF.deckY + c.y, c.z)
      steel.push(disc)
    }
    for (const pane of laid.panes) {
      // thickness on X, height on Y, width on Z — so the yaw that puts X on the
      // pane's bearing puts its width along the tangent, in the fence's plane
      const sheet = new THREE.BoxGeometry(pane.thickness, pane.height, pane.width)
      sheet.rotateY(yawForBearing(pane.azimuthDeg))
      sheet.translate(pane.x, ROOF.deckY + pane.y, pane.z)
      glass.push(sheet)
    }

    return {
      steel: mergeGeometries(steel, false),
      glass: mergeGeometries(glass, false),
    }
  }, [])
}

export interface RoofTerraceProps {
  /**
   * Where the stair breaks through the paving, keyed like FloorStructures' own
   * array: index FLOORS.length is the roof, because the roof is the surface the
   * last flight lands on.
   */
  stairwells?: Array<StairwellCut | undefined>
  /** Exterior limestone, shared with the shell so the terrace reads as its top. */
  material?: THREE.Material
  /** Draw the balustrade. Off for the wireframe and cutaway views. */
  showBalustrade?: boolean
}

export function RoofTerrace({ stairwells, material, showBalustrade = true }: RoofTerraceProps) {
  const paving = usePavingGeometry(stairwells?.[FLOORS.length])
  const { steel, glass } = useBalustradeGeometry()

  return (
    <group>
      <mesh geometry={paving} material={material} receiveShadow castShadow>
        {!material && <meshStandardMaterial color="#b4ab97" roughness={0.95} />}
      </mesh>
      {showBalustrade && (
        <>
          <mesh geometry={steel} castShadow>
            <meshStandardMaterial color="#c9ced3" metalness={0.85} roughness={0.28} />
          </mesh>
          {/*
            Same material family as the opening guards and the wellhead cover:
            all of it is the post-2013 visitor fit-out and it should read as one
            hand rather than as three different kinds of glass.
          */}
          <mesh geometry={glass}>
            <meshPhysicalMaterial
              color="#cfe3ea"
              transparent
              opacity={0.22}
              roughness={0.06}
              metalness={0}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      )}
    </group>
  )
}
