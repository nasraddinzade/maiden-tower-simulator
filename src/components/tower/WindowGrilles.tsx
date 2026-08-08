import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { grilleBars } from '../../lib/grille'
import { azimuthToVector } from '../../lib/geometry'
import { TOWER, WINDOW_GRILLE } from '../../config/tower'
import type { WindowCut } from '../../lib/towerShell'

/**
 * The grilles over the slits — modern fabric, and in scope: the target state is
 * the tower as it stands, and CLAUDE.md lists window grilles among the
 * insertions that includes.
 *
 * Drawn, not cut. A grille is a thing set INTO an opening the masonry already
 * has, so it has no business in the CSG that carves the wall; putting it there
 * would also hand the evaluator a dozen thin bars per window to reconcile
 * against a splayed reveal, which is exactly the kind of near-coincident work
 * that cost this model its stair floor once already.
 *
 * NO COLLIDER. You cannot walk into a slit — the reveal is a hole 0.4 m wide in
 * the outer face and the walker never reaches it — so a collider here would be
 * geometry nobody can touch, which this project does not build.
 *
 * All in ONE merged geometry: nine openings times five or six bars is fifty-odd
 * meshes otherwise, for something that is a few dozen triangles in total.
 */
export function WindowGrilles({
  windows,
  material,
  visible = true,
}: {
  windows: WindowCut[]
  material?: THREE.Material
  visible?: boolean
}) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const { barSide, uprights, rails, inset, embed } = WINDOW_GRILLE

    for (const w of windows) {
      const bars = grilleBars(w.outerWidth, w.outerHeight, barSide, uprights, rails, embed)
      if (bars.length === 0) continue
      const d = azimuthToVector(w.azimuthDeg)
      // set back from the outer face, inside the reveal
      const radius = TOWER.outerRadius - inset

      for (const bar of bars) {
        const g =
          bar.orientation === 'vertical'
            ? new THREE.BoxGeometry(barSide, bar.length, barSide)
            : new THREE.BoxGeometry(bar.length, barSide, barSide)
        /*
         * Local frame: X across the opening (tangential), Y up, Z radial. The
         * bar is built in that frame, then turned by the azimuth and pushed out
         * to the face — the same order the window cutter uses, so a grille can
         * never end up in a different plane from the hole it covers.
         */
        g.translate(
          bar.orientation === 'vertical' ? bar.offset : 0,
          bar.orientation === 'horizontal' ? bar.offset : 0,
          0,
        )
        g.rotateY(-w.azimuthDeg * (Math.PI / 180))
        g.translate(d.x * radius, w.centreY, d.z * radius)
        parts.push(g)
      }
    }
    if (parts.length === 0) return null
    const merged = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    return merged
  }, [windows])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!visible || !geometry) return null

  return (
    <mesh geometry={geometry} castShadow>
      {material ? (
        <primitive object={material} attach="material" />
      ) : (
        /* dark, slightly glossy iron — it is metal in a stone hole */
        <meshStandardMaterial color="#3b3a37" roughness={0.55} metalness={0.7} />
      )}
    </mesh>
  )
}
