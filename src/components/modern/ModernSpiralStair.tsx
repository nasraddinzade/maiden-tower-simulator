import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { planFlight, stairTreadVertices } from '../../lib/staircase'
import { stairRampBoxes } from '../../lib/collision'
import {
  MODERN_SPIRAL,
  MODERN_SPIRAL_LIFT,
  MODERN_SPIRAL_TREADS,
} from '../../config/modern'

/** m — chequer plate is thin; this is a plate, not a stone block. */
const TREAD_PLATE = 0.012

/**
 * m — width of the walkable band the collider covers, about the walking line.
 * Narrower than the treads on purpose; see the note in useRampBoxes below.
 */
const COLLIDER_BAND = 0.55

/**
 * m — how far the walking-surface boxes hang below the treads.
 *
 * The masonry flights use 0.3 m, which is nothing there: a wall flight rises
 * about 0.9 m in the arc a walker occupies. This spiral climbs 2.25 m in a full
 * turn, so the flight passes right over your head, and a 0.3 m box under each
 * tread cuts the clear height to 1.95 m for a 1.75 m walker. Measured, the
 * capsule was clipping the underside of the run above with 0.29 m of itself and
 * the controller stopped moving. A plate-thin collider under a plate-thin tread.
 */
const COLLIDER_THICKNESS = 0.08

export interface ModernSpiralStairProps {
  visible: boolean
  withColliders: boolean
}

/**
 * The inserted steel spiral from the entry chamber up to storey 2.
 *
 * Laid out with the SAME planFlight() the masonry flights use — a helix is a
 * helix — with the inner edge pinned to the central tube instead of to the wall
 * face. Reusing it means this stair inherits every fix the stone one has had:
 * the tread winding, the tread block reaching down to the walking surface, and
 * the ramp-chain collider that the character controller can actually climb.
 *
 * Everything about its size comes from config/modern.ts, where each figure
 * carries how it was measured off the 2026 footage and how far it might be out.
 * The tread COUNT is not measured — no frame shows the whole flight — so it is
 * derived from the storey height and the measured riser, and moves by itself if
 * the storey height is ever corrected.
 */
