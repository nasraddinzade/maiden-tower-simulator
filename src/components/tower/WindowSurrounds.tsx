import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { azimuthToVector } from '../../lib/geometry'
import { TOWER, WINDOW_SURROUND } from '../../config/tower'
import type { WindowCut } from '../../lib/towerShell'

/**
 * The dressed stone framing each opening on the outside.
 *
 * DRAWN, NOT CUT — like the grilles, and for the same two reasons. A surround is
 * masonry ADDED round a hole the wall already has, so it has no business in the
 * CSG; and putting a dozen small blocks per opening into the boolean, up against
 * a splayed reveal, is exactly the near-coincident work that has already cost
 * this model its stair floor once and its window reveals once.
 *
 * NO COLLIDER. The frame sits on the outer face, where nobody can stand.
 *
 * One merged geometry for the whole set, however many that turns out to be —
 * which is not a fixed number any more: every opening is the end of a flight, and
 * which ends carry one is [PLACEHOLDER] data the owner has still to fill in.
 */
export function WindowSurrounds({
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
    const S = WINDOW_SURROUND

    for (const w of windows) {
      const d = azimuthToVector(w.azimuthDeg)
      const halfW = w.outerWidth / 2
      const halfH = w.outerHeight / 2
      const frameW = w.outerWidth + 2 * S.sideMargin
      /*
       * The frame straddles the face: `depth` of it bedded into the masonry, the
       * rest standing proud. Bedding it is what stops a seam appearing between
       * the frame and the drum when the drum's 96-segment lathe and the frame's
       * flat back disagree — which they always do on a curved wall.
       */
      const place = (
        width: number,
        height: number,
        depth: number,
        y: number,
        radius: number,
      ) => {
        const g = new THREE.BoxGeometry(width, height, depth)
        g.rotateY(-w.azimuthDeg * (Math.PI / 180))
        g.translate(d.x * radius, w.centreY + y, d.z * radius)
        parts.push(g)
      }

      const bedded = TOWER.outerRadius - S.depth

      // the head: a lintel over a flat opening, a hood over an arched one
      place(
        frameW,
        S.headHeight,
        S.depth + S.sillProjection * 0.5,
        halfH + S.headHeight / 2,
        bedded + (S.depth + S.sillProjection * 0.5) / 2,
      )

      // the jambs, only as far up as the head
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(S.sideMargin, w.outerHeight, S.depth)
        g.translate(side * (halfW + S.sideMargin / 2), 0, 0)
        g.rotateY(-w.azimuthDeg * (Math.PI / 180))
        g.translate(d.x * (bedded + S.depth / 2), w.centreY, d.z * (bedded + S.depth / 2))
        parts.push(g)
      }

      /*
       * The sill, and it is the piece that reads. It projects, and its top falls
       * outward so it throws water — visible on the lower slit as a rounded,
       * weathered edge tilted away from the wall. The fall is applied by dropping
       * the outer edge of the slab rather than rotating it, so the block still
       * beds square into the masonry behind.
       */
      const sillDepth = S.depth + S.sillProjection
      const sill = new THREE.BoxGeometry(frameW, S.sillThickness, sillDepth)
      const pos = sill.attributes.position as THREE.BufferAttribute
      const outerZ = -sillDepth / 2
      for (let i = 0; i < pos.count; i += 1) {
        if (pos.getZ(i) < outerZ + 1e-6 && pos.getY(i) > 0) {
          pos.setY(i, pos.getY(i) - S.sillFall)
        }
      }
      pos.needsUpdate = true
      sill.rotateY(-w.azimuthDeg * (Math.PI / 180))
      sill.translate(
        d.x * (bedded + sillDepth / 2),
        w.centreY - halfH - S.sillThickness / 2,
        d.z * (bedded + sillDepth / 2),
      )
      parts.push(sill)
    }

    if (parts.length === 0) return null
    const merged = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    merged.computeVertexNormals()
    return merged
  }, [windows])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!visible || !geometry) return null

  return (
    <mesh geometry={geometry} material={material} castShadow receiveShadow>
      {!material && <meshStandardMaterial color="#b3a993" roughness={0.9} />}
    </mesh>
  )
}
