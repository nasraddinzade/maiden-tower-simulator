/**
 * MERIDIANS, AND WHICH WAY ROUND THEY HAVE TO BE DRAWN.
 *
 * Almost every horizontal surface in this tower is a surface of revolution: the
 * floor slabs, the ceiling fill above each crown, the cupola soffits, the
 * terrace paving. Each is given to three.js as a meridian — a little polygon in
 * the (r, y) half-plane — and revolved. three.js-free so it can be unit-tested
 * (CLAUDE.md rule 6).
 *
 * LatheGeometry TAKES ITS WINDING FROM THE ORDER THE PROFILE IS GIVEN IN, and
 * nothing else. Traverse the meridian one way and the revolved surface's normals
 * point out of the solid; traverse it the other way and every one of them points
 * into it. Under a single-sided material — which is what all this stone uses —
 * the second case is not a shading bug, it is an invisible surface: the face is
 * back-face culled, you see straight through the stone to whatever is behind it,
 * and a raycast down onto it reports the thing underneath.
 *
 * THIS HAS NOW COST THE MODEL A FLOOR TWICE, which is why the rule is a function
 * with a test under it rather than a sentence in a component.
 *
 *   · the terrace, fixed 2026-08-16 (60ac45e). roofTerrace.ts's pavingProfile()
 *     carries the whole diagnosis in prose: "a paving slab whose top face points
 *     at the floor below it is invisible from the terrace under any single-sided
 *     material. Drawn that way the deck read as a hole: you looked down into
 *     storey 8 through stone that was there." The prose was right and it was
 *     never turned into an assertion, so it guarded nothing but the roof.
 *   · the annular floor slabs, which had the identical fault the whole time and
 *     were never looked at, because the fault is only visible on the three
 *     storeys whose floor is PIERCED. An unpierced floor is drawn as a solid
 *     cylinder by a different branch, and cylinderGeometry winds itself. So
 *     storeys 2, 5 and 8 — and only those — showed their drawn floor exactly
 *     TOWER.floorSlab below the surface the walker stands on, because what you
 *     were looking at was the ceiling fill of the storey underneath.
 *
 * THE SIGN CONVENTION, measured on the running model rather than reasoned about.
 * Two lathes in the same scene, both single-sided, at storey 2:
 *
 *   · the ceiling fill, meridian traversed counter-clockwise in (r, y)
 *     (shoelace +2.59) → top row normal ny = +0.982, visible from above;
 *   · the floor slab, meridian traversed clockwise (shoelace −1.59)
 *     → top row normal ny = −1.000, invisible from above.
 *
 * So a POSITIVE signed area is the outward-facing one, and that is what
 * facesOutward() means. It is the same shoelace every time, so it is written
 * once here and asserted against every profile the model revolves.
 *
 * ONE PROFILE IS DELIBERATELY THE OTHER WAY, and it is recorded here so nobody
 * "fixes" it: cupolaProfile() in cupola.ts is a SOFFIT. You stand under it. Its
 * own docstring has said so since it was written — "so the revolved surface
 * faces downward into the room" — and meridian.test.ts asserts the negative sign
 * for it, so the exception is stated rather than merely surviving.
 */

/** One point of a meridian, ready to be revolved about the tower's axis. */
export interface ProfilePoint {
  /** Distance from the tower axis. */
  r: number
  /** Height. Whether it is world Y or relative to some datum is the caller's. */
  y: number
}

/**
 * Twice the signed area of the meridian, by the shoelace formula, closing the
 * polygon back to its first point.
 *
 * Positive means the meridian is traversed counter-clockwise in the (r, y)
 * half-plane, which is the order LatheGeometry turns into outward-facing
 * normals. It is defined for OPEN profiles too — the cupola's is open — because
 * closing it implicitly is exactly what decides which side of an open lathe
 * surface is the front one.
 */
export function meridianSignedArea(pts: readonly ProfilePoint[]): number {
  let acc = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    acc += a.r * b.y - b.r * a.y
  }
  return acc
}

/**
 * Does revolving this meridian give normals that point OUT of the solid — so
 * that its top face is visible from above and its outer face from the room?
 *
 * True for anything you stand on or look at from outside; false for a soffit.
 */
export function facesOutward(pts: readonly ProfilePoint[]): boolean {
  return meridianSignedArea(pts) > 0
}

export interface AnnularSlabSpec {
  /** Radius of the hole in the middle. The floor stops here. */
  holeRadius: number
  /**
   * Radius the slab runs OUT to — the room face plus whatever it is bedded into
   * the wall by. See lib/bedding.ts for why it is bedded at all.
   */
  outerRadius: number
  /** World Y of the slab's TOP: the surface the walker stands on. */
  topY: number
  /** How deep the course is. The slab's underside is topY − thickness. */
  thickness: number
}

/**
 * The meridian of an annular floor slab — a floor with a hole in the middle.
 *
 * BOTTOM FIRST, then out, then up, then in: the same order pavingProfile() uses,
 * for the same reason, and now for the same reason it is a shared rule instead
 * of a habit. The four runs it produces are the underside, the outer edge buried
 * in the wall, the walking surface, and the lining of the hole.
 *
 * THE TOP RUN IS THE POINT OF THE WHOLE THING. It is at exactly `topY`, which is
 * the storey's floorY, which is the level the physics stands the walker on. Any
 * change here that moves it moves the drawn floor off the walked floor again, so
 * meridian.test.ts pins it in metres rather than trusting the shape.
 *
 * THE LAST POINT REPEATS THE FIRST, AND IT IS NOT A TYPO. LatheGeometry does not
 * close a profile: it builds exactly `points.length - 1` strips. Four points
 * would give three — underside, outer edge, walking surface — and silently omit
 * the fourth, the lining of the hole, leaving the slab open to the stairwell all
 * the way round. The repeat is what makes it a solid, and the test asserts it.
 */
export function annularSlabProfile(spec: AnnularSlabSpec): ProfilePoint[] {
  const { holeRadius, outerRadius, topY, thickness } = spec
  const bottomY = topY - thickness
  return [
    { r: holeRadius, y: bottomY },
    { r: outerRadius, y: bottomY },
    { r: outerRadius, y: topY },
    { r: holeRadius, y: topY },
    { r: holeRadius, y: bottomY },
  ]
}
