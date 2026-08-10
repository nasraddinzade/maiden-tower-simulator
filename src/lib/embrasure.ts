/**
 * The stepped embrasures — where a window's sill is too high to see out of, the
 * tower gives you steps up to it. Pure numbers, no three.js (CLAUDE.md rule 6).
 *
 * The owner: "к некоторым окнам в настоящей башне ведут ступени." SOME, and
 * which ones is not a matter of taste — it follows from where the openings are.
 * Work it out from the INNER mouth of the reveal, not the outer sill: the slits
 * splay from 0.40 m outside to 1.50 m inside and from 1.90 m tall to 2.40 m, so
 * the surface you actually lean on is 0.25 m lower than the outer sill and it is
 * the one that decides whether you can see through.
  *
 * ————————————————————————————————————————————————————————————————————————
 * NOTHING CALLS THIS TODAY, AND IT IS NOT DEAD BY ACCIDENT.
 *
 * [OWNER], 2026-08-10: "НА ЯРУСАХ ОКНА ТОЛЬКО В НАЧАЛЕ И В КОНЦЕ ПРОХОДОВ
 * ЛЕСТНИЦ. НА САМИХ ЯРУСАХ НИКАКИХ ОКОН НЕТ." A stepped recess in a chamber wall
 * has to climb to an opening in a chamber wall; there is one left, the modern
 * arched window, and its inner sill is already at hand height. planEmbrasure()
 * therefore returns null for everything the model contains — checked in
 * embrasure.test.ts rather than assumed — and App.tsx no longer draws the layer.
 * The renderer component that drew it (WindowEmbrasures.tsx) is deleted: it would
 * have to be rebuilt out of arc sectors rather than radial blocks for the carrier
 * described below, so keeping it dormant would have preserved nothing but a
 * shape that no longer fits.
 *
 * THIS MODULE STAYS, because the testimony it served has not gone away. [OWNER]
 * also said steps lead up to some of the tower's windows, and the surviving
 * candidate is a short branch off a stair LANDING — which [VIDEO] shows behind a
 * barred gate on the roof climb, at 429–449 s, with two more like it counted
 * elsewhere. No source gives that branch a length, a bearing or a gradient, so
 * PASSAGE_OPENING.branchAtEnds ships empty (CLAUDE.md rule 1) and the maths waits
 * here with its tests. Deleting it would erase the only trace of the statement.
 */

export interface EmbrasurePlan {
  /** Whole risers from the chamber floor up to the standing platform. */
  stepCount: number
  /** Height of each riser once the count is rounded. */
  riser: number
  /** World Y of the platform you stand on. */
  platformY: number
  /** How far the flight and its platform reach into the wall. */
  depth: number
}

/**
 * Whether an opening needs steps at all, and how many.
 *
 * The rule is the only one that is not arbitrary: the platform brings the
 * viewer's EYE to the inner sill. Below that you are looking at masonry; above
 * it the extra height buys nothing, because the splay opens downward and outward
 * from there. Round to whole risers, because steps are cut stone.
 *
 * Returns null when the sill is already at or below eye height — the majority of
 * the openings, which is what "some windows" means.
 */
export function planEmbrasure(
  innerSillAboveFloor: number,
  floorY: number,
  eyeHeight: number,
  riserTarget: number,
  going: number,
  platformDepth: number,
): EmbrasurePlan | null {
  const climb = innerSillAboveFloor - eyeHeight
  if (climb <= riserTarget / 2) return null
  const stepCount = Math.max(1, Math.round(climb / riserTarget))
  const riser = climb / stepCount
  return {
    stepCount,
    riser,
    platformY: floorY + climb,
    depth: stepCount * going + platformDepth,
  }
}

/**
 * A small, repeatable offset for one tread, from its index alone.
 *
 * The steps in the photographs are not machined: the nosings are wavy, worn
 * hollow in the middle, and no two share an angle — visible in the embrasure and
 * on both the straight and the curved masonry flights, three independent frames
 * with the same character. Drawn as identical boxes with sharp arrises they read
 * as new concrete.
 *
 * Deterministic, because the config has to stay the single source of truth: the
 * same index always gives the same wear, so nothing here is random between
 * reloads or between the drawn stone and anything measured off it.
 */
export function treadWear(index: number, amplitude: number): { nose: number; tilt: number } {
  const a = Math.sin(index * 12.9898) * 43758.5453
  const b = Math.sin(index * 78.233) * 12345.6789
  return {
    nose: (a - Math.floor(a) - 0.5) * 2 * amplitude,
    tilt: (b - Math.floor(b) - 0.5) * 2 * amplitude * 0.5,
  }
}

