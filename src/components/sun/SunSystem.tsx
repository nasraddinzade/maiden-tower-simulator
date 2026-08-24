import { useMemo, useState } from 'react'
import { Sky } from '@react-three/drei'
import { sunDirection, sunPosition } from '../../lib/sun'
import { daylightFraction } from '../../lib/exposure'
import { redrawAngleRad, shadowTexelMetres } from '../../lib/shadowRefresh'
import { SHADOW, SUN, shadowMapSize } from '../../config/lighting'
import { isMobileProfile } from '../../config/perf'
import { SITE } from '../../config/tower'
import { ShadowRefresh } from './ShadowRefresh'

export interface SunSystemProps {
  /** The moment being shown. */
  date: Date
  /** Draw the sky dome as well as the light. */
  showSky?: boolean
}

/**
 * Phase 8 — an astronomically placed sun.
 *
 * The light's direction comes from suncalc for the tower's real coordinates, so
 * every shadow in the scene is the shadow that would fall at that instant. This
 * is what makes the solar hypotheses testable rather than decorative: nothing
 * here is aimed at any opening.
 *
 * THE SHADOW MAP IS NO LONGER REDRAWN EVERY FRAME. Its size, its frustum and its
 * bias now come from config/lighting.ts → SHADOW instead of being literals in
 * this file, the mobile profile gets a 1024² map where the desktop keeps 2048²,
 * and <ShadowRefresh> below marks the map dirty only when the sun has actually
 * turned or the set of casters has changed. What that was costing, and why the
 * gate is an angle rather than a flag, is argued in those two files.
 */
export function SunSystem({ date, showSky = true }: SunSystemProps) {
  const { position, direction, sun, intensity } = useMemo(() => {
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
      direction: d,
      position: [
        d.x * SHADOW.lightDistance,
        d.y * SHADOW.lightDistance,
        d.z * SHADOW.lightDistance,
      ] as [number, number, number],
      intensity: i,
    }
  }, [date])

  /*
   * READ ONCE, ON PURPOSE. three allocates the shadow map's depth target on the
   * first shadow render and will not resize it afterwards without the old target
   * being disposed, so a map size that tracked the viewport would be a map size
   * that silently stopped taking effect. useState's initialiser is the only hook
   * that guarantees "once" — useMemo is allowed to forget. See shadowMapSize().
   */
  const [mapSize] = useState(() => shadowMapSize(isMobileProfile()))
  /*
   * How far the sun must turn before the map it drew is no longer the map it
   * would draw: one texel of ground across the deepest the shadow camera can
   * see. Derived from the size chosen above, so the coarser mobile map also
   * asks for fewer redraws — 0.0131° against the desktop's 0.0066°.
   */
  const redrawAngle = useMemo(
    () => redrawAngleRad(shadowTexelMetres(SHADOW.extentMetres, mapSize), SHADOW.cameraFar),
    [mapSize],
  )

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
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={SHADOW.bias}
        shadow-camera-left={-SHADOW.extentMetres}
        shadow-camera-right={SHADOW.extentMetres}
        shadow-camera-top={SHADOW.extentMetres}
        shadow-camera-bottom={-SHADOW.extentMetres}
        shadow-camera-near={SHADOW.cameraNear}
        shadow-camera-far={SHADOW.cameraFar}
      />

      <ShadowRefresh direction={direction} minAngleRad={redrawAngle} />

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
