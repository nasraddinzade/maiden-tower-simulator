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
 *
 * [2026-08-20] AND THE SOLVE WAS AIMED AT THE WRONG QUANTITY, ON THE WRONG
 * STONE. Everything above is still true and the passage is still the place it is
 * decided. But the targets were read as LUMINANCE, which is not what clips — the
 * curve clips each channel on its own — and they were read against
 * LIMESTONE_INTERIOR, which no wall in the building wears: the drum is drawn
 * with the EXTERIOR palette on both of its faces, so every cheek and vault of
 * every stair passage is 2.63 times brighter in red than the stone this solve
 * was aimed at. Walking it, the head landing of the climb 2→3 came out R 226 —
 * the shoulder byte — G 191, B 132, with a whole-frame σ of 9.6: one flat cream
 * field with the bed joint reduced to a hairline, at the one distance this
 * module exists to get right.
 *
 * The targets now name their stone, from lib/exposure.ts, and the pair that
 * comes out is 1.62 cd at decay 0.655. IT IS LESS LIGHT, not more, at every
 * distance inside the building: 0.31 of the old lamp at half a flight's width,
 * 0.43 at a metre, 0.58 at two, 0.81 at the widest chamber's far wall. Only past
 * eight metres — further than any room in the tower is wide — does it edge above,
 * and there both lamps are down at the floor of visibility. The shape changed;
 * the amount of light went down.
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
  /**
   * Linear response of the stone at `nearDistance`, in THE CHANNEL THAT CLIPS —
   * see lib/exposure.ts → peakChannelResponse.
   *
   * Two things were wrong with the single `albedoLuminance` this replaces, and
   * both of them showed.
   *
   * IT WAS A LUMINANCE. The tone curve clips each channel separately; limestone
   * runs well above its own luminance in red. A target meant for the middle of
   * the curve therefore landed higher than the arithmetic claimed.
   *
   * AND IT WAS THE WRONG STONE. It was LIMESTONE_INTERIOR, and no wall in the
   * building wears that: `shellMat` — the exterior palette — is what App.tsx
   * hands the drum, and the drum is both faces of the wall, every cheek and
   * vault of every stair passage and every reveal. LIMESTONE_INTERIOR reaches
   * the floors, the cupolas and the treads only. In red the two are 2.63 apart,
   * so the surface the lamp was solved for was not the surface it was lighting.
   *
   * Together: measured on the head landing of the climb 2→3, the wall the walker
   * stands against rendered R 226 — the shoulder byte — with a whole-frame σ of
   * 9.6, while this arithmetic said 0.35 and mid-curve.
   */
  nearResponse: number
  /**
   * Linear response of the stone at `farDistance`, same units.
   *
   * A SECOND STONE, because the interior has two and they are 2.63 apart. The
   * near condition is about the brightest surface at the closest range — the
   * passage cheek, which is what clips. The far condition is about the DARKEST
   * surface at the longest range — the floor across the widest chamber, which is
   * what disappears. Solving both is what stops a fix for the first from burying
   * the second: aimed at the bright stone alone, the far floor lands on byte 13.
   *
   * Pass the same value twice and this reduces exactly to the one-stone solve.
   */
  farResponse: number
}

/**
 * Radiance reflected off a Lambertian surface at `distance`, head-on, under a
 * point light — three's punctual model without the cutoff window:
 * `albedo/π · intensity / distance^decay`.
 */
export function lampRadianceAt(
  distance: number,
  { intensity, decay }: LampFalloff,
  albedoResponse: number,
): number {
  const d = Math.max(distance, 1e-4)
  return (albedoResponse / Math.PI) * (intensity / Math.pow(d, decay))
}

/**
 * Solve for the (intensity, decay) that puts `nearTarget` on the near stone at
 * `nearDistance` and `farTarget` on the far stone at `farDistance`.
 *
 * Two conditions, two unknowns, so it is a solution and not a preference. Each
 * condition divides its target by its own stone's response, which is what turns
 * "radiance wanted" into "irradiance wanted" before the two are compared:
 *   decay     = ln( (nearTarget/nearResponse) / (farTarget/farResponse) )
 *               / ln(farDistance / nearDistance)
 *   intensity = nearTarget · nearDistance^decay · π / nearResponse
 *
 * With one stone the responses cancel and this is the old two-line solve.
 */
export function deriveLampFalloff(t: LampTargets): LampFalloff {
  if (!(t.farDistance > t.nearDistance) || t.nearDistance <= 0) {
    throw new Error('lamp: far must be beyond near, and near must be positive')
  }
  if (!(t.nearTarget > t.farTarget) || t.farTarget <= 0) {
    throw new Error('lamp: the near target must be brighter than the far one, and both positive')
  }
  if (!(t.nearResponse > 0) || !(t.farResponse > 0)) {
    throw new Error('lamp: both stones must reflect something')
  }
  const nearIrradiance = t.nearTarget / t.nearResponse
  const farIrradiance = t.farTarget / t.farResponse
  if (!(nearIrradiance > farIrradiance)) {
    throw new Error('lamp: the near condition must ask for more light than the far one')
  }
  const decay = Math.log(nearIrradiance / farIrradiance) / Math.log(t.farDistance / t.nearDistance)
  const intensity = (t.nearTarget * Math.pow(t.nearDistance, decay) * Math.PI) / t.nearResponse
  return { intensity, decay }
}

/**
 * The scene's white point now lives in lib/exposure.ts, because the sun has to
 * be sized against the same one. Re-exported so this module's own callers do not
 * have to know that, and so there is still exactly one of it.
 */
export { TONE_SHOULDER } from './exposure'
