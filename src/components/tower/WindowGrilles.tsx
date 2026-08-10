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
 * NO COLLIDER, AND THE OLD REASON FOR IT IS DEAD.
 *
 * It used to be "you cannot walk into a slit — the walker never reaches it".
 * Since [OWNER] 2026-08-10 the walker stands on a landing about a metre from a
 * reveal whose inner mouth is 1.45 m wide and 2 m tall, so that sentence is
 * simply false and a grille you can walk through is on this project's forbidden
 * list.
 *
 * The conclusion survives on a different footing, and it is checked rather than
 * asserted — see the collider test in wallIntegrity.test.ts. wallColliders()
 * emits a 'passageOuter' box for every azimuth the passage occupies, running
 * from the passage's outer cheek outward over the passage's full height. The
 * reveal starts at that same cheek and lies wholly inside that height band, so
 * the mouth is already walled off by the stair's own collider. Adding a second
 * box in the same place would be the collider nobody can touch.
 *
 * All in ONE merged geometry: six or seven openings times five or six bars is
 * forty-odd meshes otherwise, for something that is a few dozen triangles.
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
      /*
       * WHICH END OF THE REVEAL, and it is not the same for both kinds.
       *
       * A slit's wrought gate stands at the OUTER end of the reveal, just short
       * of the slit itself. In the later arched window the grille is at the far
       * end instead — the room face — with lock plate and keeper on the right
       * jamb and a glazed casement behind it. One rule for both would be wrong on
       * one of them.
       *
       * Two of the four blind readings placed the slit gate at the inner end and
       * criticised the model for having it outside. The re-check found the model
       * right and the readings wrong, which is the only reason this ends up as a
       * per-opening field rather than a global flip.
       *
       * The second value used to be spelled 'room'. It is 'revealEnd' now: for a
       * slit the far end of the reveal is a stair landing, and the field has to
       * name the surface rather than the space behind it.
       */
      const radius =
        w.barrierAt === 'revealEnd'
          ? w.revealEndRadius + inset
          : TOWER.outerRadius - inset

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
