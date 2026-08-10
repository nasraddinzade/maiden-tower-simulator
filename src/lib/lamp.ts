/**
 * Sizing the walker's hand lamp (Phase 6 kit, not fabric).
 *
 * WHY THIS IS ARITHMETIC AND NOT A SLIDER. The lamp was dialled in by eye at
 * the distances of a chamber — three or four metres — and then had to work at
 * the distances of a stair passage, where the wall is half the flight's width
 * away. Between 0.45 m and 4.4 m an inverse-square source changes by a factor
 * of about 70, while three's ACES curve at exposure 1 has room for roughly 50
 * between "just visible" and "clipped white": above linear 1 the whole rest of
 * the range is 29 codes out of 255. So the passage blew out to a flat cream in
 * which two surfaces at different angles read as one tone, while the chamber
 * was correct. No intensity fixes that — the RATIO is what does not fit.
 *
 * The fix is to state the two conditions the lamp has to meet and solve for the
 * pair (intensity, decay) that meets them, which is what the functions here do.
 * The resulting decay is well under 2 and therefore NOT physical for a point
 * source. That is deliberate and it is confined to this one light: the lamp is
 * an instrument for looking at the building, like the scale rod and the compass
 * disc, and no part of the tower's own light is bent to make a picture work.
 * The sun stays where suncalc puts it and the chambers stay as dark as their
 * openings leave them.
 */

/** A point light's intensity (candela) and distance exponent. */
export interface LampFalloff {
  intensity: number
  decay: number
}

/** What the pair has to achieve, in linear light off a surface of that albedo. */
export interface LampTargets {
  /** Closest surface the walker can be put in front of, metres. */
  nearDistance: number
  /** Farthest surface the lamp is still asked to show, metres. */
  farDistance: number
  /** Linear radiance wanted at `nearDistance` — mid-curve, not the shoulder. */
  nearTarget: number
  /** Linear radiance wanted at `farDistance` — above the floor of visibility. */
  farTarget: number
  /** Linear luminance of the stone being lit. */
  albedoLuminance: number
}

/**
 * Radiance reflected off a Lambertian surface at `distance`, head-on, under a
 * point light — three's punctual model without the cutoff window:
 * `albedo/π · intensity / distance^decay`.
 */
export function lampRadianceAt(
  distance: number,
  { intensity, decay }: LampFalloff,
  albedoLuminance: number,
): number {
  const d = Math.max(distance, 1e-4)
  return (albedoLuminance / Math.PI) * (intensity / Math.pow(d, decay))
}

/**
 * Solve for the (intensity, decay) that puts `nearTarget` at `nearDistance` and
 * `farTarget` at `farDistance`.
 *
 * Two conditions, two unknowns, so it is a solution and not a preference:
 *   decay     = ln(nearTarget / farTarget) / ln(farDistance / nearDistance)
 *   intensity = nearTarget · nearDistance^decay · π / albedo
 */
export function deriveLampFalloff(t: LampTargets): LampFalloff {
  if (!(t.farDistance > t.nearDistance) || t.nearDistance <= 0) {
    throw new Error('lamp: far must be beyond near, and near must be positive')
  }
  if (!(t.nearTarget > t.farTarget) || t.farTarget <= 0 || t.albedoLuminance <= 0) {
    throw new Error('lamp: the near target must be brighter than the far one, and both positive')
  }
  const decay = Math.log(t.nearTarget / t.farTarget) / Math.log(t.farDistance / t.nearDistance)
  const intensity = (t.nearTarget * Math.pow(t.nearDistance, decay) * Math.PI) / t.albedoLuminance
  return { intensity, decay }
}

/**
 * Linear radiance at which three's ACES curve at exposure 1 has spent its
 * usable range: grey 1.0 maps to byte 226, and everything above it shares the
 * last 29 codes. A surface over this is white with no relief left in it, which
 * is the fault this module exists to prevent.
 */
export const TONE_SHOULDER = 1.0
