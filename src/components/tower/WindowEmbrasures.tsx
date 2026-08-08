import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { azimuthToVector } from '../../lib/geometry'
import { embrasureTreads, type EmbrasurePlan } from '../../lib/embrasure'
import { stairRampBoxes } from '../../lib/collision'
import { WINDOW_EMBRASURE, innerRadiusAt } from '../../config/tower'
import { PLAYER } from '../../config/player'

/** Head clearance kept above the platform inside a recess. */
const PLAYER_HEAD = PLAYER.eyeHeight + 0.2

export interface PlacedEmbrasure {
  id: string
  azimuthDeg: number
  floorY: number
  plan: EmbrasurePlan
}

/**
 * The steps up to a window whose sill is out of reach.
 *
 * DRAWN AS STONE, COLLIDED AS RAMPS — the same split the flights use, and for
 * the same reason: per-tread cuboids make a stair unclimbable for a capsule
 * controller, which has to be lifted over a riser at every step and grinds on
 * the corner where two boxes meet. Here the ramp is a single inclined slab from
 * the chamber floor to the platform, plus a level box for the platform itself.
 *
 * The recess these sit in is cut by the shell, as a WallChase — see App.tsx.
 * Nothing here cuts anything, so a change to the steps can never open a hole in
 * the wall.
 */
export function WindowEmbrasures({
  embrasures,
  material,
  visible = true,
  withColliders = false,
}: {
  embrasures: PlacedEmbrasure[]
  material?: THREE.Material
  visible?: boolean
  withColliders?: boolean
}) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const { going, width, platformDepth } = WINDOW_EMBRASURE

    for (const e of embrasures) {
      const face = innerRadiusAt(e.plan.platformY)
      const d = azimuthToVector(e.azimuthDeg)
      for (const t of embrasureTreads(e.plan, face, going, platformDepth)) {
        const depth = t.outerRadius - t.innerRadius
        /*
         * Each block runs from its own surface down to the chamber floor, not
         * one riser. A tread a riser thick is a plank on nothing — the same
         * fault that made the wall stair read as floating slabs — and here the
         * stone below is simply solid, so a block down to the floor is both
         * cheaper and truer.
         */
        const height = Math.max(0.05, t.treadY - e.floorY)
        const g = new THREE.BoxGeometry(width, height, depth)
        g.translate(0, height / 2, 0)
        g.rotateY(-e.azimuthDeg * (Math.PI / 180))
        const mid = (t.innerRadius + t.outerRadius) / 2
        g.translate(d.x * mid, e.floorY, d.z * mid)
        parts.push(g)
      }
    }
    if (parts.length === 0) return null
    const merged = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    return merged
  }, [embrasures])

  useEffect(() => () => geometry?.dispose(), [geometry])

  /*
   * The walking surface comes from stairRampBoxes, the same builder the flights
   * use, and NOT from hand-rolled Euler angles.
   *
   * It was hand-rolled first: a box yawed to the azimuth and pitched about X.
   * Euler order made that a different rotation from the one intended, the slab
   * ended up tilted across the recess instead of along it, and the walker
   * stepping in fell 3.4 m through the floor and finished inside the wall.
   * stairRampBoxes takes two points on the walking line and works out the
   * orientation itself, which is exactly the problem here — a radial run is just
   * a two-point run at one azimuth.
   */
  const ramps = useMemo(() => {
    const { going, width, platformDepth } = WINDOW_EMBRASURE
    return embrasures.flatMap((e) => {
      const face = innerRadiusAt(e.plan.platformY)
      const run = e.plan.stepCount * going
      return [
        ...stairRampBoxes(
          [
            { azimuthDeg: e.azimuthDeg, treadY: e.floorY, midRadius: face - 0.35 },
            { azimuthDeg: e.azimuthDeg, treadY: e.plan.platformY, midRadius: face + run },
          ],
          width,
          1,
          0.12,
        ),
        ...stairRampBoxes(
          [
            { azimuthDeg: e.azimuthDeg, treadY: e.plan.platformY, midRadius: face + run },
            {
              azimuthDeg: e.azimuthDeg,
              treadY: e.plan.platformY,
              midRadius: face + run + platformDepth,
            },
          ],
          width,
          1,
          0.12,
        ),
      ]
    })
  }, [embrasures])

  /*
   * THE RECESS NEEDS ITS OWN WALLS, because opening the wall band opens the
   * whole wall.
   *
   * TowerColliders only ever builds a 0.8 m band of boxes at the room-side face
   * — beyond that the masonry carries no collider at all, on the argument that
   * only the inner face is ever touched. Cutting the band at an embrasure
   * therefore does not open a recess, it opens the drum: walked, the visitor
   * stepped towards the window at storey 5 and came out of the tower at ground
   * level, 11.4 m from the axis.
   *
   * So the recess is given back its own back wall and two cheeks. Measured
   * against the same fault at the entrance passage, which was fixed the same way
   * and for the same reason.
   */
  const shell = useMemo(() => {
    const { width, platformDepth, going } = WINDOW_EMBRASURE
    const out: Array<{
      position: [number, number, number]
      args: [number, number, number]
      rotationY: number
    }> = []
    for (const e of embrasures) {
      const face = innerRadiusAt(e.plan.platformY)
      const depth = e.plan.stepCount * going + platformDepth
      const top = e.plan.platformY + PLAYER_HEAD
      const midY = (e.floorY + top) / 2
      const halfH = (top - e.floorY) / 2
      const rotationY = -e.azimuthDeg * (Math.PI / 180)
      const d = azimuthToVector(e.azimuthDeg)
      const at = (r: number): [number, number, number] => [d.x * r, midY, d.z * r]
      // the back of the recess
      out.push({ position: at(face + depth + 0.15), args: [width / 2 + 0.4, halfH, 0.15], rotationY })
      // and its two cheeks
      for (const side of [-1, 1]) {
        const off = side * (width / 2 + 0.15)
        const mid = face + depth / 2
        const px = d.x * mid + Math.cos(e.azimuthDeg * (Math.PI / 180)) * off
        const pz = d.z * mid + Math.sin(e.azimuthDeg * (Math.PI / 180)) * off
        out.push({ position: [px, midY, pz], args: [0.15, halfH, depth / 2], rotationY })
      }
    }
    return out
  }, [embrasures])

  if (!visible && !withColliders) return null

  return (
    <group>
      {visible && geometry && (
        <mesh geometry={geometry} material={material} castShadow receiveShadow>
          {!material && <meshStandardMaterial color="#a89f8c" roughness={0.95} />}
        </mesh>
      )}
      {withColliders && ramps.length > 0 && (
        <RigidBody type="fixed" colliders={false}>
          {ramps.map((r, i) => (
            <CuboidCollider
              key={`emb-${i}`}
              args={r.halfExtents}
              position={r.position}
              quaternion={r.quaternion}
            />
          ))}
          {shell.map((b, i) => (
            <CuboidCollider
              key={`emb-wall-${i}`}
              args={b.args}
              position={b.position}
              rotation={[0, b.rotationY, 0]}
            />
          ))}
        </RigidBody>
      )}
    </group>
  )
}
