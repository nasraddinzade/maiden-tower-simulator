/**
 * WHEN THE SHADOW MAP IS WORTH REDRAWING. Pure: no three.js, no React.
 *
 * three redraws the sun's shadow map on every single frame, because
 * `WebGLShadowMap.autoUpdate` defaults to true and nothing had ever said
 * otherwise. Measured on 2026-08-24 in the browser at 375×812, by differencing
 * one `gl.render` with autoUpdate on against one with it off: the pass is 33
 * draw calls and 55 983 triangles, EVERY frame — 38% of the calls and 49% of the
 * triangles in the opening view. The 33 is not a coincidence: it is exactly the
 * count of visible `castShadow` meshes in the scene, one draw each.
 *
 * The building does not move. The sun moves once every twenty seconds, and only
 * while the live clock is running; the rest of the time it moves when a hand
 * drags the scrubber. So the map is redrawn about a thousand times for every
 * time its content changes, and docs/optimization-addendum.md said so in
 * Phase 8 before any of this was written: "НЕ обновляй shadow map каждый кадр…
 * Это буквально бесплатные 5-10 мс кадра."
 *
 * TWO THINGS CAN MAKE THE MAP WRONG and this module decides both.
 *
 * THE SUN. The map is a depth image taken along the light's direction, so it is
 * stale when that direction has turned. Not by any amount — by enough to move a
 * shadow edge across a texel, because a movement smaller than that produces the
 * identical image. The gate is therefore an ANGLE, and the angle is derived, not
 * chosen: one texel of ground divided by the deepest a caster can stand above
 * its receiver inside the map. It comes out at 0.0066° on the desktop map and
 * 0.0131° on the mobile one. Against the sun's 15° an hour that is 1.6 s and
 * 3.1 s of real movement, so in practice this gate never suppresses a tick of
 * the clock or a drag of the scrubber — it suppresses the fifty-nine frames in
 * sixty where the sun did not move at all, which is the whole of the cost.
 *
 * THE CASTERS. Everything else that can change the image: walking in (the
 * colliders and the modern stair arrive, the survey grid goes), a storey culled,
 * the cutaway, the shell switched off, x-ray walls, a hypothesis layer. Rather
 * than enumerate those switches — a list that would be wrong the first time
 * somebody added a mesh — the signature below is folded over the scene's own
 * visible shadow casters, which is the very set three is about to draw. If the
 * set changes in any way, by one object or by one geometry, the figure changes
 * and the map is redrawn.
 *
 * WHAT IS DELIBERATELY NOT IN THE GATE: the camera. This scene's shadow camera
 * is orthographic, centred on the origin, and sized from the tower's own radius
 * — it does not follow the viewer. So walking, orbiting and looking around
 * cannot invalidate the map, and the measurement bears that out: the pass is the
 * same 33 calls and 55 983 triangles at all three orbit viewpoints measured,
 * while the main pass moves under it.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** m — half-width of the shadow camera's square, from the tower's own radius. */
export function shadowExtentMetres(outerRadius: number, radii: number): number {
  return outerRadius * radii
}

/** m — ground covered by one texel of the map. The square is 2 × the extent. */
export function shadowTexelMetres(extentMetres: number, mapSize: number): number {
  return (2 * extentMetres) / mapSize
}

/**
 * rad — the smallest turn of the light that can move a shadow edge by a texel.
 *
 * A caster standing `reach` above its receiver, along the light ray, throws its
 * edge `reach · θ` sideways when the light turns by a small θ. Setting that to
 * one texel and solving gives this. `reach` should be the deepest such distance
 * the map can contain, which is the shadow camera's far plane — an overstatement
 * of the real geometry, and the safe direction: it redraws slightly too often
 * rather than leaving an edge a texel out of place.
 */
export function redrawAngleRad(texelMetres: number, reachMetres: number): number {
  return texelMetres / reachMetres
}

/**
 * rad — angle between two directions. They need not be unit vectors.
 *
 * atan2 of the cross product against the dot, NOT acos of the dot. At the angles
 * this gate decides on — around 1e-4 rad — the cosine is flat to within a few
 * parts in 1e9, so `acos` throws away half the mantissa before it starts and
 * returns a figure wrong in the third digit. The cross product stays linear in
 * the angle all the way down. There is a test for exactly this.
 */
export function angleBetween(a: Vec3, b: Vec3): number {
  const cx = a.y * b.z - a.z * b.y
  const cy = a.z * b.x - a.x * b.z
  const cz = a.x * b.y - a.y * b.x
  const cross = Math.sqrt(cx * cx + cy * cy + cz * cz)
  const dot = a.x * b.x + a.y * b.y + a.z * b.z
  return Math.atan2(cross, dot)
}

/** What the map on the GPU was last drawn for. */
export interface ShadowDrawState {
  /** Unit vector towards the sun — the direction the depth image was taken along. */
  direction: Vec3
  /** Signature of the visible shadow casters at that moment. See casterSignature. */
  casters: number
}

/**
 * Whether the map on the GPU still shows what the scene would show.
 *
 * `prev` is null before anything has been drawn, and the answer there is yes:
 * an empty depth map reads as "nothing occludes anything", which is a building
 * with no shadows at all rather than a building with wrong ones.
 */
export function shadowNeedsRedraw(
  prev: ShadowDrawState | null,
  next: ShadowDrawState,
  minAngleRad: number,
): boolean {
  if (prev === null) return true
  if (prev.casters !== next.casters) return true
  return angleBetween(prev.direction, next.direction) >= minAngleRad
}

// ————————————————————————— the caster signature —————————————————————————

/**
 * FNV-1a's offset basis. The fold below is FNV-1a over the casters' identity
 * rather than over bytes; what matters is that it is order-sensitive, cheap
 * enough to run inside the frame loop, and stays a 32-bit unsigned integer so
 * the comparison in shadowNeedsRedraw is a machine word and not a string.
 */
export const CASTER_SEED = 2166136261

function mix(hash: number, value: number): number {
  let h = (hash ^ value) >>> 0
  // FNV prime, 16777619, by shifts — Math.imul keeps the low 32 bits exact.
  h = Math.imul(h, 16777619) >>> 0
  return h
}

/**
 * Fold one caster into a running signature.
 *
 * Both halves are needed. The object id catches a mesh appearing, leaving or
 * being reordered; the geometry id catches a mesh that stayed put while what it
 * draws was rebuilt underneath it, which is what every leva slider in this
 * project does — the shell is re-cut and handed to the same mesh.
 *
 * Exported so the traversal can fold in place and never build an array: it runs
 * once a frame, and a frame that allocates an array of every caster to decide
 * not to draw them is not much of a saving.
 */
export function foldCaster(hash: number, objectId: number, geometryId: number): number {
  return mix(mix(hash, objectId), geometryId)
}

/** The same fold over a list. Used by the tests; the scene traversal folds in place. */
export function casterSignature(
  casters: readonly { id: number; geometryId: number }[],
): number {
  let h = CASTER_SEED
  for (const c of casters) h = foldCaster(h, c.id, c.geometryId)
  return h
}
