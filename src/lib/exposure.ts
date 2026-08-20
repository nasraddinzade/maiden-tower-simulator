/**
 * The scene's white point, and the one rule that sizes a light against it.
 *
 * WHY THIS FILE EXISTS. 76421f8 wrote the white point down — ACES at exposure 1
 * — and solved the hand lamp against it, which was right and fixed a real
 * blow-out. It solved it in LUMINANCE, and dropped the light's own colour out of
 * the arithmetic. The tone curve does not clip luminance: it clips each channel
 * on its own. Interior limestone runs 1.23 times its own luminance in red, so at
 * half a flight's width the solve believed it was putting 0.35 on the stone —
 * byte 175, mid-curve, where a change of angle still changes the pixel — and was
 * putting 0.437, byte 189. Nearer than that, and a walker on a landing is nearer
 * than that to the cheek beside him, it runs onto the shoulder. lamp.test.ts
 * agreed with the arithmetic throughout, because it measured the same quantity
 * the solve did rather than the one the picture has.
 *
 * MEASURED, 2026-08-20, walking the model at 12:00 Baku (frames kept out of the
 * repo; the numbers are the evidence):
 *
 *   · head landing of the climb 2→3, facing the blind end, the walker's own
 *     working distance from the stone — R 226, G 191, B 132, whole-frame σ 9.6.
 *     226 is the byte TONE_SHOULDER is defined by. One flat cream field with the
 *     bed joint reduced to a hairline: exactly the fault the lamp module says it
 *     exists to prevent, at the one distance it was solved for.
 *   · the same instant, the sunlit face of the drum — R 75, luminance 60. The
 *     sky drawn three pixels away by the same renderer — R 235, luminance 238.
 *     In scene-linear that is 0.064 against 1.58, a factor of 25.
 *   · storey 1 with the entrance wide open to a 60°-altitude sun, lamp off —
 *     byte 16. Sealed storey 5, lamp off, same instant — byte 18. A 2.9 m
 *     doorway facing the sun is worth two bytes.
 *   · every interior viewpoint renders the SAME PIXEL VALUES at 06:30, 12:00 and
 *     17:00 (storey 5 wall R 126.3 at all three; the head landing R 226.2 at all
 *     three). The inside of this model does not know what time it is.
 *
 * The second, third and fourth of those are one fault: a directional light of
 * intensity 1 lighting stone of the measured albedo produces about 0.05 of a
 * scene where 1.0 is the top of the usable curve. The sun was the last big light
 * in the model that had never been sized against anything.
 *
 * THE RULE, and it is the same one for every light here: a light is sized so
 * that the BRIGHTEST CHANNEL of the reference stone it is meant to show lands on
 * TONE_SHOULDER when that stone faces it square on. Brightest channel, because
 * that is the channel that clips; the reference stone, because the point of the
 * exposure is to show the building and not the sky behind it.
 *
 * Nothing here knows about three.js, and nothing here is geometry.
 */

import { linearChannels } from './masonry'

/**
 * Linear radiance at which three's ACES curve at exposure 1 has spent its usable
 * range: grey 1.0 maps to byte 226, and everything above it shares the last 29
 * codes. A channel over this is white with no relief left in it.
 */
export const TONE_SHOULDER = 1.0

/**
 * The three channels of `albedoHex` lit by `lightHex`, in linear light — what
 * the shader actually mixes, before the tone curve and before the sRGB encode.
 *
 * Both arguments are sRGB hexes because that is how every colour in this project
 * is recorded: the palette was sampled off photographs and the light colours are
 * written the same way.
 */
export function channelResponse(lightHex: string, albedoHex: string): [number, number, number] {
  const l = linearChannels(lightHex)
  const a = linearChannels(albedoHex)
  return [l[0] * a[0], l[1] * a[1], l[2] * a[2]]
}

/**
 * The channel that will clip first — the largest of the three.
 *
 * This is the quantity a light has to be solved against. Solving in luminance
 * understates it by however warm the pair is: 1.23 for the hand lamp on interior
 * stone, 1.36 for the sun on the exterior. Both are enough to put a target meant
 * for the middle of the curve onto its shoulder.
 */
export function peakChannelResponse(lightHex: string, albedoHex: string): number {
  return Math.max(...channelResponse(lightHex, albedoHex))
}

/**
 * Irradiance for a light that must put `albedoHex`, lit head-on by `lightHex`,
 * at `target` linear in its brightest channel.
 *
 * three's punctual model reflects `albedo/π · E · cosθ` off a Lambertian
 * surface, so at cosθ = 1 the irradiance that lands the peak channel on the
 * target is `π · target / peak`. For a directional light `intensity` IS that
 * irradiance, so the return value goes straight onto the light.
 */
export function deriveKeyIntensity(
  lightHex: string,
  albedoHex: string,
  target: number = TONE_SHOULDER,
): number {
  const peak = peakChannelResponse(lightHex, albedoHex)
  if (!(peak > 0)) throw new Error('exposure: the lit surface has no response in any channel')
  if (!(target > 0)) throw new Error('exposure: the target must be positive')
  return (Math.PI * target) / peak
}

/**
 * How much of full strength the sun is delivering at `altitudeDeg`.
 *
 * UNCHANGED IN SHAPE from what SunSystem has always applied by hand — a floor of
 * 0.15 so twilight fades out rather than snapping off at the horizon, rising
 * with the sine of the altitude and clamped at full by about 23°. It is lifted
 * out of the component for one reason: it is arithmetic, it is now multiplied by
 * a derived number rather than standing in for one, and it should be stated
 * where it can be read and tested.
 *
 * It is NOT air mass and does not claim to be. Direct normal irradiance really
 * is roughly flat well above the horizon — what changes with the sun's height is
 * the cosine on the surface, and three already does that.
 */
export function daylightFraction(altitudeDeg: number): number {
  if (altitudeDeg <= 0) return 0
  return Math.min(1, 0.15 + Math.sin((altitudeDeg * Math.PI) / 180) * 2.2)
}
