import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  entrancePassageBoxes,
  stairRampBoxes,
  straightStairGuardBoxes,
} from '../../lib/collision'
import { approachNosing, entranceApproach, type ApproachParams } from '../../lib/externalStair'
import { ENTRANCE, TOWER, innerRadiusAt } from '../../config/tower'
import {
  ENTRANCE_APPROACH,
  EXTERNAL_STAIR,
  EXTERNAL_STAIR_RISE,
  GROUND_Y,
  SITE,
} from '../../config/site'

const DEG = Math.PI / 180

/** Horizontal run of the flight: one going per riser. */
const RUN = EXTERNAL_STAIR.risers * EXTERNAL_STAIR.going

/**
 * Everything the walker meets on this stair, from one construction.
 *
 * Written once because the ramp, the guards beside it, the treads and the
 * balustrade have to agree about where the flight is to within nothing at all,
 * and a second copy of these numbers is the obvious way for that to stop being
 * true. It used to be two points on the entrance's own radius. That was the
 * fault: the flight does not run out from the door, it runs ALONG the drum to a
 * landing in front of it, and lib/externalStair.ts argues the construction and
 * config/site.ts the photographs it comes from.
 */
const APPROACH_PARAMS: ApproachParams = {
  entranceAzimuthDeg: ENTRANCE.azimuthDeg,
  outerRadius: TOWER.outerRadius,
  width: EXTERNAL_STAIR.width,
  landingLength: ENTRANCE_APPROACH.landingLength,
  risers: EXTERNAL_STAIR.risers,
  riser: EXTERNAL_STAIR.riser,
  going: EXTERNAL_STAIR.going,
  groundY: GROUND_Y,
  thresholdY: ENTRANCE.thresholdY,
  handedness: ENTRANCE_APPROACH.handedness,
}

const APPROACH = entranceApproach(APPROACH_PARAMS)

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
 * The stair is not blank. Its rise is a direct count off the owner's own footage
 * — twelve risers at 0.165 m — and the total that gives, 1.98 m, lands 0.02 m
 * from the sill height the reserve publishes. Those two numbers come from
 * completely different places and agree, which is rare enough in this model to be
 * worth saying out loud. Its PLAN is a different kind of knowledge: nothing has
 * measured a length of it, but the exterior photographs settle beyond argument
 * that the flight is laid against the drum and turns a quarter circle onto the
 * door, which is what it now does.
 */
