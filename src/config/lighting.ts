import { deriveKeyIntensity } from '../lib/exposure'
import { LIMESTONE_LIGHT } from '../lib/masonry'
import { TOWER } from './tower'

/**
 * The sun as a LIGHT, as opposed to the sun as a position.
 *
 * Where it stands is lib/sun.ts and suncalc's business and nothing here touches
 * it. What is here is how much light it delivers and what colour it is — the one
 * thing about the daylight in this model that had never been sized against
 * anything at all.
 *
 * WHAT WAS WRONG, measured 2026-08-20 at 12:00 Baku, sun at altitude 60.4°:
 *
 *   sunlit face of the drum          byte  60
 *   the sky, drawn by the same frame byte 238
 *
 * In scene-linear that is 0.062 against 1.58 — the sky is twenty-five times the
 * brightest stone on the building. At noon the tower rendered as a silhouette
 * against a white sky, and the shaded side at byte 25 had no coursing left in it
 * at all. The cause is arithmetic, not taste: a directional light of intensity 1
 * on Lambertian stone returns `albedo/π`, and the measured limestone's brightest
 * channel is 0.402, so the best the building could ever do was 0.128 of a scene
 * whose usable range tops out at 1.0.
 *
 * AND IT REACHED INSIDE, which is why this is not a question about the exterior.
 * The chambers are lit through 29.385° of sky in the whole building (see
 * lib/chamberDaylight.ts), so the daylight term indoors was 25 times under scale
 * as well and simply vanished. Measured with the hand lamp switched off: storey
 * 1, entrance 2.9 m wide and wide open to a 60° sun, byte 16 — against sealed
 * storey 5, which has no opening of any kind, at byte 18. And every interior
 * viewpoint rendered THE SAME PIXEL VALUES at 06:30, 12:00 and 17:00. A model
 * whose whole solar layer is an argument about where light falls was showing an
 * interior that did not know what time it was.
 *
 * HOW IT IS SIZED NOW. Same rule as the hand lamp, one line of arithmetic:
 * the measured exterior limestone, square on to the sun, lands its brightest
 * channel on TONE_SHOULDER. That is a statement about the BUILDING using the
 * whole curve, not about the sky — the sky is drawn by its own shader at its own
 * scale and is left alone, and at 1.58 it still sits a little above sunlit stone,
 * which is what a photograph of this tower looks like.
 *
 * WHAT IS NOT FIXED HERE, and it is the fill. `ambientLight` and
 * `hemisphereLight` are the only lights in this scene that pass through five
 * metres of stone: three has no global illumination and neither of them is
 * occluded by anything. Their size is therefore set by the DARKEST ROOM in the
 * building and not by how the shaded side of the drum looks — storey 5 has no
 * opening at all, and with the lamp off it must stay dark. Measured, four times
 * the present fill would put that sealed room at byte 72, which is a lit room lit
 * by nothing. So the fill is left exactly where it was, the shaded half of the
 * drum stays darker than a photograph of it, and that is a debt this file is
 * recording rather than paying: closing it needs occluded sky light — a second
 * shadow-casting source, or an irradiance volume — not a bigger number.
 */
export const SUN = {
  /**
   * Colour of the disc well clear of the horizon. Its red channel is 1.0, which
   * is also the channel the derivation below lands on the shoulder.
   */
  dayColour: '#fff6e8',
  /**
   * Reddened low sun. Red is 1.0 here too, so the derived intensity is the same
   * number for both and the colour change costs no brightness — the fade below
   * is what takes the light down near the horizon.
   */
  lowColour: '#ffd0a0',
  /** Below this altitude the light takes `lowColour`, in degrees. */
  lowAltitudeDeg: 6,
  /**
   * Irradiance of the sun at full strength.
   *
   * DERIVED, not chosen: `π · TONE_SHOULDER / peakChannelResponse(dayColour,
   * LIMESTONE_LIGHT)`. Change the measured palette and this follows; change the
   * exposure and it follows. It comes out near 7.8, against the 1 that was there
   * before, and the 1 was never a ratio to anything.
   */
  fullIntensity: deriveKeyIntensity('#fff6e8', LIMESTONE_LIGHT),
} as const

// ————————————————————————— the shadow map —————————————————————————

