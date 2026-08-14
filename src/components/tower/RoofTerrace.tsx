import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BALUSTRADE, FLOORS, ROOF } from '../../config/tower'
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
 * See ROOF and BALUSTRADE in config/tower.ts for where every number came from.
 * Nothing in this file may carry a dimension of its own (rule 2).
 */

const RADIAL_SEGMENTS = 96
const DEG = Math.PI / 180

/**
 * The paving: one course of stone from the axis out past the parapet's foot.
 *
 * A DISC, not an annulus, and that is a fact about the building rather than a
 * shortcut. Storey 8's vault is closed — FLOORS' last entry has oculusRadius 0 —
 * so there is no shaft coming up through the terrace and nothing to leave a hole
 * for. The one hole it does get is the stair's, and that comes from the same
 * StairwellCut every storey slab takes.
 *
 * It reaches WALL_EMBED PAST the parapet's inner face, for the reason the floor
 * slabs are bedded into the wall: an edge that merely touches the face leaves a
 * ring of the mismatch between this lathe and the shell's 96-gon open, and here
 * that ring would look down eleven metres of wall.
 */
function usePavingGeometry(cut: StairwellCut | undefined, segments = RADIAL_SEGMENTS) {
  return useMemo(() => {
    const outer = ROOF.deckOuterRadius + WALL_EMBED
    const top = ROOF.deckY
    const bottom = ROOF.masonryTopY
    /*
     * BOTTOM FIRST, then out, then up. LatheGeometry winds its triangles from
     * the order the profile is given in, so a profile traversed the other way
     * round comes out with every normal reversed — and a paving slab whose top
     * face points at the floor below it is invisible from the terrace under any
     * single-sided material. Drawn that way the deck read as a hole: you looked
     * down into storey 8 through stone that was there.
     */
    const pts = [
      new THREE.Vector2(0, bottom),
      new THREE.Vector2(outer, bottom),
      new THREE.Vector2(outer, top),
      new THREE.Vector2(0, top),
      new THREE.Vector2(0, bottom),
    ]
    const geom = new THREE.LatheGeometry(pts, segments)
    if (!cut) return geom
    return cutStairwell(geom, cut, (top + bottom) / 2, (top - bottom) * 3)
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
    const n = BALUSTRADE.postCount
    const stepDeg = 360 / n
    const posts: THREE.BufferGeometry[] = []
    const clamps: THREE.BufferGeometry[] = []
    const panes: THREE.BufferGeometry[] = []

    const postR = BALUSTRADE.postRadius
    const glassR = BALUSTRADE.glassRadius
    const paneH = BALUSTRADE.glassTop - BALUSTRADE.glassBottom
    /*
     * The pane spans the chord between its two posts and stops a clamp's radius
     * short at each end, because the clamps stand in the joint — the panes are
     * edge to edge with a gap you can see daylight through in roof/011, not
     * butted. Nothing measures that gap; it is taken as the clamp disc, which is
     * the only thing at the joint whose size was read.
     */
    const chord = 2 * glassR * Math.sin((stepDeg / 2) * DEG)
    const paneW = Math.max(0.2, chord - BALUSTRADE.clampDiameter)

    for (let i = 0; i < n; i++) {
      const az = i * stepDeg
      const rad = az * DEG
      const dirX = Math.sin(rad)
      const dirZ = -Math.cos(rad)

      // the post, base flange to cap
      const tube = new THREE.CylinderGeometry(
        BALUSTRADE.postDiameter / 2,
        BALUSTRADE.postDiameter / 2,
        BALUSTRADE.postHeight,
        10,
      )
      tube.translate(
        dirX * postR,
        ROOF.deckY + BALUSTRADE.postHeight / 2,
        dirZ * postR,
      )
      posts.push(tube)

      // the flange bolted to the paving. Its diameter is the post's, doubled:
      // read off the [PHOTO] bay, where the flange is about twice the tube.
      const flange = new THREE.CylinderGeometry(
        BALUSTRADE.postDiameter,
        BALUSTRADE.postDiameter,
        0.02,
        12,
      )
      flange.translate(dirX * postR, ROOF.deckY + 0.01, dirZ * postR)
      posts.push(flange)

      /*
       * Two clamps at the cap and two low down, one for each of the panes that
       * meet at this post — which is why they are offset tangentially rather
       * than sitting on the post's own line. roof/021 and roof/032 show the pair
       * splayed on a forked arm; the fork itself is below the resolution this
       * model draws at.
       */
      const tangentX = Math.cos(rad)
      const tangentZ = Math.sin(rad)
      for (const y of [BALUSTRADE.postHeight, BALUSTRADE.glassBottom]) {
        for (const side of [-1, 1]) {
          const disc = new THREE.CylinderGeometry(
            BALUSTRADE.clampDiameter / 2,
            BALUSTRADE.clampDiameter / 2,
            BALUSTRADE.clampReach,
            10,
          )
          // lying along the radius, from the post out to the glass
          disc.rotateZ(Math.PI / 2)
          disc.rotateY(-az * DEG)
          const off = BALUSTRADE.clampDiameter * 0.75 * side
          const r = postR + BALUSTRADE.clampReach / 2
          disc.translate(
            dirX * r + tangentX * off,
            ROOF.deckY + y,
            dirZ * r + tangentZ * off,
          )
          clamps.push(disc)
        }
      }

      // the pane, centred on the bay between this post and the next
      const midAz = az + stepDeg / 2
      const midRad = midAz * DEG
      const pane = new THREE.BoxGeometry(BALUSTRADE.glassThickness, paneH, paneW)
      pane.rotateY(-midRad)
      pane.translate(
        Math.sin(midRad) * glassR,
        ROOF.deckY + BALUSTRADE.glassBottom + paneH / 2,
        -Math.cos(midRad) * glassR,
      )
      panes.push(pane)
    }

    return {
      steel: mergeGeometries([...posts, ...clamps], false),
      glass: mergeGeometries(panes, false),
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
