import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { azimuthToVector } from '../../lib/geometry'
import { ENTRANCE, ENTRANCE_ARCHIVOLT, TOWER } from '../../config/tower'

const DEG = Math.PI / 180

/**
 * The ring of dressed voussoirs round the doorway.
 *
 * The model drew the entrance as a plain arched hole. The photographs show a
 * full archivolt: worked stone round a semicircular head, standing proud of the
 * rubble, with a recess between its outer face and the leaf behind. This is the
 * one opening every visitor photographs, and a bare hole reads the whole façade
 * wrong.
 *
 * DRAWN, NOT CUT — like the grilles, the window surrounds and the course bands.
 * An archivolt is stone set round a hole the wall already has, so it has no
 * business in the CSG, and fifteen small wedges against a barrel-vaulted tunnel
 * is exactly the near-coincident work that has cost this model dearly twice.
 *
 * NO COLLIDER: it is on the outer face, above head height, where nobody stands.
 */
export function EntranceArchivolt({
  material,
  visible = true,
}: {
  material?: THREE.Material
  visible?: boolean
}) {
  const geometry = useMemo(() => {
    const A = ENTRANCE_ARCHIVOLT
    const az = ENTRANCE.azimuthDeg * DEG
    const d = azimuthToVector(ENTRANCE.azimuthDeg)
    const halfW = ENTRANCE.width / 2
    // the opening's head is a semicircle of the opening's own half-width,
    // springing where archTunnel puts it: height − halfWidth above the sill
    const springY = ENTRANCE.thresholdY + ENTRANCE.height - halfW
    const parts: THREE.BufferGeometry[] = []

    const place = (g: THREE.BufferGeometry, across: number, y: number, roll: number) => {
      g.rotateZ(roll)
      g.translate(across, y, 0)
      g.rotateY(Math.PI - az)
      g.translate(
        d.x * (TOWER.outerRadius - A.stoneDepth / 2 + A.projection),
        0,
        d.z * (TOWER.outerRadius - A.stoneDepth / 2 + A.projection),
      )
      parts.push(g)
    }

    // the two jambs of the ring, from the sill up to the springing
    for (const side of [-1, 1]) {
      const h = springY - ENTRANCE.thresholdY
      const g = new THREE.BoxGeometry(A.ringDepth, h, A.stoneDepth)
      place(g, side * (halfW + A.ringDepth / 2), ENTRANCE.thresholdY + h / 2, 0)
    }

    /*
     * The head: wedges swept round the semicircle. Each is a box turned to its
     * own angle, which is what a voussoir is — the joints radiate from the
     * centre of the arc, and drawing them as a smooth band would lose the one
     * thing that says the ring is built rather than carved.
     */
    for (let i = 0; i < A.stones; i += 1) {
      const t = ((i + 0.5) / A.stones) * Math.PI
      const r = halfW + A.ringDepth / 2
      const g = new THREE.BoxGeometry(
        A.ringDepth,
        (Math.PI * (halfW + A.ringDepth)) / A.stones,
        A.stoneDepth,
      )
      g.rotateZ(t - Math.PI / 2)
      g.translate(-Math.cos(t) * r, springY + Math.sin(t) * r, 0)
      g.rotateY(Math.PI - az)
      g.translate(
        d.x * (TOWER.outerRadius - A.stoneDepth / 2 + A.projection),
        0,
        d.z * (TOWER.outerRadius - A.stoneDepth / 2 + A.projection),
      )
      parts.push(g)
    }

    if (parts.length === 0) return null
    const merged = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    merged.computeVertexNormals()
    return merged
  }, [])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!visible || !geometry) return null

  return (
    <mesh geometry={geometry} material={material} castShadow receiveShadow>
      {!material && <meshStandardMaterial color="#b3a993" roughness={0.9} />}
    </mesh>
  )
}
