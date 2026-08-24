import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Mesh, Object3D } from 'three'
import {
  CASTER_SEED,
  foldCaster,
  shadowNeedsRedraw,
  type ShadowDrawState,
  type Vec3,
} from '../../lib/shadowRefresh'

export interface ShadowRefreshProps {
  /** Unit vector towards the sun — the direction the shadow map is taken along. */
  direction: Vec3
  /** rad — the smallest turn of the sun worth a redraw. See lib/shadowRefresh.ts. */
  minAngleRad: number
}

/**
 * Takes the shadow map off the frame loop and redraws it only when it is wrong.
 *
 * three's `WebGLShadowMap.autoUpdate` defaults to true, so the sun's map was
 * redrawn on every frame for a building that does not move. Measured in the
 * browser at 375×812 on 2026-08-24, by differencing one `gl.render` with the
 * flag on against one with it off: 33 draw calls and 55 983 triangles a frame,
 * 38% of the calls and 49% of the triangles in the opening view, and the whole
 * of that view's overspend against the 60-call mobile budget.
 *
 * The rule for "wrong" is lib/shadowRefresh.ts and has two halves — the sun has
 * turned far enough to move a shadow edge across a texel, or the set of visible
 * shadow casters is not the set the map was drawn from. Nothing else can make it
 * wrong: this scene's shadow camera is orthographic, fixed on the origin and
 * sized from the tower's radius, so it does not follow the viewer and no amount
 * of walking or orbiting can stale the map. The measurement agrees — the pass
 * is the same 33 calls and 55 983 triangles at all three orbit viewpoints
 * measured, which differ from each other in what the MAIN pass draws.
 *
 * WHY THE CASTERS ARE COUNTED RATHER THAN THE SWITCHES LISTED. Half a dozen
 * things change what casts a shadow here: walking in brings the colliders and
 * takes the survey grid away, a storey is culled, the cutaway opens, the shell
 * is switched off, the walls go x-ray, a hypothesis layer appears. A list of
 * those would be wrong the first time somebody added a mesh, and wrong silently
 * — the failure is a shadow that stops matching the building, which nobody
 * notices for a week. So the fold below runs over the scene's own visible
 * casters, which is the very set three is about to draw. It is the same
 * traversal three does, without the draws.
 *
 * ITS COST IS THE ONE THING THIS COMPONENT ADDS TO EVERY FRAME, and it is
 * measured, not assumed. In the opening view: 103 objects in the scene, 69 of
 * them reachable at all by `traverseVisible` — it does not descend into a hidden
 * subtree, which is why the culled storeys cost nothing to skip — and 34 of
 * those are casters. The whole fold takes 8.4 µs, averaged over 2 000 runs. That
 * is one two-thousandth of a 16 ms frame, bought against 33 draw calls and
 * 55 983 triangles taken out of it.
 *
 * ON CONTEXT LOSS the depth target is gone and three does not know that the map
 * it holds is empty; with automatic updates off nothing would ever redraw it and
 * the building would light with no shadows at all. The listener drops the
 * remembered state so the next frame draws one. This is not hypothetical — the
 * dev server loses the context on most HMR reloads.
 */
export function ShadowRefresh({ direction, minAngleRad }: ShadowRefreshProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  /** What the map on the GPU was last drawn for; null means "assume nothing". */
  const drawn = useRef<ShadowDrawState | null>(null)

  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    // Whatever is on the GPU now was drawn under the old regime, if at all.
    gl.shadowMap.needsUpdate = true
    drawn.current = null

    const canvas = gl.domElement
    const forget = () => {
      drawn.current = null
    }
    canvas.addEventListener('webglcontextrestored', forget)

    return () => {
      canvas.removeEventListener('webglcontextrestored', forget)
      // Hand the renderer back the way it was found. Anything mounted after
      // this component is entitled to three's own default.
      gl.shadowMap.autoUpdate = true
      gl.shadowMap.needsUpdate = true
      drawn.current = null
    }
  }, [gl])

  useFrame(() => {
    let casters = CASTER_SEED
    scene.traverseVisible((o: Object3D) => {
      if (!o.castShadow) return
      const geometry = (o as Mesh).geometry
      casters = foldCaster(casters, o.id, geometry ? geometry.id : 0)
    })

    const next: ShadowDrawState = { direction, casters }
    if (!shadowNeedsRedraw(drawn.current, next, minAngleRad)) return

    /*
     * `needsUpdate` is consumed by ONE render and reset by three itself, and
     * useFrame runs before that render — so this marks the frame that is about
     * to be drawn, not the next one. Remembering the state here rather than
     * after the render is safe for the same reason: if no render follows (a
     * hidden tab, a demand frameloop), the flag simply stays raised until one
     * does.
     */
    gl.shadowMap.needsUpdate = true
    drawn.current = next
  })

  return null
}
