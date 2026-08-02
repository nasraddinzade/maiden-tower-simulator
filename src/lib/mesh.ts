/**
 * Pure mesh-quality helpers, three.js-free so they can be unit-tested
 * (CLAUDE.md rule 6). Used in Phase 2 to verify the CSG shell is clean before a
 * collider is ever attached to it.
 */

/** Twice the area of the triangle (a, b, c) — i.e. |(b-a) × (c-a)|. */
export function triangleDoubleArea(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const cx1 = aby * acz - abz * acy
  const cy1 = abz * acx - abx * acz
  const cz1 = abx * acy - aby * acx
  return Math.hypot(cx1, cy1, cz1)
}

/**
 * Count degenerate (zero-area) triangles in a geometry, described by a flat
 * `positions` array ([x,y,z, x,y,z, …]) and an optional `index` array.
 * A triangle is degenerate when its double-area is at or below `epsilon`
 * (collinear or coincident vertices) — such triangles break watertightness
 * and confuse physics colliders.
 */
export function countDegenerateTriangles(
  positions: ArrayLike<number>,
  index?: ArrayLike<number> | null,
  epsilon = 1e-9,
): number {
  const tri = (i0: number, i1: number, i2: number) =>
    triangleDoubleArea(
      positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2],
      positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
      positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2],
    )

  let count = 0
  if (index) {
    for (let i = 0; i < index.length; i += 3) {
      if (tri(index[i], index[i + 1], index[i + 2]) <= epsilon) count++
    }
  } else {
    const verts = positions.length / 3
    for (let i = 0; i < verts; i += 3) {
      if (tri(i, i + 1, i + 2) <= epsilon) count++
    }
  }
  return count
}

/**
 * Return a new index array with all degenerate triangles dropped.
 *
 * Welding coincident vertices (mergeVertices) collapses CSG sliver triangles
 * into zero-area ones: they carry no surface, produce NaN normals and upset
 * collider generation, so they are removed rather than kept.
 */
export function filterDegenerateTriangles(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  epsilon = 1e-9,
): number[] {
  const kept: number[] = []
  for (let i = 0; i < index.length; i += 3) {
    const i0 = index[i], i1 = index[i + 1], i2 = index[i + 2]
    const area = triangleDoubleArea(
      positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2],
      positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
      positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2],
    )
    if (area > epsilon) kept.push(i0, i1, i2)
  }
  return kept
}
