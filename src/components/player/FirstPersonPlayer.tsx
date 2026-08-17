import { useEffect, useMemo, useRef } from 'react'

import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Ray } from '@dimforge/rapier3d-compat'
import { LAMP, PLAYER } from '../../config/player'
import { FLOORS } from '../../config/tower'
import { applyGravity, applyLook, moveVelocity, teleportTarget, type MoveInput } from '../../lib/playerMovement'
import { useKeyboard } from '../../hooks/useKeyboard'

const DEG = Math.PI / 180

export interface FirstPersonPlayerProps {
  /** Extra movement from the on-screen joystick, merged with the keyboard. */
  touchInput?: React.RefObject<MoveInput | null>
  /** Accumulated look delta from touch dragging, consumed each frame. */
  touchLook?: React.RefObject<{ dx: number; dy: number }>
  /** Storey the player starts on. */
  startFloorIndex?: number
  /**
   * Drop the walker here instead, facing `yaw`. Used to start them OUTSIDE, on
   * the paved ground, so the way in is the way the building's way in — up the
   * stair to the raised doorway — rather than materialising in a sealed room.
   */
  startAt?: { x: number; y: number; z: number; yaw: number }
  /**
   * A hand lamp. The interior really is almost dark — 5 m of wall and slit
   * windows let in very little — which is historically right but leaves nothing
   * to see. A carried light is also what the 2007 reference photographs show.
   */
  lamp?: boolean
  /** Candela. Defaults to LAMP, which is solved rather than chosen — see there. */
  lampIntensity?: number
}

/**
 * Phase 6 — first-person controller.
 *
 * A kinematic capsule driven by rapier's character controller, which gives
 * collide-and-slide, autostep over the treads and ground snapping so the walker
 * follows the stair instead of bouncing down it. Gravity is real, so stepping
 * into an opening is a genuine fall rather than a blocked move.
 */
