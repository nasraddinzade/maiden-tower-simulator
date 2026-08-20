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
 * elsewhere. That branch is BUILT now, by planSillBranch() at the foot of this
 * file; PASSAGE_OPENING.branchAtEnds no longer ships empty. planEmbrasure() and
 * its chamber recess stay dormant and tested for the reason above — the layer
 * has no receivers, not the arithmetic has no worth.
 *
 * ————————————————————————————————————————————————————————————————————————
 * [2026-08-14] THE WAITING IS NO LONGER HYPOTHETICAL, and that is why the depth
 * rule below changed.
 *
 * The owner's own walkthrough shows the branch plainly and repeatedly, at the END
 * of a passage rather than in a chamber wall: up/218 — two shallow stone steps
 * climbing inside a deep embrasure to the sill, a barred gate across its mouth;
 * down/124 — three step courses climbing the same way to a glazed slit; up/168 —
 * the sill block standing about two courses above the tread beneath it, with the
 * reveal narrowing from a recess a person can stand in to a slot a hand wide;
 * up/143 — the fork itself, the main flight bearing away and a short run
 * continuing straight on. So the arithmetic here has a real carrier, and its
 * output is a real cut in a real wall rather than a number nobody will spend.
 *
 * A constraint recorded against it in the config had therefore stopped being a
 * curiosity: these dimensions give a recess 4.20 m deep whatever height it sits
 * at, and the wall thins from 4.855 m at storey 1 to 3.820 m at storey 8, so the
 * recess left the drum through its own outer face from storey 6 up. planEmbrasure
 * now takes the stone it has to fit inside and CANNOT return a depth that leaves
 * it. See the note on the function.
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
  /**
   * The going the treads are ACTUALLY cut to, which is the nominal one until the
   * wall is too thin for it. Carried on the plan rather than left with the caller
   * so the drawn stone and `depth` cannot come from two different numbers — this
   * model has been bitten before by a pair of holes placed from separate
   * arithmetic, and a flight whose treads out-run its own stated depth is that
   * fault with the outer face of the tower as the witness.
   */
  going: number
  /** Carried for the same reason. The platform never gives; see planEmbrasure(). */
  platformDepth: number
  /** m of masonry left between the back of the recess and the outer face. */
  coverBeyond: number
  /** True where the wall, not the flight, is what set the depth. */
  depthLimitedByWall: boolean
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
 *
 * ———————————— THE DEPTH IS THE WALL'S TO GIVE, NOT THE FLIGHT'S ————————————
 *
 * It used to be `stepCount * going + platformDepth` and nothing else, which is a
 * statement about the STAIR made in ignorance of the BUILDING. A 2.95 m sill
 * needs seven risers at the 0.20 m target, and seven goings of 0.50 m plus a
 * 0.70 m platform is 4.20 m — the same 4.20 m at every height, while the wall
 * this has to be cut into runs from 4.855 m at storey 1 down to 3.820 m at
 * storey 8. From storey 6 up the recess came out through the drum's own face: by
 * 0.09 m at storey 6, 0.24 m at storey 7, 0.38 m at storey 8. It was recorded as
 * a constraint and left, on the ground that the layer had no receivers. It has
 * them now (see the head of this file), so it is fixed here instead of being
 * described.
 *
 * `stoneBeyondFace(y)` is how many metres of masonry stand between the face this
 * recess is cut in and the OUTSIDE of the tower, at height y. A function of the
 * platform's own height, and injected rather than imported, for two reasons.
 * planEmbrasure is the thing that works out where the platform ends up, so a
 * caller computing the thickness itself would be deriving the same height twice;
 * and the two carriers the owner's testimony allows do not measure the same
 * stone. A recess off a chamber floor has the whole wall, wallThicknessAt(y). A
 * branch off a stair landing starts at the passage's outer cheek and has only
 * what is outboard of THAT. The function keeps this file arithmetic (rule 6) and
 * lets either one answer honestly.
 *
 * `outerLeaf` is the stone that must survive between the back of the recess and
 * the outer face. It is not slack: the frames show a recess a person stands in
 * narrowing to a slot a hand wide (up/168, down/124), so a full-width recess run
 * to the face would put a 0.9 m hole in a drum that has a 0.4 m slit. What
 * nobody has measured is HOW MUCH stone — see WINDOW_EMBRASURE.outerLeaf, which
 * ships as one course and says so.
 *
 * WHAT GIVES WHEN THE WALL IS TOO THIN, and the order is not a preference:
 *
 *   the riser and the step count DO NOT. They are the climb, and the climb is
 *   the sill; buying depth from them would move the platform away from the thing
 *   it exists to bring your eye to.
 *   the platform DOES NOT. It is the standing place, "deep enough for both
 *   feet"; a recess whose platform has been shaved is a ledge, not a place.
 *   the GOING gives. The treads get shorter, the flight gets steeper in plan,
 *   the riser is untouched, and `depthLimitedByWall` says so out loud rather
 *   than letting a quietly narrower step pass for the mason's own.
 *
 * And where even the platform will not fit outboard of the leaf there is no
 * recess at all — null, not a recess with a negative tread. That is the wall
 * saying the carrier is somewhere else, and it is worth hearing.
 */