/** One tread of an embrasure: a straight block, not an annular sector. */
export interface EmbrasureTread {
  /** Radius of the tread's near edge — the flight climbs OUTWARD into the wall. */
  innerRadius: number
  outerRadius: number
  /** World Y of the surface you stand on. */
  treadY: number
}

/**
 * The treads, running from the room face outward into the wall.
 *
 * Straight, and the last one is the platform. A stair in a wall's thickness that
 * turns with the drum is one thing; an embrasure is a metre and a half long and
 * points straight at its window, so its treads are parallel blocks square to the
 * opening. Making them annular sectors here would be following the machinery
 * rather than the building.
 */
export function embrasureTreads(
  plan: EmbrasurePlan,
  faceRadius: number,
  going: number,
  platformDepth: number,
): EmbrasureTread[] {
  const out: EmbrasureTread[] = []
  for (let i = 0; i < plan.stepCount; i += 1) {
    out.push({
      innerRadius: faceRadius + i * going,
      outerRadius: faceRadius + (i + 1) * going,
      treadY: plan.platformY - (plan.stepCount - 1 - i) * plan.riser,
    })
  }
  // the platform: same height as the top tread, carried on to the reveal
  const last = out[out.length - 1]
  out.push({
    innerRadius: last.outerRadius,
    outerRadius: last.outerRadius + platformDepth,
    treadY: plan.platformY,
  })
  return out
}

/** What an embrasure occupies, for testing it against its neighbours. */
export interface EmbrasureExtent {
  id: string
  azimuthDeg: number
  halfWidthDeg: number
  bottomY: number
  topY: number
}

/** What an opening's reveal occupies, in the same terms. */
export interface RevealExtent {
  id: string
  azimuthDeg: number
  halfWidthDeg: number
  bottomY: number
  topY: number
}

/**
 * Whether a recess would cut across another opening's reveal.
 *
 * IT CAN, and it did. The upper column's four slits are 3–4° apart, and a recess
 * a metre and a half wide subtends about 14° at the radius it sits at — so a
 * recess belonging to one slit runs straight through the next slit's reveal.
 * Measured on the built scene: upper-2's step blocks stood at radius 6.63 and
 * 7.08 on the line of sight through upper-1's opening, inside its reveal, where
 * that opening should show nothing but the splay and daylight.
 *
 * A NOTE ON WHAT WAS NOT TRUE. Chasing this I also reported the reveal itself as
 * blind — a ray fired inward stopping 1.3 m into the masonry. That was a bad
 * measurement, not a fault: the ray crossed the whole tower and the hit was the
 * far wall, 178° away. Fired from inside the chamber outward, every one of the
 * nine openings leaves the tower cleanly. The intruding stone is real; the blind
 * reveal never was.
 *
 * The cause is upstream of anything here: those 3–4° come from photographs the
 * file itself gives ±20° of systematic error, and four openings inside 11° of
 * arc is close enough that their REVEALS alone very nearly meet inside the wall.
 * Rather than guess at new azimuths, an embrasure that would foul a neighbour is
 * not built, and which one was dropped is recorded — the same way the stair and
 * the window column were resolved when they wanted the same stone.
 */
export function embrasureFoulsReveal(
  e: EmbrasureExtent,
  reveals: RevealExtent[],
  /**
   * How much of a reveal a recess may cross before it counts as fouling it.
   *
   * Not zero, and the reason is the lower column: its four slits are stacked at
   * ONE azimuth 2.95 m apart, with reveals 2.4 m tall, so a recess standing on a
   * floor inevitably clips the top of the reveal below it — by 0.40 m, 17% of
   * its height, at the very bottom of the recess where the storey's own slab is
   * anyway. That is a corner clipped, not an opening blocked. What upper-2 did
   * to upper-1 was 2.06 m, 86%, straight across the middle.
   */
  tolerance = 0.25,
): string | null {
  for (const r of reveals) {
    if (r.id === e.id) continue
    const dAz = Math.abs(((r.azimuthDeg - e.azimuthDeg + 540) % 360) - 180)
    if (dAz > e.halfWidthDeg + r.halfWidthDeg) continue
    const overlap = Math.min(e.topY, r.topY) - Math.max(e.bottomY, r.bottomY)
    if (overlap <= 0) continue
    if (overlap / Math.max(0.1, r.topY - r.bottomY) > tolerance) return r.id
  }
  return null
}