/**
 * The sun's shadow map: how big it is, what square of ground it covers, and how
 * deep it looks.
 *
 * ALL FIVE OF THESE WERE LITERALS INSIDE SunSystem.tsx and none of them has
 * changed value here. They are moved because the map size now has to differ
 * between the desktop and the mobile profile, and a component that picks one of
 * two sizes out of its own body is exactly what rule 2 forbids. The rest follow
 * it because leaving four magic numbers beside a configured one is worse than
 * having had five.
 *
 * WHAT THE MAP WAS COSTING, measured in the browser on 2026-08-24, 375×812,
 * the shipped code, at three orbit viewpoints and by differencing one render
 * with `shadowMap.autoUpdate` true against one with it false:
 *
 *   opening view, with the shadow pass      86 calls   114 052 triangles
 *   opening view, without it                53 calls    58 069 triangles
 *   the shadow pass alone                   33 calls    55 983 triangles
 *
 * That is 38% of the draw calls and 49% of the triangles, redrawn sixty times a
 * second, into a 2048² map, for a light that moves once every twenty seconds and
 * a building that does not move at all. The mobile budget is 60 calls
 * (config/perf.ts): 86 breaks it and 53 does not, so this one pass is the whole
 * of the opening screen's overspend.
 *
 * AND WHAT IT COSTS NOW, same three viewpoints, same probe, same session:
 *
 *   orbit opening        86 → 53 calls    114 052 → 58 069 triangles
 *   orbit low, sunlit    86 → 53 calls    114 052 → 58 069 triangles
 *   orbit close, north   84 → 51 calls    113 992 → 58 009 triangles
 *
 * Hand-stepping the frame loop and counting the shadow renders themselves: 120
 * consecutive frames with the sun still and the model unchanged draw the map
 * NOT ONCE. Nudge the time scrubber by a minute and exactly one frame redraws
 * it, at the same 33 calls and 55 983 triangles, and the next thirty do not.
 * Switch the shell off and exactly one frame redraws it, at 27 calls and 14 302
 * triangles, which is the tower's own contribution leaving the map.
 *
 * THE FIX IS NOT A SMALLER MAP, it is not redrawing an unchanged one —
 * lib/shadowRefresh.ts holds the rule and components/sun/ShadowRefresh.tsx
 * applies it. The smaller mobile map is a second, separate saving and it is
 * worth naming honestly: it buys NO draw calls and NO triangles. What it buys is
 * 12.6 MB of the 150 MB texture budget (2048² × 4 B = 16.8 MB against 1024² ×
 * 4 B = 4.2 MB) and a quarter of the shadow pass's fill, and what it costs is
 * resolution — 25.8 mm of ground per texel becomes 51.6 mm. On a phone held at
 * arm's length, against a drum 16.5 m across, that is a shadow edge softening by
 * half a course line.
 */
export const SHADOW = {
  /** Shadow-map side, desktop profile. Was the literal 2048 in SunSystem. */
  mapSizeDesktop: 2048,
  /**
   * Shadow-map side, mobile profile. docs/optimization-addendum.md, Phase 8:
   * "Разрешение карты: 2048 десктоп, 1024 мобильный". The addendum wants the
   * choice made by detectGPU; config/perf.ts → isMobileProfile() is the signal
   * this project actually uses everywhere else, and a second detector that
   * disagreed with it would be worse than the one that is here.
   */
  mapSizeMobile: 1024,
  /**
   * The shadow camera's half-width, in tower radii. UNCHANGED from the 3.2 that
   * stood in SunSystem — this is a framing constant, not a measurement of the
   * building, and moving it must not move a shadow.
   */
  extentRadii: 3.2,
  /** m — the same half-width in metres: 26.4, so a 52.8 m square of ground. */
  extentMetres: TOWER.outerRadius * 3.2,
  /**
   * m — how far up the sun's direction the light is placed. Far enough that its
   * orthographic frustum clears the tower; it sets the far plane below, which is
   * why it lives in the shadow block rather than beside the intensity.
   */
  lightDistance: 90,
  /** m — shadow camera near plane. */
  cameraNear: 1,
  /**
   * m — shadow camera far plane, 2.5 × the light distance.
   *
   * IT IS ALSO THE REACH THE REDRAW GATE MEASURES AGAINST, and that is not a
   * coincidence: turning the light by θ moves the shadow of a caster standing
   * `d` above its receiver by about d·θ, and the deepest `d` that can be inside
   * this map is the frustum's own depth. Using the far plane rather than the
   * tower's height overstates the movement, which is the safe direction to be
   * wrong in — it redraws a little too often rather than showing a stale shadow.
   */
  cameraFar: 90 * 2.5,
  /** Depth bias. Was the literal -0.0004 in SunSystem. */
  bias: -0.0004,
} as const

/**
 * Which shadow map this machine gets.
 *
 * Read ONCE, when the light mounts. three allocates the depth target on the
 * first shadow render and does not resize it when `mapSize` changes afterwards
 * without the old target being disposed, so a value that followed the viewport
 * would be a value that silently stopped taking effect. A phone does not become
 * a desktop halfway through a visit; a rotated phone is still a phone.
 */
export function shadowMapSize(mobile: boolean): number {
  return mobile ? SHADOW.mapSizeMobile : SHADOW.mapSizeDesktop
}
