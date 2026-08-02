import { useMemo } from 'react'
import * as THREE from 'three'
import { azimuthToVector } from '../../lib/geometry'
import { openingsLit, sunPosition, type OpeningAperture } from '../../lib/sun'
import { SITE, TOWER, innerRadiusAt } from '../../config/tower'

export interface SunBeamsProps {
  date: Date
  apertures: OpeningAperture[]
  visible: boolean
}

/**
 * Phase 8 — the shaft of light through an opening.
 *
 * Drawn only for openings the solar geometry says are actually lit, so the beam
 * is a readout of the test rather than an illustration of a hoped-for result.
 * A cheap additive cone reads well against dark masonry and costs nothing.
 */
export function SunBeams({ date, apertures, visible }: SunBeamsProps) {
  const beams = useMemo(() => {
    if (!visible) return []
    const sun = sunPosition(date, SITE.latitude, SITE.longitude)
    const hits = openingsLit(sun, apertures)

    return hits.map((hit) => {
      const ap = apertures.find((a) => a.id === hit.openingId)!
      const dir = azimuthToVector(ap.azimuthDeg)
      // start at the opening's inner face and run inward across the room
      const start = new THREE.Vector3(
        dir.x * ap.innerRadius,
        ap.centreY,
        dir.z * ap.innerRadius,
      )
      const length = ap.innerRadius * 1.7
      const inward = new THREE.Vector3(-dir.x, 0, -dir.z).normalize()
      // drop the far end by the sun's altitude so the shaft points where it should
      inward.y = -Math.tan((sun.altitudeDeg * Math.PI) / 180)
      inward.normalize()
      const end = start.clone().addScaledVector(inward, length)
      const mid = start.clone().add(end).multiplyScalar(0.5)

      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        inward.clone().normalize(),
      )

      return {
        id: hit.openingId,
        position: mid.toArray() as [number, number, number],
        quaternion: quat,
        length,
        // the shaft spreads as the reveal flares
        radiusTop: Math.max(0.12, ap.outerWidth * 0.5),
        radiusBottom: Math.max(0.3, ap.innerWidth * 0.75),
      }
    })
  }, [date, apertures, visible])

  if (!visible || beams.length === 0) return null

  return (
    <group>
      {beams.map((b) => (
        <mesh key={b.id} position={b.position} quaternion={b.quaternion}>
          <coneGeometry args={[b.radiusBottom, b.length, 20, 1, true]} />
          <meshBasicMaterial
            color="#ffe6b8"
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

/** Build the aperture list the solar test consumes, from the window data. */
export function buildApertures(
  windows: Array<{
    id: string
    floorIndex: number
    azimuthDeg: number
    heightAboveFloor: number
    outerWidth: number
    outerHeight: number
    innerWidth: number
    innerHeight: number
  }>,
  floors: Array<{ floorY: number }>,
): OpeningAperture[] {
  return windows.map((w) => {
    const centreY = floors[w.floorIndex].floorY + w.heightAboveFloor + w.outerHeight / 2
    return {
      id: w.id,
      azimuthDeg: w.azimuthDeg,
      centreY,
      outerWidth: w.outerWidth,
      outerHeight: w.outerHeight,
      innerWidth: w.innerWidth,
      innerHeight: w.innerHeight,
      outerRadius: TOWER.outerRadius,
      innerRadius: innerRadiusAt(centreY),
    }
  })
}
