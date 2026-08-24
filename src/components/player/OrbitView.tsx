import { useCallback, useEffect, useRef, type ComponentRef, type RefObject } from 'react'
import { OrbitControls } from '@react-three/drei'
import { ORBIT } from '../../config/orbit'

type Controls = ComponentRef<typeof OrbitControls>

/**
 * THE CAMERA FOR WHEN NOBODY IS WALKING, and the way back from wherever it ends up.
 *
 * It shipped as one line — `<OrbitControls target={[0, TOWER.topY / 2, 0]}
 * enableDamping />` — with no limit on the polar angle and none on the distance.
 * On a phone that is a hole in the floor: 65 px of upward thumb, about a
 * centimetre and less than twice the smallest target this project will ask a
 * finger to hit, dropped the camera through the pavement into a black frame with
 * only the axis gizmo in it. A pinch took it from 56.3 m out to 349.2 m. There
 * was no control anywhere in the interface that returned the view to anything, so
 * the only way out of either state was to reload and pay the 1.5 MB again.
 *
 * The four numbers are in config/orbit.ts with their derivations and the
 * arithmetic is in lib/orbitFraming.ts, because a clamp is arithmetic: it says
 * where a camera may be, in metres and radians, and that can be tested without
 * rendering anything. What is left here is the wiring, which cannot be.
 *
 * WHY THE RESET ASSIGNS THE FRAMING RATHER THAN CALLING `controls.reset()`.
 * three's own reset returns to the state captured when the controls were
 * CONSTRUCTED, and these controls are unmounted every time the visitor walks and
 * constructed again when they stop — at whatever point in the tower the walker
 * left the camera. Its "home" would be a corner of storey 5. Assigning the
 * framing from the config makes the button mean the same thing on the first
 * press as on the fiftieth.
 *
 * The reset is published through a ref rather than returned, because the control
 * that calls it is a DOM button outside the `<Canvas>` and there is no other way
 * across that boundary. Same pattern as the touch stick, which reads the other
 * way across the same wall.
 */
export function OrbitView({ resetRef }: { resetRef: RefObject<(() => void) | null> }) {
  const controls = useRef<Controls>(null)

  const reset = useCallback(() => {
    const c = controls.current
    if (!c) return
    const [px, py, pz] = ORBIT.opening.position
    const [tx, ty, tz] = ORBIT.opening.target
    c.object.position.set(px, py, pz)
    c.target.set(tx, ty, tz)
    // update() is what re-derives the spherical state from the new offset and
    // re-applies the clamps; without it the next damped frame would interpolate
    // from a spherical state that no longer matches where the camera is.
    c.update()
  }, [])

  useEffect(() => {
    resetRef.current = reset
    return () => {
      resetRef.current = null
    }
  }, [resetRef, reset])

  return (
    <OrbitControls
      ref={controls}
      target={ORBIT.target}
      enableDamping
      minDistance={ORBIT.minDistance}
      maxDistance={ORBIT.maxDistance}
      minPolarAngle={ORBIT.minPolar}
      maxPolarAngle={ORBIT.maxPolar}
    />
  )
}
