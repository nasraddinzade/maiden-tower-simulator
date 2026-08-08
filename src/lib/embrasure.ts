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
