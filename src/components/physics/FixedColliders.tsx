import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import type { BoxSpec, CylinderSpec } from '../../lib/collision'

/**
 * One fixed rigid body carrying a set of primitive colliders.
 *
 * Every static collider in the model went through the same six lines — a fixed
 * RigidBody with `colliders={false}` and a map over BoxSpec — copied into four
 * components. Copied code is not why it moved here. It moved because those four
 * components are on the FIRST-PAINT path (they draw the stair, the ground and
 * the tower's own stone) and this one is not: a component that names
 * `@react-three/rapier` in an import drags 2.4 MB of physics into the chunk the
 * visitor waits on, whether or not he ever walks. See lazyPhysics.tsx.
 *
 * `colliders={false}` says: take the shapes I hand you, do not derive any from
 * the meshes. There are no meshes under here at all — collision geometry and
 * visual geometry are separate by rule (docs/optimization-addendum.md, phases 4
 * and 6), and this is the collision half.
 */
export interface ColliderSpecs {
  /** Distinguishes this group's React keys from every other group's. */
  keyPrefix: string
  boxes?: readonly BoxSpec[]
  cylinders?: readonly CylinderSpec[]
}

export function FixedColliders({ keyPrefix, boxes, cylinders }: ColliderSpecs) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {boxes?.map((b, i) => (
        <CuboidCollider
          key={`${keyPrefix}-${b.kind}-${i}`}
          args={b.halfExtents}
          position={b.position}
          quaternion={b.quaternion}
        />
      ))}
      {cylinders?.map((c, i) => (
        <CylinderCollider
          key={`${keyPrefix}-cyl-${i}`}
          args={[c.halfHeight, c.radius]}
          position={c.position}
        />
      ))}
    </RigidBody>
  )
}
