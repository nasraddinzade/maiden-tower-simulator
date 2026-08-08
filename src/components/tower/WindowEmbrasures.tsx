import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { azimuthToVector } from '../../lib/geometry'
import { embrasureTreads, type EmbrasurePlan } from '../../lib/embrasure'
import { WINDOW_EMBRASURE, innerRadiusAt } from '../../config/tower'

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

  const ramps = useMemo(() => {
    const { going, width, platformDepth } = WINDOW_EMBRASURE
    return embrasures.map((e) => {
      const face = innerRadiusAt(e.plan.platformY)
      const run = e.plan.stepCount * going
      const rise = e.plan.platformY - e.floorY
      const slopeLength = Math.hypot(run, rise)
      const d = azimuthToVector(e.azimuthDeg)
      const midR = face + run / 2
      const pitch = Math.atan2(rise, run)
      return {
        slope: {
          position: [d.x * midR, e.floorY + rise / 2, d.z * midR] as [number, number, number],
          half: [width / 2, 0.05, slopeLength / 2] as [number, number, number],
          rotation: [-pitch, -e.azimuthDeg * (Math.PI / 180), 0] as [number, number, number],
        },
        platform: {
          position: [
            d.x * (face + run + platformDepth / 2),
            e.plan.platformY,
            d.z * (face + run + platformDepth / 2),
          ] as [number, number, number],
          half: [width / 2, 0.05, platformDepth / 2] as [number, number, number],
          rotation: [0, -e.azimuthDeg * (Math.PI / 180), 0] as [number, number, number],
        },
      }
    })
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
            <group key={`emb-${i}`}>
              <CuboidCollider args={r.slope.half} position={r.slope.position} rotation={r.slope.rotation} />
              <CuboidCollider
                args={r.platform.half}
                position={r.platform.position}
                rotation={r.platform.rotation}
              />
            </group>
          ))}
        </RigidBody>
      )}
    </group>
  )
}
