import { useMemo } from 'react'
import { Sky } from '@react-three/drei'
import { sunDirection, sunPosition } from '../../lib/sun'
import { daylightFraction } from '../../lib/exposure'
import { SUN } from '../../config/lighting'
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
    /*
     * Full strength times the twilight fade — see config/lighting.ts for what
     * "full strength" is a ratio TO, and lib/exposure.ts for the fade's shape,
     * which is unchanged. The bare `1` that stood here was the last big light in
     * the model that had not been sized against the scene's white point, and it
     * left the sunlit drum twenty-five times under the sky the same frame draws.
     */
    const i = SUN.fullIntensity * daylightFraction(s.altitudeDeg)
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
        color={sun.altitudeDeg < SUN.lowAltitudeDeg ? SUN.lowColour : SUN.dayColour}
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

      {/*
        Sky fill: bluish by day, almost nothing at night, so the interior does
        not go pitch black but is still clearly unlit.

        DELIBERATELY NOT RAISED WITH THE SUN, and the reason is that this light
        goes through walls. three has no global illumination, so a hemisphere is
        an unoccluded term added to every surface in the model, inside a sealed
        chamber as readily as on the roof. Its ceiling is therefore the darkest
        room in the building — storey 5, which has no opening of any kind — and
        not the shaded side of the drum. Measured with the hand lamp off, this
        value puts that room at byte 18; four times it puts it at byte 72, which
        is a lit room lit by nothing. The cost of leaving it is recorded in
        config/lighting.ts: outdoors the shaded half of the wall stays darker than
        a photograph, and that wants occluded sky light rather than a bigger
        number here.
      */}
      <hemisphereLight
        color={sun.isUp ? '#bcd4f0' : '#243043'}
        groundColor="#4a4034"
        intensity={sun.isUp ? 0.35 : 0.08}
      />
    </>
  )
}