export function SiteAndEntranceStair({ visible, withColliders }: SiteAndEntranceStairProps) {
  /**
   * The walking surface the walker actually climbs, and the landing after it.
   *
   * Three nodes, one straight line in plan: the landing is the flight's own line
   * carried past the door on the level, so the chain gives a raking box and then
   * a flat one and the joint between them needs no special case.
   */
  const ramp = useMemo(() => {
    if (!withColliders) return []
    return stairRampBoxes(APPROACH.walkingLine, EXTERNAL_STAIR.width, 1, 0.3)
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
   * ONE PAIR OF SLABS FOR FLIGHT AND LANDING ALIKE, foot to the far end of the
   * landing, because in plan that is one straight line. The landing is the place
   * this matters most — it is the only spot on the approach where the drop is
   * the whole rise on the open side and a doorway on the other. The inner slab
   * there ends up buried in the drum, which costs nothing: it is a fixed
   * collider inside stone the wall already fills, and the alternative is a
   * special case at the exact joint where a walker turns.
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
      foot: APPROACH.walkingLine[0],
      head: APPROACH.walkingLine[2],
      width: EXTERNAL_STAIR.width,
      height: EXTERNAL_STAIR.guardHeight + EXTERNAL_STAIR.riser,
    })
  }, [withColliders])

  /**
   * The visible treads: plain boxes, since the flight is straight — turned to
   * the way it is CLIMBED, which is no longer the entrance's radius.
   *
   * The box is built width × riser × going in its own axes, so the yaw has to
   * send its local +Z along the travel and its local +X across it. That used to
   * be π − az, the yaw that points +Z straight out from the door, and it was
   * right for a flight that ran straight out from the door. This one runs round
   * the drum, so the yaw is the heading of the walking line and comes from the
   * same construction the ramp and the guards do.
   */
  const treads = useMemo(
    () =>
      APPROACH.treads.map((p) => ({
        position: [p[0], p[1] - EXTERNAL_STAIR.riser / 2, p[2]] as [number, number, number],
        size: [EXTERNAL_STAIR.width, EXTERNAL_STAIR.riser, EXTERNAL_STAIR.going] as [
          number,
          number,
          number,
        ],
      })),
    [],
  )

  /** The landing at the head, one flat plate on the treads' own thickness. */
  const landing = useMemo(
    () => ({
      position: [
        APPROACH.landing[0],
        APPROACH.landing[1] - EXTERNAL_STAIR.riser / 2,
        APPROACH.landing[2],
      ] as [number, number, number],
      size: [EXTERNAL_STAIR.width, EXTERNAL_STAIR.riser, ENTRANCE_APPROACH.landingLength] as [
        number,
        number,
        number,
      ],
    }),
    [],
  )

  /**
   * The balustrades as drawn: a raking handrail either side on plumb standards,
   * levelling off across the landing on the open side.
   *
   * Hung off the NOSING line rather than off the ramp collider's walking line,
   * because a guard height is measured from the surface a visitor's foot is on
   * and that is the drawn tread. The two lines are a riser apart; see the note
   * on `guards` above, which is where that difference has to be paid back.
   *
   * WHAT HAPPENS AT THE TOP IS NOW KNOWN. This rail used to stop a going short
   * of the wall, on the ground that a return nobody had seen would be fabric
   * invented to tidy up a corner. The exterior photographs show the corner: the
   * rail rakes up the flight, kinks once where the flight meets the landing, and
   * runs on horizontally across the front of the doorway to die into the stone
   * past the far jamb. So it is drawn, and only on the OUTER side — the landing's
   * other side is the wall, and a rail there would be a rail against masonry.
   *
   * Standards and a top rail, and nothing between them. The footage resolves no
   * infill at all, so none is drawn — the same restraint OPENING_GUARD takes
   * indoors, where the panes are frameless in the frames and so get no posts and
   * no cap rail here either.
   *
   * The standards run to several dozen a side, so they go in one InstancedMesh —
   * one draw call however many, which is the addendum's argument for the treads
   * of the stair inside.
   */
  const balustrade = useMemo(() => {
    const { going, guardHeight, railRadius, width, postsPerTread } = EXTERNAL_STAIR
    const perTread = Math.max(1, Math.round(postsPerTread))
    const spacing = going / perTread
    // set in from the tread's edge by the rail's own radius, so the balustrade
    // stands ON the flight rather than half off it
    const halfWidth = width / 2 - railRadius
    // across the flight is the entrance's own radius: the walking line is
    // tangent to the drum at the door, so its normal there IS that radius
    const { outward } = APPROACH
    /** The topmost nosing, where the rake ends and the landing begins. */
    const dKink = RUN - going
    const dEnd = RUN + ENTRANCE_APPROACH.landingLength

    /** A point on one side's nosing line, `d` in from the foot, lifted by `lift`. */
    const online = (d: number, side: number, lift: number) => {
      const n = approachNosing(APPROACH_PARAMS, d)
      return {
        point: new THREE.Vector3(
          n.position[0] + side * outward.x * halfWidth,
          n.position[1] + lift,
          n.position[2] + side * outward.z * halfWidth,
        ),
        treadY: n.treadY,
      }
    }

    const posts: Array<{ position: [number, number, number]; height: number }> = []
    const rails: Array<{
      position: [number, number, number]
      quaternion: THREE.Quaternion
      length: number
    }> = []

    const stand = (d: number, side: number) => {
      const { point, treadY } = online(d, side, guardHeight)
      // a standard is plumb, so it runs from the tread it stands on up to the
      // raking rail: at a nosing that is exactly the guard height, and anywhere
      // further into a tread it is longer by the rake
      posts.push({
        position: [point.x, (treadY + point.y) / 2, point.z],
        height: point.y - treadY,
      })
    }

    const rail = (dA: number, dB: number, side: number) => {
      const a = online(dA, side, guardHeight).point
      const b = online(dB, side, guardHeight).point
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

    for (const side of [-1, 1]) {
      for (let d = 0; d < RUN - 1e-9; d += spacing) stand(d, side)
      rail(0, dKink, side)
    }
    // and the landing: one side only, at the same density the fan has
    for (let d = RUN; d < dEnd - 1e-9; d += spacing) stand(d, 1)
    rail(dKink, dEnd, 1)

    return { posts, rails }
  }, [])

  const postsRef = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = postsRef.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    // a strap is flat, so unlike a tube it has to be turned to face along the
    // flight — broadside to the climb it would read as a solid screen
    const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, APPROACH.descentYaw, 0))
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
              rotation={[0, APPROACH.descentYaw, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={t.size} />
            </mesh>
          ))}

          <mesh
            material={steel}
            position={landing.position}
            rotation={[0, APPROACH.descentYaw, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={landing.size} />
          </mesh>

          {/* the balustrades: standards instanced, one rail per straight length */}
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

/**
 * Where a walker should be dropped to start outside, facing the way in.
 *
 * OUT ALONG THE FLIGHT'S OWN LINE, not out along the entrance's radius. It used
 * to be the latter, which was right while the flight ran that way: you spawned
 * facing the door with the steps between you and it. With the flight laid along
 * the drum, spawning on the door's radius drops the walker in front of a 2 m
 * wall with the only way up five metres round the corner and out of shot. So the
 * spawn goes beyond the FOOT, on the line of the climb, looking up it — which is
 * where the owner's own footage starts, at second 2.
 */
const FOOT = APPROACH.walkingLine[0]
const FOOT_AZ = FOOT.azimuthDeg * DEG
const DESCENT = { x: Math.sin(APPROACH.descentYaw), z: Math.cos(APPROACH.descentYaw) }

export const OUTDOOR_START = {
  x: Math.sin(FOOT_AZ) * FOOT.midRadius + DESCENT.x * SITE.spawnDistance,
  y: GROUND_Y + 0.05,
  z: -Math.cos(FOOT_AZ) * FOOT.midRadius + DESCENT.z * SITE.spawnDistance,
  /**
   * Yaw that faces up the flight: moveVelocity's forward is (−sin yaw, −cos yaw),
   * so the yaw whose local +Z is the DESCENT sends the walker's forward the other
   * way, up the climb.
   */
  yaw: APPROACH.descentYaw,
  rise: EXTERNAL_STAIR_RISE,
}