export function planEmbrasure(
  innerSillAboveFloor: number,
  floorY: number,
  eyeHeight: number,
  riserTarget: number,
  going: number,
  platformDepth: number,
  /** m of masonry between the face the recess is cut in and the outer face, at y. */
  stoneBeyondFace: (y: number) => number,
  /** m of that stone the recess may not take. */
  outerLeaf: number,
): EmbrasurePlan | null {
  const climb = innerSillAboveFloor - eyeHeight
  if (climb <= riserTarget / 2) return null
  const stepCount = Math.max(1, Math.round(climb / riserTarget))
  const riser = climb / stepCount
  const platformY = floorY + climb

  const stone = stoneBeyondFace(platformY)
  const fit = fitDepthToStone(stepCount * going + platformDepth, stone, outerLeaf, platformDepth)
  if (!fit) return null

  return {
    stepCount,
    riser,
    platformY,
    depth: fit.depth,
    going: (fit.depth - platformDepth) / stepCount,
    platformDepth,
    coverBeyond: fit.coverBeyond,
    depthLimitedByWall: fit.limited,
  }
}

/**
 * How deep a recess may actually be cut, given the stone standing outboard of
 * the face it is cut in.
 *
 * Lifted out of planEmbrasure() unchanged so the branch below can be fitted by
 * the SAME arithmetic rather than by a second copy of it. That is the whole
 * point: b36496b measured a recess leaving the drum through its own outer face —
 * by 0.09 m at storey 6 and 0.38 m at storey 8, as the wall thins from 4.855 m to
 * 3.820 m — and a second carrier fitted by its own private clamp is how a
 * measured fault comes back wearing different clothes.
 *
 * `floor` is the part of the depth that may not give. For a chamber recess it is
 * the standing platform; for a branch there is no platform to protect (see
 * planSillBranch) and it is zero. Below it there is no recess at all — null, not
 * a recess with a negative tread.
 */
function fitDepthToStone(
  wanted: number,
  stoneBeyondFace: number,
  outerLeaf: number,
  floor: number,
): { depth: number; coverBeyond: number; limited: boolean } | null {
  const room = stoneBeyondFace - outerLeaf
  if (room <= floor) return null
  const depth = Math.min(wanted, room)
  return { depth, coverBeyond: stoneBeyondFace - depth, limited: depth < wanted - 1e-12 }
}

// ——————————————— the branch at the end of a stair passage ———————————————

/**
 * The short flight from a landing up to the floor of the slit's embrasure.
 *
 * THE OTHER CARRIER of "к некоторым окнам в настоящей башне ведут ступени"
 * [OWNER], and since 2026-08-10 the only one: with no openings in the chamber
 * walls, a stepped recess in a chamber wall has nothing to climb to. This one is
 * at the END of a passage, and the owner's own walkthrough shows it repeatedly —
 * up/218 (two shallow steps inside the embrasure to the sill, a barred gate
 * across its mouth), down/124 (three courses of steps up to a glazed slit),
 * up/168 (the sill block about two courses above the tread beneath it), up/143
 * (the fork itself: the main flight bearing away, a short run continuing on).
 */
export interface SillBranchPlan {
  /** Whole risers between the landing and the embrasure floor. OBSERVED, not derived. */
  stepCount: number
  /** Height of one riser. Derived — see planSillBranch(). */
  riser: number
  /** World Y of the landing the flight starts from. */
  landingY: number
  /** World Y of the top tread, which IS the floor of the embrasure. */
  platformY: number
  /** How far the flight runs outward from the passage's cheek into the wall. */
  depth: number
  /** The going the treads are ACTUALLY cut to; the nominal one until the wall is too thin. */
  going: number
  /** m of masonry left between the back of the flight and the outer face. */
  coverBeyond: number
  /** True where the wall, not the flight, is what set the depth. */
  depthLimitedByWall: boolean
}

