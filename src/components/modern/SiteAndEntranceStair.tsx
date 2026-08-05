import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { stairRampBoxes } from '../../lib/collision'
import { ENTRANCE, TOWER, innerRadiusAt } from '../../config/tower'
import { EXTERNAL_STAIR, EXTERNAL_STAIR_RISE, GROUND_Y, SITE } from '../../config/site'
import { LIMESTONE_LIGHT } from '../../lib/masonry'

const DEG = Math.PI / 180

/** Horizontal run of the flight: one going per riser. */
const RUN = EXTERNAL_STAIR.risers * EXTERNAL_STAIR.going

/** Where the flight's foot stands, measured from the tower axis. */
const FOOT_RADIUS = TOWER.outerRadius + RUN

export interface SiteAndEntranceStairProps {
  visible: boolean
  withColliders: boolean
}

/**
 * The ground outside, the stair up to the doorway, and the floor of the entrance
 * passage — everything between the street and the inside of the wall.
 *
 * The ground is deliberately a plain disc. Somewhere to stand and walk in from is
 * needed, but İçərişəhər around the tower has not been surveyed for this model,
 * and a fabricated square would be worse than an obviously blank one: a blank one
 * cannot be mistaken for evidence. Its dimensions are marked [ASSUMPTION] in
 * config/site.ts and nothing else depends on them.
 *
 * The stair is not blank. It is a direct count off the owner's own footage —
 * twelve risers at 0.165 m, straight, no winders — and the total rise it gives,
 * 1.98 m, lands 0.02 m from the sill height the reserve publishes. Those two
 * numbers come from completely different places and agree, which is rare enough
 * in this model to be worth saying out loud.
 */
export function SiteAndEntranceStair({ visible, withColliders }: SiteAndEntranceStairProps) {
  const az = ENTRANCE.azimuthDeg * DEG

  /** The flight as two points on its walking line, for the ramp collider. */
  const ramp = useMemo(() => {
    if (!withColliders) return []
    return stairRampBoxes(
      [
        { azimuthDeg: ENTRANCE.azimuthDeg, treadY: GROUND_Y, midRadius: FOOT_RADIUS },
        { azimuthDeg: ENTRANCE.azimuthDeg, treadY: ENTRANCE.thresholdY, midRadius: TOWER.outerRadius },
      ],
      EXTERNAL_STAIR.width,
      1,
      0.3,
    )
  }, [withColliders])

  /** The visible treads: plain boxes, since the flight is straight. */
  const treads = useMemo(() => {
    const out: Array<{ position: [number, number, number]; size: [number, number, number] }> = []
    for (let i = 0; i < EXTERNAL_STAIR.risers; i++) {
      // tread i is the surface you arrive on after climbing i+1 risers
      const y = GROUND_Y + EXTERNAL_STAIR.riser * (i + 1)
      const r = FOOT_RADIUS - EXTERNAL_STAIR.going * (i + 0.5)
      out.push({
        position: [Math.sin(az) * r, y - EXTERNAL_STAIR.riser / 2, -Math.cos(az) * r],
        size: [EXTERNAL_STAIR.width, EXTERNAL_STAIR.riser, EXTERNAL_STAIR.going],
      })
    }
    return out
  }, [az])

  /*
   * The floor of the entrance passage, from the outer face through to the room.
   *
   * Without it the doorway is an opening with nothing under it: the walker
   * reaches the threshold and drops through the wall. wallColliders leaves the
   * entrance open as a gap in the wall bands, which is right — but a gap needs a
   * sill to walk on.
   */
  const passage = useMemo(() => {
    const inner = innerRadiusAt(ENTRANCE.thresholdY)
    const depth = TOWER.outerRadius - inner
    return {
      position: [
        Math.sin(az) * (inner + depth / 2),
        ENTRANCE.thresholdY - 0.15,
        -Math.cos(az) * (inner + depth / 2),
      ] as [number, number, number],
      halfExtents: [depth / 2, 0.15, ENTRANCE.width / 2] as [number, number, number],
      // local +X radial, so yaw the box to face the entrance
      quaternion: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.PI / 2 - az,
      ),
    }
  }, [az])

  const paving = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8d8577', roughness: 0.95 }),
    [],
  )
  /*
   * The passage sill is the tower's own stone, not the museum's paving.
   * Sharing the paving material made it read as a pale panel let into the wall,
   * which is the first thing you look at walking up the stair.
   */
  const sillStone = useMemo(
    () => new THREE.MeshStandardMaterial({ color: LIMESTONE_LIGHT, roughness: 0.95 }),
    [],
  )
  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4a4a4e', roughness: 0.6, metalness: 0.4 }),
    [],
  )
  useEffect(
    () => () => {
      paving.dispose()
      sillStone.dispose()
      steel.dispose()
    },
    [paving, sillStone, steel],
  )

  return (
    <group>
      {visible && (
        <>
          <mesh material={paving} position={[0, GROUND_Y - SITE.thickness / 2, 0]} receiveShadow>
            <cylinderGeometry args={[SITE.radius, SITE.radius, SITE.thickness, 64]} />
          </mesh>

          {treads.map((t, i) => (
            <mesh key={`etread-${i}`} material={steel} position={t.position} castShadow receiveShadow>
              <boxGeometry args={t.size} />
            </mesh>
          ))}

          {/* the passage sill, so the threshold reads as a floor and not a hole */}
          <mesh
            material={sillStone}
            position={passage.position}
            quaternion={passage.quaternion}
            receiveShadow
          >
            <boxGeometry
              args={[passage.halfExtents[0] * 2, passage.halfExtents[1] * 2, passage.halfExtents[2] * 2]}
            />
          </mesh>
        </>
      )}

      {withColliders && (
        <RigidBody type="fixed" colliders={false}>
          {/* the ground. One cylinder is cheaper than a ring of boxes and the
              tower's own floors sit above it, so it interferes with nothing. */}
          <CylinderCollider
            args={[SITE.thickness / 2, SITE.radius]}
            position={[0, GROUND_Y - SITE.thickness / 2, 0]}
          />
          {ramp.map((b, i) => (
            <CuboidCollider
              key={`eramp-${i}`}
              args={b.halfExtents}
              position={b.position}
              quaternion={b.quaternion}
            />
          ))}
          <CuboidCollider
            args={passage.halfExtents}
            position={passage.position}
            quaternion={passage.quaternion}
          />
        </RigidBody>
      )}
    </group>
  )
}

/** Where a walker should be dropped to start outside, facing the door. */
export const OUTDOOR_START = {
  x: Math.sin(ENTRANCE.azimuthDeg * DEG) * (TOWER.outerRadius + SITE.spawnDistance),
  y: GROUND_Y + 0.05,
  z: -Math.cos(ENTRANCE.azimuthDeg * DEG) * (TOWER.outerRadius + SITE.spawnDistance),
  /** Yaw that faces the tower: moveVelocity's forward is (−sin yaw, −cos yaw). */
  yaw: -ENTRANCE.azimuthDeg * DEG + Math.PI,
  rise: EXTERNAL_STAIR_RISE,
}
