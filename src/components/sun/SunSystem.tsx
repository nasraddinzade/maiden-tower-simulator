import { useMemo } from 'react'
import { Sky } from '@react-three/drei'
import { sunDirection, sunPosition } from '../../lib/sun'
import { SITE, TOWER } from '../../config/tower'

export interface SunSystemProps {
  /** The moment being shown. */
  date: Date
  /** Draw the sky dome as well as the light. */
  showSky?: boolean
}

/** Distance to place the light at — far enough that its shadow frustum covers the tower. */
const LIGHT_DISTANCE = 90

/**
 * Phase 8 — an astronomically placed sun.
 *
 * The light's direction comes from suncalc for the tower's real coordinates, so
 * every shadow in the scene is the shadow that would fall at that instant. This
 * is what makes the solar hypotheses testable rather than decorative: nothing
 * here is aimed at any opening.
 */
export function SunSystem({ date, showSky = true }: SunSystemProps) {
  const { position, sun, intensity } = useMemo(() => {
    const s = sunPosition(date, SITE.latitude, SITE.longitude)
    const d = sunDirection(s)
    // twilight fades the light out rather than snapping it off at the horizon
    const i = s.altitudeDeg > 0 ? Math.min(1, 0.15 + Math.sin((s.altitudeDeg * Math.PI) / 180) * 2.2) : 0
    return {
      sun: s,
      position: [d.x * LIGHT_DISTANCE, d.y * LIGHT_DISTANCE, d.z * LIGHT_DISTANCE] as [number, number, number],
      intensity: i,
    }
  }, [date])

  const shadowExtent = TOWER.outerRadius * 3.2

  return (
    <>
      {showSky && (
        <Sky
          distance={450000}
          sunPosition={position}
          // haze rises when the sun is low, which is when the beam tests matter
          turbidity={sun.altitudeDeg < 8 ? 8 : 4}
          rayleigh={sun.altitudeDeg < 8 ? 3 : 1.2}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />
      )}

      <directionalLight
        position={position}
        intensity={intensity}
        color={sun.altitudeDeg < 6 ? '#ffd0a0' : '#fff6e8'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={LIGHT_DISTANCE * 2.5}
      />

      {/* Sky fill: bluish by day, almost nothing at night, so the interior does
          not go pitch black but is still clearly unlit. */}
      <hemisphereLight
        color={sun.isUp ? '#bcd4f0' : '#243043'}
        groundColor="#4a4034"
        intensity={sun.isUp ? 0.35 : 0.08}
      />
    </>
  )
}