export function ModernSpiralStair({ visible, withColliders }: ModernSpiralStairProps) {
  const steps = useMemo(() => {
    if (!MODERN_SPIRAL_LIFT) return []
    const width = MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius
    return planFlight({
      fromY: MODERN_SPIRAL_LIFT.fromY,
      toY: MODERN_SPIRAL_LIFT.toY,
      startAzimuthDeg: 0,
      // free-standing: the inner edge is the column, at every height
      innerRadiusAt: () => MODERN_SPIRAL.columnRadius,
      width,
      riserTarget: MODERN_SPIRAL.riser,
      goingTarget: MODERN_SPIRAL.going,
      winding: MODERN_SPIRAL.winding,
    })
  }, [])

  const treadGeometry = useMemo(() => {
    if (steps.length === 0) return null
    const width = MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius
    const { positions, indices } = stairTreadVertices(steps, width, () => TREAD_PLATE)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    const uv: number[] = []
    for (let i = 0; i < positions.length / 3; i++) uv.push(0, 0)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeBoundingSphere()
    return g
  }, [steps])

  useEffect(() => () => treadGeometry?.dispose(), [treadGeometry])

  const ramp = useMemo(() => {
    if (steps.length < 2) return []
    const width = MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius
    const first = steps[0]
    /*
     * A ramp up to the bottom tread, exactly as the masonry flights get.
     *
     * Free-standing or not, the first tread is a riser above the chamber floor
     * and this character controller will not climb a vertical face of any
     * height — measured, it refused a 0.20 m one with autostep set to 0.60 m. So
     * without this the stair is decoration: you can walk round it and never get
     * on it. The ramp runs radially OUTWARD from the flight into the room, since
     * for a free-standing stair the room is outside it, not inside.
     */
    const approach = [
      {
        azimuthDeg: first.azimuthDeg,
        treadY: MODERN_SPIRAL_LIFT ? MODERN_SPIRAL_LIFT.fromY : 0,
        midRadius: MODERN_SPIRAL.outerRadius + 0.5,
      },
      { azimuthDeg: first.azimuthDeg, treadY: first.treadY, midRadius: first.midRadius },
    ]
    /*
     * ONE box per step, and the collider NARROWER than the treads.
     *
     * A chain of yawed boxes cannot represent a tight helix without leaving
     * lips. Each box's top is the plane through two nosings; the next box's
     * plane is yawed from it, so away from the walking line the two diverge, and
     * the step between them grows with distance from that line. On the masonry
     * flights the yaw is 4° a step at 4.3 m radius and the lip is ~15 mm — below
     * notice. This newel spiral turns 27.7° a step at 0.58 m, and across the full
     * 1.04 m tread the lip works out at ~0.11 m. This controller will not climb a
     * lip of any height: measured, the walker took three treads and stopped dead.
     *
     * So the walking surface is a band about the walking line rather than the
     * whole tread. The lip shrinks in proportion — ~0.06 m at this width — and
     * the treads are still drawn full width, which is what anyone actually sees.
     * Halving the span from two steps to one halves the chord error as well.
     */
    return [
      ...stairRampBoxes(steps, COLLIDER_BAND, 1, COLLIDER_THICKNESS),
      ...stairRampBoxes(approach, width, 1, COLLIDER_THICKNESS),
    ]
  }, [steps])

  /** One post per tread on the outer arc, plus the rail linking their heads. */
  const balustrade = useMemo(() => {
    const posts: Array<[number, number, number]> = []
    const rails: Array<{ position: [number, number, number]; quaternion: THREE.Quaternion; length: number }> = []
    const head = (s: (typeof steps)[number]): THREE.Vector3 => {
      const a = s.azimuthDeg * (Math.PI / 180)
      const r = MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.rodRadius * 2
      return new THREE.Vector3(
        Math.sin(a) * r,
        s.treadY + MODERN_SPIRAL.guardHeight,
        -Math.cos(a) * r,
      )
    }
    for (const s of steps) {
      const h = head(s)
      posts.push([h.x, s.treadY + MODERN_SPIRAL.guardHeight / 2, h.z])
    }
    for (let i = 0; i < steps.length - 1; i++) {
      const a = head(steps[i])
      const b = head(steps[i + 1])
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const dir = b.clone().sub(a)
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      )
      rails.push({ position: [mid.x, mid.y, mid.z], quaternion: q, length: dir.length() })
    }
    return { posts, rails }
  }, [steps])

  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.55, metalness: 0.75 }),
    [],
  )
  const bright = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.3, metalness: 0.9 }),
    [],
  )
  useEffect(
    () => () => {
      steel.dispose()
      bright.dispose()
    },
    [steel, bright],
  )

  if (steps.length === 0 || !MODERN_SPIRAL_LIFT) return null
  if (!visible && !withColliders) return null

  const rise = MODERN_SPIRAL_LIFT.toY - MODERN_SPIRAL_LIFT.fromY

  return (
    <group>
      {visible && (
        <>
          {treadGeometry && <mesh geometry={treadGeometry} material={steel} castShadow receiveShadow />}

          {/* the central tube, running the full rise plus a little into each floor */}
          <mesh
            material={bright}
            position={[0, MODERN_SPIRAL_LIFT.fromY + rise / 2, 0]}
            castShadow
          >
            <cylinderGeometry args={[MODERN_SPIRAL.columnRadius, MODERN_SPIRAL.columnRadius, rise + 0.3, 16]} />
          </mesh>

          {balustrade.posts.map((p, i) => (
            <mesh key={`post-${i}`} material={bright} position={p}>
              <cylinderGeometry
                args={[MODERN_SPIRAL.rodRadius, MODERN_SPIRAL.rodRadius, MODERN_SPIRAL.guardHeight, 8]}
              />
            </mesh>
          ))}

          {balustrade.rails.map((r, i) => (
            <mesh key={`rail-${i}`} material={bright} position={r.position} quaternion={r.quaternion}>
              <cylinderGeometry args={[MODERN_SPIRAL.rodRadius, MODERN_SPIRAL.rodRadius, r.length, 8]} />
            </mesh>
          ))}
        </>
      )}

      {/*
        Same ramp chain as the masonry flights, and for the same reason: this
        character controller will not climb a vertical face, so a box per tread
        makes the stair unclimbable however correct it looks.
      */}
      {withColliders && ramp.length > 0 && (
        <RigidBody type="fixed" colliders={false}>
          {ramp.map((b, i) => (
            <CuboidCollider
              key={`mramp-${i}`}
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

/** Treads the flight ends up with, for the budget readout and for tests. */
export const MODERN_SPIRAL_STEP_COUNT = MODERN_SPIRAL_TREADS
