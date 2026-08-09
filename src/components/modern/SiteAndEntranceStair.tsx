import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  entrancePassageBoxes,
  stairRampBoxes,
  straightStairGuardBoxes,
} from '../../lib/collision'
import { ENTRANCE, TOWER, innerRadiusAt } from '../../config/tower'
import { EXTERNAL_STAIR, EXTERNAL_STAIR_RISE, GROUND_Y, SITE } from '../../config/site'

const DEG = Math.PI / 180

/** Horizontal run of the flight: one going per riser. */
const RUN = EXTERNAL_STAIR.risers * EXTERNAL_STAIR.going

/** Where the flight's foot stands, measured from the tower axis. */
const FOOT_RADIUS = TOWER.outerRadius + RUN

/**
 * The flight's walking line, foot first: the two points everything the walker
 * meets on this stair is hung off.
 *
 * Written once because the ramp and the guards beside it have to agree about
 * where the flight is to within nothing at all — the guards' inner faces sit on
 * the ramp's own edges, and a second copy of these numbers is the obvious way
 * for that to stop being true.
 */
const WALKING_LINE = [
  { azimuthDeg: ENTRANCE.azimuthDeg, treadY: GROUND_Y, midRadius: FOOT_RADIUS },
  { azimuthDeg: ENTRANCE.azimuthDeg, treadY: ENTRANCE.thresholdY, midRadius: TOWER.outerRadius },
]

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

  /** The walking surface the walker actually climbs. */
  const ramp = useMemo(() => {
    if (!withColliders) return []
    return stairRampBoxes(WALKING_LINE, EXTERNAL_STAIR.width, 1, 0.3)
  }, [withColliders])

  /**
   * The balustrades in physics: a slab down each side of the flight.
   *
   * They are needed, and the sum is the stair's own. The ramp is one box
   * EXTERNAL_STAIR.width across — 1.4 m — so a walker keeps a contact until
   * their capsule centre is half that plus a capsule radius off the centreline,
   * 1.0 m, and past it they leave the flight sideways and fall its whole rise
   * onto the paving. Nothing else stood there: the site's ground cylinder is
   * what they landed on, and it is 1.98 m down at the head. Drawing a balustrade
   * and not building this is the worse half of that — a rail you can see and
   * walk through is the same fault as a floor you can see and fall through, and
   * this model keeps finding the second one.
   *
   * The height is the drawn guard plus a riser. The rail is a guard height above
   * the NOSING line, while the walking line the ramp chain gives passes through
   * the BACK edge of every tread's surface and so runs exactly one riser below
   * the nosings. A slab measured off the walking line therefore has to be a
   * riser taller to reach the top of what a visitor can see.
   */
  const guards = useMemo(() => {
    if (!withColliders) return []
    return straightStairGuardBoxes({
      foot: WALKING_LINE[0],
      head: WALKING_LINE[1],
      width: EXTERNAL_STAIR.width,
      height: EXTERNAL_STAIR.guardHeight + EXTERNAL_STAIR.riser,
    })
  }, [withColliders])

  /**
   * The visible treads: plain boxes, since the flight is straight — but TURNED
   * to the azimuth, which they were not.
   *
   * The box is built width × riser × going in its own axes, and it was dropped
   * into the world unrotated. The flight runs out along the entrance's azimuth,
   * so the two horizontal axes were swapped: every tread came out 1.4 m deep
   * along the climb and 0.30 m across it, a 0.30 m ribbon of steps standing
   * between balustrades set 1.36 m apart. Consecutive treads are 0.30 m apart
   * along the run and were 1.4 m long, so they overlapped four deep and read as
   * one narrow column rather than as steps at all.
   *
   * A yaw of π − az sends the box's local +Z along the outward radius and its
   * local +X across the flight, which is the frame the sizes were written for.
   */
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

  /** The yaw that puts a tread's width across the flight. See treads above. */
  const treadYaw = Math.PI - az

  /**
   * The balustrades as drawn: a raking handrail either side on plumb standards.
   *
   * Hung off the NOSING line rather than off the ramp collider's walking line,
   * because a guard height is measured from the surface a visitor's foot is on
   * and that is the drawn tread. The two lines are a riser apart; see the note
   * on `guards` above, which is where that difference has to be paid back.
   *
   * Standards and a top rail, and nothing between them. The footage records
   * tubular balustrades either side and resolves no infill at all, so none is
   * drawn — the same restraint OPENING_GUARD takes indoors, where the panes are
   * frameless in the frames and so get no posts and no cap rail here either.
   *
   * A standard per tread per side is two dozen tubes at the current count, so
   * they go in one InstancedMesh — one draw call however many, which is the
   * addendum's argument for the treads of the stair inside.
   */
  const balustrade = useMemo(() => {
    const { going, riser, risers, guardHeight, railRadius, width, postsPerTread } = EXTERNAL_STAIR
    const perTread = Math.max(1, Math.round(postsPerTread))
    const rake = riser / going
    // set in from the tread's edge by the tube's own radius, so the balustrade
    // stands ON the flight rather than half off it
    const halfWidth = width / 2 - railRadius
    // across the flight: perpendicular to the radius the stair runs out along
    const lateralX = Math.cos(az)
    const lateralZ = Math.sin(az)

    /** A point on one side's nosing line, `d` in from the foot, lifted by `lift`. */
    const online = (d: number, side: number, lift: number): THREE.Vector3 => {
      const r = FOOT_RADIUS - d
      return new THREE.Vector3(
        Math.sin(az) * r + side * lateralX * halfWidth,
        GROUND_Y + riser + d * rake + lift,
        -Math.cos(az) * r + side * lateralZ * halfWidth,
      )
    }

    const posts: Array<{ position: [number, number, number]; height: number }> = []
    const rails: Array<{
      position: [number, number, number]
      quaternion: THREE.Quaternion
      length: number
    }> = []

    for (const side of [-1, 1]) {
      for (let i = 0; i < risers; i++) {
        for (let k = 0; k < perTread; k++) {
          const d = going * (i + k / perTread)
          const head = online(d, side, guardHeight)
          // a standard is plumb, so it runs from the tread it stands on up to
          // the raking rail: at a nosing that is exactly the guard height, and
          // anywhere further into a tread it is longer by the rake
          const footY = GROUND_Y + riser * (i + 1)
          posts.push({
            position: [head.x, (footY + head.y) / 2, head.z],
            height: head.y - footY,
          })
        }
      }
      // one rail per side, first nosing to last. It stops a going short of the
      // wall rather than being levelled off onto the landing: what happens at
      // the top of this rail is not in any frame, and a return nobody has seen
      // would be fabric invented to tidy up a corner.
      const a = online(0, side, guardHeight)
      const b = online(going * (risers - 1), side, guardHeight)
      const dir = b.clone().sub(a)
      rails.push({
        position: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2],
        quaternion: new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        ),
        length: dir.length(),
      })
    }
    return { posts, rails }
  }, [az])

  const postsRef = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = postsRef.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    // a strap is flat, so unlike a tube it has to be turned to face along the
    // flight — broadside to the climb it would read as a solid screen
    const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI - az, 0))
    balustrade.posts.forEach((p, i) => {
      // the geometry is a unit-length tube, so the standard's height is a scale
      pos.set(p.position[0], p.position[1], p.position[2])
      scale.set(1, p.height, 1)
      m.compose(pos, spin, scale)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [balustrade, visible])

  /*
   * The entrance passage, from the outer face through to the room: the sill you
   * walk in on and the masonry either side of it. COLLIDER ONLY now.
   *
   * The sill used to be drawn here too, and it was a second opaque surface at
   * the height of one the shell already has. The entrance is cut through the
   * wall by an arched tunnel whose own sill sits at ENTRANCE.thresholdY, so the
   * stone the arch came out of is left with an up-facing face at that Y right
   * through the passage — continuous with the chamber floor inside, which is the
   * same cut. The drawn box sat exactly on it and the two z-fought in the
   * doorway, which is the first thing you look at walking up the stair. Dropping
   * it also gives the note that used to hang on that mesh what it asked for: the
   * sill is now literally the tower's own stone rather than a box wearing its
   * colour.
   *
   * The COLLIDER is not redundant and stays. Without it the doorway is an
   * opening with nothing under it: the walker reaches the threshold and drops
   * through the wall. wallColliders leaves the entrance open as a gap in the
   * wall bands, which is right — but a gap needs a sill to walk on, and a sill
   * on its own is a plank over a 2 m drop. The cheeks are why;
   * entrancePassageBoxes argues it where the shapes are made.
   */
  const passage = useMemo(
    () =>
      entrancePassageBoxes({
        azimuthDeg: ENTRANCE.azimuthDeg,
        width: ENTRANCE.width,
        height: ENTRANCE.height,
        thresholdY: ENTRANCE.thresholdY,
        innerRadius: innerRadiusAt(ENTRANCE.thresholdY),
        outerRadius: TOWER.outerRadius,
      }),
    [],
  )

  const paving = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8d8577', roughness: 0.95 }),
    [],
  )
  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4a4a4e', roughness: 0.6, metalness: 0.4 }),
    [],
  )
  useEffect(
    () => () => {
      paving.dispose()
      steel.dispose()
    },
    [paving, steel],
  )

  return (
    <group>
      {visible && (
        <>
          <mesh material={paving} position={[0, GROUND_Y - SITE.thickness / 2, 0]} receiveShadow>
            <cylinderGeometry args={[SITE.radius, SITE.radius, SITE.thickness, 64]} />
          </mesh>

          {treads.map((t, i) => (
            <mesh
              key={`etread-${i}`}
              material={steel}
              position={t.position}
              rotation={[0, treadYaw, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={t.size} />
            </mesh>
          ))}

          {/* the balustrades: standards instanced, one rail per side */}
          <instancedMesh
            ref={postsRef}
            args={[undefined, undefined, balustrade.posts.length]}
            material={steel}
            castShadow
          >
            {/*
              A FLAT STRAP on edge, not a tube. The photographs show the guard as
              a dense fan of closely-spaced steel straps and the model had round
              tubes at a twelfth of the count — the reading calls it the stair's
              most characteristic feature and says the wrong object was drawn.
              Unit height, so a standard's length is still just a Y scale.
            */}
            <boxGeometry
              args={[EXTERNAL_STAIR.strapThickness, 1, EXTERNAL_STAIR.strapWidth]}
            />
          </instancedMesh>

          {balustrade.rails.map((r, i) => (
            <mesh
              key={`erail-${i}`}
              material={steel}
              position={r.position}
              quaternion={r.quaternion}
              castShadow
            >
              <cylinderGeometry
                args={[EXTERNAL_STAIR.railRadius, EXTERNAL_STAIR.railRadius, r.length, 8]}
              />
            </mesh>
          ))}

          {/* Nothing is drawn for the passage itself: sill and cheeks alike are
              already in the shell, as the stone the entrance arch was cut out
              of. See the note on `passage` above. */}
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
          {guards.map((b, i) => (
            <CuboidCollider
              key={`eguard-${i}`}
              args={b.halfExtents}
              position={b.position}
              quaternion={b.quaternion}
            />
          ))}
          {[passage.sill, ...passage.jambs].map((b, i) => (
            <CuboidCollider
              key={`epassage-${i}`}
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

/** Where a walker should be dropped to start outside, facing the door. */
export const OUTDOOR_START = {
  x: Math.sin(ENTRANCE.azimuthDeg * DEG) * (TOWER.outerRadius + SITE.spawnDistance),
  y: GROUND_Y + 0.05,
  z: -Math.cos(ENTRANCE.azimuthDeg * DEG) * (TOWER.outerRadius + SITE.spawnDistance),
  /** Yaw that faces the tower: moveVelocity's forward is (−sin yaw, −cos yaw). */
  yaw: -ENTRANCE.azimuthDeg * DEG + Math.PI,
  rise: EXTERNAL_STAIR_RISE,
}