export function FirstPersonPlayer({
  touchInput,
  touchLook,
  startFloorIndex = 0,
  startAt,
  lamp = true,
  lampIntensity = LAMP.intensity,
}: FirstPersonPlayerProps) {
  const { camera, gl } = useThree()
  const { world } = useRapier()
  const body = useRef<RapierRigidBody>(null)
  const keyboard = useKeyboard()

  const yaw = useRef(startAt?.yaw ?? 0)
  const pitch = useRef(0)
  const vertical = useRef(0)
  const locked = useRef(false)
  /**
   * A requested jump to a spot. Consumed at the TOP of the frame, which then
   * returns early: letting the character controller run in the same frame would
   * recompute movement from the old position and undo the jump.
   */
  const pendingPlacement = useRef<{ x: number; y: number; z: number } | null>(null)

  const start = useMemo(() => {
    if (startAt) return startAt
    const f = FLOORS[startFloorIndex]
    return teleportTarget(f.floorY, f.innerRadiusAtLevel, f.oculusRadius, PLAYER.radius)
  }, [startFloorIndex, startAt])

  /**
   * Rapier's character controller — the piece that makes the stair walkable.
   *
   * Created inside the effect, NOT in a useMemo. Under React StrictMode the dev
   * build mounts, unmounts and remounts effects; a memoised controller would be
   * destroyed by the first cleanup and never rebuilt, leaving every later frame
   * calling into a freed object. Owning it here ties its lifetime to the effect.
   */
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null)

  useEffect(() => {
    const c = world.createCharacterController(PLAYER.characterOffset)
    c.enableAutostep(PLAYER.autostepMaxHeight, PLAYER.autostepMinWidth, true)
    c.enableSnapToGround(PLAYER.snapToGroundDistance)
    c.setMaxSlopeClimbAngle(PLAYER.maxSlopeClimbAngleDeg * DEG)
    c.setMinSlopeSlideAngle(PLAYER.minSlopeSlideAngleDeg * DEG)
    c.setApplyImpulsesToDynamicBodies(false)
    // see PLAYER.normalNudgeFactor: rapier's own default leaves the walker
    // welded to any wall they meet while standing on a slope
    c.setNormalNudgeFactor(PLAYER.normalNudgeFactor)
    controller.current = c
    return () => {
      controller.current = null
      world.removeCharacterController(c)
    }
  }, [world])

  // Pointer lock + mouse look
  useEffect(() => {
    const canvas = gl.domElement

    const onClick = () => {
      if (!locked.current) canvas.requestPointerLock()
    }
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas
    }
    const onMove = (e: MouseEvent) => {
      if (!locked.current) return
      const next = applyLook(
        yaw.current,
        pitch.current,
        e.movementX,
        e.movementY,
        PLAYER.lookSensitivity,
        PLAYER.maxPitchRad,
      )
      yaw.current = next.yaw
      pitch.current = next.pitch
    }

    canvas.addEventListener('click', onClick)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMove)
    return () => {
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMove)
    }
  }, [gl])

  useFrame((_, rawDelta) => {
    const rb = body.current
    const ctrl = controller.current
    // the controller only exists between mount and unmount; skip frames outside that
    if (!rb || !ctrl) return
    const dt = Math.min(rawDelta, 1 / 30) // a stalled frame must not teleport the capsule

    /**
     * Jump the capsule somewhere instantly.
     *
     * setTranslation, not setNextKinematicTranslation: the latter only takes
     * effect on the next physics step, and at high frame rates a frame slips in
     * between that reads the OLD position and writes it straight back, undoing
     * the jump. Teleporting has to bypass the interpolation entirely.
     */
    const jumpTo = (x: number, y: number, z: number) => {
      const pos = { x, y: y + PLAYER.height / 2, z }
      rb.setTranslation(pos, true)
      rb.setNextKinematicTranslation(pos)
      vertical.current = 0
    }

    const placement = pendingPlacement.current
    if (placement) {
      pendingPlacement.current = null
      jumpTo(placement.x, placement.y, placement.z)
      return
    }

    // debug teleport, keys 1..8
    const requested = keyboard.takeTeleportRequest()
    if (requested !== null && FLOORS[requested]) {
      const f = FLOORS[requested]
      const t = teleportTarget(f.floorY, f.innerRadiusAtLevel, f.oculusRadius, PLAYER.radius)
      jumpTo(t.x, t.y, t.z)
      return
    }

    // touch look is consumed here so it feels identical to the mouse
    if (touchLook?.current && (touchLook.current.dx || touchLook.current.dy)) {
      const next = applyLook(
        yaw.current,
        pitch.current,
        touchLook.current.dx,
        touchLook.current.dy,
        PLAYER.lookSensitivity * 1.6,
        PLAYER.maxPitchRad,
      )
      yaw.current = next.yaw
      pitch.current = next.pitch
      touchLook.current.dx = 0
      touchLook.current.dy = 0
    }

    const kb = keyboard.move
    const touch = touchInput?.current
    const input: MoveInput = touch
      ? {
          forward: kb.forward || touch.forward,
          back: kb.back || touch.back,
          left: kb.left || touch.left,
          right: kb.right || touch.right,
          run: kb.run || touch.run,
        }
      : kb

    const planar = moveVelocity(input, yaw.current, PLAYER.walkSpeed, PLAYER.runSpeed)

    const grounded = ctrl.computedGrounded()
    vertical.current = applyGravity(vertical.current, dt, PLAYER.gravity, PLAYER.maxFallSpeed, grounded)

    const collider = rb.collider(0)
    ctrl.computeColliderMovement(collider, {
      x: planar.x * dt,
      y: vertical.current * dt,
      z: planar.z * dt,
    })
    const corrected = ctrl.computedMovement()
    const p = rb.translation()
    rb.setNextKinematicTranslation({
      x: p.x + corrected.x,
      y: p.y + corrected.y,
      z: p.z + corrected.z,
    })

    // camera rides at eye height; the capsule's origin is its centre
    camera.position.set(
      p.x + corrected.x,
      p.y + corrected.y - PLAYER.height / 2 + PLAYER.eyeHeight,
      p.z + corrected.z,
    )
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ')

    // Dev-only handle: lets the console (and automated checks) read where the
    // walker is and drop them at a spot to try the stair from. Stripped in prod.
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__player = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        grounded,
        yaw: yaw.current,
        setYaw: (v: number) => {
          yaw.current = v
        },
        /** Look up or down, radians. Inspection needs it; the mouse is locked out. */
        setPitch: (v: number) => {
          pitch.current = Math.max(-PLAYER.maxPitchRad, Math.min(PLAYER.maxPitchRad, v))
        },
        placeAt: (x: number, y: number, z: number) => {
          pendingPlacement.current = { x, y, z }
        },
        /**
         * Ray-cast into the physics world and report what was hit. Walking the
         * stair can fail for reasons that look identical from outside — a sealed
         * passage, a floor slab with no stairwell, a step block in the way — so
         * a check that names the obstruction beats inferring it from stalls.
         */
        /** Every collider whose centre lies within `radius` of the walker. */
        nearbyColliders: (radius = 3) => {
          const o = rb.translation()
          const found: Array<Record<string, unknown>> = []
          world.forEachCollider((c) => {
            const t = c.translation()
            const d = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z)
            if (d > radius) return
            const shape = c.shapeType()
            const half =
              'halfExtents' in c.shape
                ? (c.shape as { halfExtents: { x: number; y: number; z: number } }).halfExtents
                : null
            found.push({
              shape,
              d: +d.toFixed(2),
              at: { x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2) },
              r: +Math.hypot(t.x, t.z).toFixed(2),
              half: half ? { x: +half.x.toFixed(2), y: +half.y.toFixed(2), z: +half.z.toFixed(2) } : undefined,
            })
          })
          return found.sort((a, b) => (a.d as number) - (b.d as number))
        },
        probe: (dx: number, dy: number, dz: number, maxToi = 3) => {
          const o = rb.translation()
          const len = Math.hypot(dx, dy, dz) || 1
          // The last two arguments exclude the walker's own capsule; without
          // them every cast starts inside it and reports a hit at distance 0.
          const hit = world.castRay(
            new Ray({ x: o.x, y: o.y, z: o.z }, { x: dx / len, y: dy / len, z: dz / len }),
            maxToi,
            true,
            undefined,
            undefined,
            rb.collider(0),
            rb,
          )
          if (!hit) return null
          const c = hit.collider
          return {
            distance: hit.timeOfImpact,
            handle: c.handle,
            bodyHandle: c.parent()?.handle ?? -1,
            shape: c.shapeType(),
          }
        },
      }
    }
  })

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[start.x, start.y + PLAYER.height / 2, start.z]}
      enabledRotations={[false, false, false]}
    >
      {/* rapier capsule takes the half-height of the cylindrical part */}
      <CapsuleCollider args={[PLAYER.height / 2 - PLAYER.radius, PLAYER.radius]} />
      {lamp && (
        <pointLight
          position={[0, PLAYER.eyeHeight - PLAYER.height / 2, 0]}
          color="#ffd9a8"
          intensity={lampIntensity}
          distance={LAMP.cutoffDistance}
          decay={LAMP.decay}
        />
      )}
    </RigidBody>
  )
}
