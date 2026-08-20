import { deriveKeyIntensity } from '../lib/exposure'
import { LIMESTONE_LIGHT } from '../lib/masonry'

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
