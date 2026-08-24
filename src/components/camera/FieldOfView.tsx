import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { CAMERA } from '../../config/camera'
import { verticalFovFor } from '../../lib/fieldOfView'

/**
 * Keeps the camera's vertical angle equal to whatever the rule asks for at the
 * canvas's current shape. It draws nothing and holds no state.
 *
 * WHY A COMPONENT AND NOT THE `camera` PROP. r3f applies `<Canvas camera={…}>`
 * exactly once — `configure()` builds the camera on the first pass and the guard
 * `state.camera === lastCamera` keeps every later render out — so a fov in that
 * prop is an opening value and nothing more. On resize r3f runs `updateCamera()`,
 * which sets `aspect` and rebuilds the projection matrix and DOES NOT touch
 * `fov`. A camera configured once with a single number therefore keeps that
 * number through every rotation and every window drag, which is exactly how a
 * vertical 50 survived into a 24.3° horizontal on a phone.
 *
 * IT MEASURES THE CANVAS, NOT THE WINDOW, and on this project that distinction
 * has already cost a day: `window.innerWidth`/`innerHeight` and the layout
 * viewport disagree by a third under Chrome's device emulation (589×508 against
 * a reported 375×812 — see the commit for c0e6d8e). `useThree(s => s.size)` is
 * the canvas's own measured box in CSS pixels, which is the rectangle the
 * frustum is actually projected into, so the rule is applied to the frame that
 * exists rather than to the one the browser claims.
 *
 * A LAYOUT EFFECT rather than useFrame: the fov changes when the viewport does,
 * which is a handful of times in a session, and setting it per frame would
 * rebuild the projection matrix sixty times a second to reach the same number.
 * Running before paint also means the first drawn frame already has it.
 */
export function FieldOfView() {
  const camera = useThree((state) => state.camera)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)

  useLayoutEffect(() => {
    const perspective = camera as PerspectiveCamera
    if (!perspective.isPerspectiveCamera) return
    const fov = verticalFovFor(width / height, CAMERA.fov)
    if (perspective.fov === fov) return
    perspective.fov = fov
    perspective.updateProjectionMatrix()
  }, [camera, width, height])

  return null
}
