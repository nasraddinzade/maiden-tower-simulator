import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { planAllFlights, stairTreadVertices, type StepPlacement, type Winding } from '../../lib/staircase'
import { stairRampBoxes } from '../../lib/collision'
import { FLOORS, innerRadiusAt } from '../../config/tower'

export interface StaircaseProps {
  winding: Winding
  riserTarget: number
  goingTarget: number
  width: number
  wallClearance: number
  startAzimuthDeg: number
  /** Draw the steps. */
  visible: boolean
  /** Attach a physics collider to every step (Phase-6 walking surface). */
  withColliders: boolean
  /** Procedural limestone from Phase 7. */
  material?: THREE.Material
}

interface PlacedStep extends StepPlacement {
  /** Radial thickness of the tread block. */
  radialWidth: number
  /** Vertical thickness of the tread block. */
  thickness: number
}

/**
 * Lay out every flight, one per storey gap. The flight's inner edge follows the
 * inner wall face, which widens with height, so upper flights sit slightly
 * further out — exactly as the tapering masonry requires.
 */
function useFlights(p: StaircaseProps): PlacedStep[] {
  return useMemo(() => {
    const flights = planAllFlights(
      {
        winding: p.winding,
        riserTarget: p.riserTarget,
        goingTarget: p.goingTarget,
        width: p.width,
        wallClearance: p.wallClearance,
        startAzimuthDeg: p.startAzimuthDeg,
      },
      FLOORS,
      innerRadiusAt,
    )

    const out: PlacedStep[] = []
    flights.forEach((steps, i) => {
      if (steps.length === 0) return
      const riser = (FLOORS[i + 1].floorY - FLOORS[i].floorY) / steps.length
      for (const s of steps) {
        out.push({
          ...s,
          radialWidth: p.width,
          // a tread as deep as its riser reads as solid masonry, not a plank
          thickness: Math.max(0.12, riser),
        })
      }
    })
    return out
  }, [p.startAzimuthDeg, p.width, p.riserTarget, p.goingTarget, p.winding, p.wallClearance])
}

/**
 * The invisible surface the walker actually stands on: inclined cuboids along
 * the walking line, one per couple of steps (docs/optimization-addendum.md).
 *
 * A trimesh strip was tried first and FAILED SILENTLY: the mesh carrying it was
 * `visible={false}`, and @react-three/rapier skips invisible meshes when
 * auto-generating colliders, so the physics world simply never contained the
 * stair. Climbing appeared to work anyway because the walker was riding the
 * floor of the passage cut in the shell's trimesh collider — and the moment
 * that trimesh was replaced with primitive boxes, the stair stopped holding
 * anyone. Explicit CuboidColliders cannot vanish that way.
 *
 * ONE chain for the whole stair, not one per flight: the helix is continuous,
 * and per-flight chains would leave a hole at every landing.
 */
function useRampBoxes(p: StaircaseProps) {
  return useMemo(() => {
    const flights = planAllFlights(
      {
        winding: p.winding,
        riserTarget: p.riserTarget,
        goingTarget: p.goingTarget,
        width: p.width,
        wallClearance: p.wallClearance,
        startAzimuthDeg: p.startAzimuthDeg,
      },
      FLOORS,
      innerRadiusAt,
    )
    return stairRampBoxes(flights.flat(), p.width)
  }, [p.startAzimuthDeg, p.width, p.riserTarget, p.goingTarget, p.winding, p.wallClearance])
}

/**
 * Phase 4 — the stair in the wall thickness.
 *
 * The treads are annular sectors merged into ONE geometry — a single draw call,
 * and every tread meets the next exactly. Collision is the separate ramp chain.
 */
export function Staircase(props: StaircaseProps) {
  const steps = useFlights(props)
  const ramp = useRampBoxes(props)

  const fallback = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#9c9484', roughness: 0.95 }),
    [],
  )
  const stoneMaterial = props.material ?? fallback

  const geometry = useMemo(() => {
    const { positions, indices } = stairTreadVertices(steps, props.width, (s) => {
      const placed = s as PlacedStep
      return placed.thickness ?? 0.2
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    // the shared limestone material samples uv; without it three-bvh-csg and the
    // shader injection both complain
    const uv: number[] = []
    for (let i = 0; i < positions.length / 3; i++) uv.push(0, 0)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeBoundingSphere()
    return g
  }, [steps, props.width])

  useEffect(() => () => geometry.dispose(), [geometry])

  if (!props.visible && !props.withColliders) return null

  return (
    <group>
      {props.visible && (
        <mesh geometry={geometry} material={stoneMaterial} castShadow receiveShadow />
      )}

      {/*
        Collision is the inclined ramp chain, not the tread boxes. Per-tread
        cuboids make a winder stair unclimbable for a capsule controller — it
        has to be lifted over a riser at every step and grinds on the corner
        where two boxes meet. The tread boxes stay purely visual.
      */}
      {props.withColliders && ramp.length > 0 && (
        <RigidBody type="fixed" colliders={false}>
          {ramp.map((b, i) => (
            <CuboidCollider
              key={`ramp-${i}`}
              args={b.halfExtents}
              position={b.position}
              quaternion={b.quaternion}
            />
          ))}
        </RigidBody>
      )}
    </group>
  )
}
