import { useMemo } from 'react'
import * as THREE from 'three'
import { azimuthToVector } from '../../lib/geometry'
import { openingsLit, sunPosition, type OpeningAperture } from '../../lib/sun'
import { SITE, TOWER } from '../../config/tower'
import type { WindowCut } from '../../lib/towerShell'

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
        dir.x * ap.revealEndRadius,
        ap.centreY,
        dir.z * ap.revealEndRadius,
      )
      /*
       * As far as the reveal is deep, and no further.
       *
       * It used to run innerRadius × 1.7, i.e. right across the chamber, because
       * every opening lit a chamber. Most of them light a stair landing 0.9 m
       * wide now; a shaft drawn across the room from one would pass through the
       * inner cheek of the passage and out into a storey that has no window.
       */
      const length = Math.max(0.5, TOWER.outerRadius - ap.revealEndRadius)
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

/**
 * The aperture list the solar test consumes — built from the SAME cuts that
 * carve the shell.
 *
 * It used to take the raw JSON and rebuild each centre as floorY +
 * heightAboveFloor + outerHeight/2, while the shell had already moved to the
 * photographic height fraction. The two disagreed by more than a metre and
 * nothing complained. Handing it the WindowCut array closes that off: if the
 * beam is drawn, it is drawn through a hole that exists.
 */
export function buildApertures(windows: WindowCut[]): OpeningAperture[] {
  return windows.map((w) => ({
    id: w.id,
    azimuthDeg: w.azimuthDeg,
    centreY: w.centreY,
    outerWidth: w.outerWidth,
    outerHeight: w.outerHeight,
    innerWidth: w.innerWidth,
    innerHeight: w.innerHeight,
    outerRadius: TOWER.outerRadius,
    revealEndRadius: w.revealEndRadius,
  }))
}