/**
 * THE RISER IS THE CLIMB DIVIDED BY THE COUNT, and that is the whole argument
 * for building this at all.
 *
 * An earlier pass declined the branch because "counting risers means assuming a
 * riser" — a step count only becomes a height once you say how tall a step is,
 * and no source in this project gives that. The objection was right about the
 * arithmetic and wrong about which way it runs. What the frames give is the
 * COUNT: two at up/218, three at down/124, about two courses at up/168. What
 * nobody has is the riser HEIGHT. But the CLIMB is not an unknown of its own —
 * it is PASSAGE_OPENING.sillAboveLanding, already carried as a [PLACEHOLDER],
 * already shipped, already the thing the shell is cut with. So
 *
 *     riser = climb / stepCount
 *
 * introduces no number at all. It spends a placeholder that is already being
 * spent, and when the owner finally answers with metres the treads move with the
 * sill instead of having to be corrected separately. windows.json →
 * sillHeightQuestion.ask already asks for exactly this pair — «СКОЛЬКО их от
 * площадки … до подоконника?» and the height at the window — and says in as many
 * words that the riser will be got from his own count.
 *
 * `embrasureFloorY` IS THE CLIMB'S TOP AND IT IS NOT sillAboveLanding VERBATIM.
 * It is the floor of the reveal AS FITTED — centreY − innerHeight/2 — which is
 * the sill after fitReveal() has clamped the opening under the passage vault.
 * The two agree to 0.05 m at the shipped numbers and would part company at
 * others, and it is the fitted one that matters: the stair a walker sees and the
 * hole the shell is cut with have to come from one arithmetic. This model has
 * been bitten twice by a pair of features placed from two.
 *
 * NO PLATFORM, and that is a subtraction rather than an omission. planEmbrasure
 * protects a standing platform because a recess in a chamber wall has to make
 * one; here the top tread is level with the embrasure floor, and the embrasure
 * floor runs on to the slit by itself — that IS the standing place, so buying it
 * a second time would put a 0.70 m [ESTIMATE] into a place that already has the
 * stone. One fewer invented number in the branch than in the recess it replaces.
 *
 * Returns null where the landing is already at the embrasure floor (nothing to
 * climb) or where the wall outboard of the cheek cannot take a flight at all.
 */
export function planSillBranch(
  landingY: number,
  embrasureFloorY: number,
  /** OBSERVED in the footage. Never derived from a riser — see above. */
  stepCount: number,
  going: number,
  /** m of masonry outboard of the passage's cheek, i.e. what the flight may eat into. */
  stoneBeyondFace: number,
  /** m of that stone that must survive under the slit. */
  outerLeaf: number,
): SillBranchPlan | null {
  const climb = embrasureFloorY - landingY
  if (!(climb > 0)) return null
  const n = Math.max(1, Math.round(stepCount))
  const fit = fitDepthToStone(n * going, stoneBeyondFace, outerLeaf, 0)
  if (!fit) return null
  return {
    stepCount: n,
    riser: climb / n,
    landingY,
    platformY: embrasureFloorY,
    depth: fit.depth,
    going: fit.depth / n,
    coverBeyond: fit.coverBeyond,
    depthLimitedByWall: fit.limited,
  }
}

/**
 * The treads of a branch, running outward from the passage's cheek.
 *
 * Straight blocks square to the opening, for embrasureTreads()' reason: the
 * flight is a metre or so long and points at its slit, so annular sectors would
 * be following the machinery rather than the building. The LAST tread's surface
 * is exactly `plan.platformY` — the embrasure floor — so the flight lands on the
 * stone the shell already carries and no step is left over.
 */
export function sillBranchTreads(plan: SillBranchPlan, faceRadius: number): EmbrasureTread[] {
  const out: EmbrasureTread[] = []
  for (let i = 0; i < plan.stepCount; i += 1) {
    out.push({
      innerRadius: faceRadius + i * plan.going,
      outerRadius: faceRadius + (i + 1) * plan.going,
      treadY: plan.platformY - (plan.stepCount - 1 - i) * plan.riser,
    })
  }
  return out
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
 *
 * THE GOING AND THE PLATFORM COME OFF THE PLAN NOW, and they used to be handed in
 * beside it. That was the other half of the same fault: clamping planEmbrasure's
 * `depth` to the wall and still drawing the treads from WINDOW_EMBRASURE.going
 * would have left the stated depth honest and the built stone out through the
 * face, which is the worse of the two failures because the number would have
 * looked right. There is one going, it is the fitted one, and it travels with
 * the plan that fitted it.
 */
export function embrasureTreads(plan: EmbrasurePlan, faceRadius: number): EmbrasureTread[] {
  const out: EmbrasureTread[] = []
  for (let i = 0; i < plan.stepCount; i += 1) {
    out.push({
      innerRadius: faceRadius + i * plan.going,
      outerRadius: faceRadius + (i + 1) * plan.going,
      treadY: plan.platformY - (plan.stepCount - 1 - i) * plan.riser,
    })
  }
  // the platform: same height as the top tread, carried on to the reveal
  const last = out[out.length - 1]
  out.push({
    innerRadius: last.outerRadius,
    outerRadius: last.outerRadius + plan.platformDepth,
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
