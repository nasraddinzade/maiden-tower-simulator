/**
 * The tower's water-collection system (Phase 9). Pure geometry, testable.
 *
 * [ref] documents this unusually well — pipe bore, wall thickness and even the
 * segment length are given — and it is almost never shown in reconstructions,
 * which is exactly why the spec asks for it as its own visualisation layer.
 */

export interface ChannelRing {
  /** 0-based storey the channel sits on. */
  floorIndex: number
  /** World Y of the channel's invert. */
  y: number
  /** Radius from the tower axis to the channel's centreline. */
  radius: number
  /** Number of ceramic segments needed to close the ring. */
  segmentCount: number
}

export interface DownpipeRun {
  /** World Y where the pipe starts (the highest niche it drains). */
  topY: number
  /** World Y where it discharges into the well. */
  bottomY: number
  azimuthDeg: number
  radius: number
  diameter: number
}

/** Segments of the given length needed to close a ring of this radius. */
export function segmentsForRing(radius: number, segmentLength: number): number {
  if (radius <= 0 || segmentLength <= 0) return 0
  return Math.max(1, Math.round((2 * Math.PI * radius) / segmentLength))
}

/** Outer diameter of a pipe, given its bore and wall thickness. */
export function pipeOuterDiameter(bore: number, wallThickness: number): number {
  return bore + 2 * wallThickness
}

/**
 * Collecting channels, one per storey across the documented range.
 * They hug the inner wall face, which widens with height, so each ring is
 * slightly larger than the one below it.
 */
export function channelRings(
  floors: Array<{ index: number; floorY: number; innerRadiusAtLevel: number }>,
  range: readonly [number, number],
  segmentLength: number,
  clearance = 0.12,
): ChannelRing[] {
  const [from, to] = range
  return floors
    .filter((f) => f.index >= from && f.index <= to)
    .map((f) => {
      const radius = Math.max(0.2, f.innerRadiusAtLevel - clearance)
      return {
        floorIndex: f.index,
        y: f.floorY + 0.05,
        radius,
        segmentCount: segmentsForRing(radius, segmentLength),
      }
    })
}

/**
 * One storey's length of the chase the downpipe stands in.
 *
 * Structurally a towerShell.WallChase, and deliberately not typed as one: this
 * module is three-js-free (CLAUDE.md rule 6) and WallChase lives in the module
 * that builds cutting geometry. App.tsx passes these straight in.
 */
export interface DownpipeChase {
  azimuthDeg: number
  /** Width across the room-side face, metres. */
  width: number
  bottomY: number
  topY: number
  /** How far it bites into the masonry. */
  depth: number
  /** Which storey this length belongs to, 0-based — for reporting, not geometry. */
  floorIndex: number
}

/**
 * WHERE THE DOWNPIPE'S CHASE ACTUALLY IS, extracted so that exactly one place
 * knows.
 *
 * It was built inline in App.tsx and re-derived, azimuth-only and with no height
 * at all, in wellClearance.test.ts. That cost a false alarm on 2026-08-13: when
 * the stair turned a quarter of the drum, the reveal at foot-8-9 came within
 * 0.2° of the chase's bearing and the test failed — on a pair standing 2 m apart
 * vertically, the chase stopping at the storey-7 springing and the reveal
 * beginning at the storey-8 landing. A guard that cannot see the second
 * dimension reports a clash that is not there, and the cure for that is not to
 * relax it but to give it the dimension.
 *
 * The extent is [ref]'s, not a choice: the collecting channels run storeys 2–7,
 * the wellhead is on storey 3 [VIDEO], and the pipe runs from the highest
 * channel down into it — so the chase exists from the wellhead's storey up to
 * the top of the channel range, floor to springing on each.
 */
export function downpipeChases(
  floors: Array<{ index: number; floorY: number; cupolaSpringY: number }>,
  range: readonly [number, number],
  startsAtFloorIndex: number,
  azimuthDeg: number,
  pipeDiameter: number,
): DownpipeChase[] {
  const [from, to] = range
  return floors
    .filter((f) => f.index >= Math.max(startsAtFloorIndex, from - 1) && f.index <= to)
    .map((f) => ({
      azimuthDeg,
      // wide enough to stand the pipe in with a shoulder either side
      width: pipeDiameter * 2.2,
      bottomY: f.floorY,
      topY: f.cupolaSpringY,
      depth: pipeDiameter * 1.6,
      floorIndex: f.index,
    }))
}

/** One obstruction seen in plan: a bearing and the half-angle it occupies. */
export interface PlanBlock {
  label: string
  azimuthDeg: number
  halfWidthDeg: number
}

/** An arc of bearings nothing occupies. */
export interface ClearArc {
  fromDeg: number
  toDeg: number
  widthDeg: number
  /** Bearing furthest from either end — the most defensible place to stand. */
  middleDeg: number
}

/**
 * WHERE A VERTICAL RUN OF THE GIVEN WIDTH MAY STAND AT ALL, in plan.
 *
 * Every void is widened by the run's own half-angle and projected onto the
 * circle; what is left is returned, widest arc first. Height is deliberately
 * NOT an argument, and that is the whole point of this function: it is the
 * question the height-aware guards cannot answer.
 *
 * The distinction cost this model a year of near misses in both directions. A
 * guard that compares bearings alone reports clashes that are not there — see
 * the note in downpipeChases() — so the guards learned to ask about height, and
 * were right to. But then "clear" came to mean "does not touch anything AT THE
 * HEIGHTS BOTH HAPPEN TO OCCUPY TODAY", and a placeholder can pass that while
 * standing dead in line with a window two metres above it. WELL.azimuthDeg did
 * exactly that at 230. One lowered landing and it would have been a hole.
 *
 * So both questions get asked, of different things. Whether stone is being cut
 * where stone is not there is a question about heights. Where to PUT a value
 * nobody has measured is a question about plan: choose a bearing that is clear
 * however the heights move, because in this tower the heights do move.
 */
export function clearArcsFor(blocks: readonly PlanBlock[], ownHalfDeg: number): ClearArc[] {
  const EPS = 1e-9
  const norm = (x: number) => ((x % 360) + 360) % 360
  const spans: Array<[number, number]> = []
  for (const b of blocks) {
    const half = b.halfWidthDeg + ownHalfDeg
    if (half <= 0) continue
    // one block that reaches more than half the circle either way closes it
    if (half >= 180) return []
    const from = norm(b.azimuthDeg - half)
    spans.push([from, from + 2 * half])
  }
  if (spans.length === 0) return [{ fromDeg: 0, toDeg: 360, widthDeg: 360, middleDeg: 180 }]

  // merged on a line that carries one extra revolution, so a span that straddles
  // the 0/360 seam is merged with its neighbours instead of being cut by it
  spans.sort((a, b) => a[0] - b[0])
  const doubled: Array<[number, number]> = [
    ...spans,
    ...spans.map(([a, b]) => [a + 360, b + 360] as [number, number]),
  ]
  const merged: Array<[number, number]> = []
  for (const s of doubled) {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1] + EPS) last[1] = Math.max(last[1], s[1])
    else merged.push([s[0], s[1]])
  }

  const origin = merged[0][0]
  const arcs: ClearArc[] = []
  for (let i = 0; i + 1 < merged.length; i += 1) {
    const from = merged[i][1]
    const to = merged[i + 1][0]
    // one revolution's worth of gaps; past that they repeat
    if (from >= origin + 360 - EPS) break
    if (to - from <= EPS) continue
    arcs.push({
      fromDeg: norm(from),
      toDeg: norm(to),
      widthDeg: to - from,
      middleDeg: norm((from + to) / 2),
    })
  }
  return arcs.sort((a, b) => b.widthDeg - a.widthDeg)
}

/**
 * WHERE A ROUND MOUTH STANDS BESIDE A DOORWAY AND NOT IN IT.
 *
 * The doorway's near jamb is a radial plane at `azimuth ± halfWidth`. A mouth of
 * the given diameter, centred `mouthRadius` from the axis, stands clear of that
 * plane iff its centre lies at least `asin(mouthDiameter / 2 / mouthRadius)`
 * beyond it in bearing — the perpendicular distance from the centre to the plane
 * being `mouthRadius · sin Δ`, which must reach the mouth's own radius. Equality
 * is tangency, and tangency is what "beside" means: as near the opening as a
 * round thing can stand without breaking the line of the jamb.
 *
 * `side` is +1 for the clockwise jamb (increasing azimuth) and −1 for the
 * anticlockwise one. It is an argument and not a derivation because nothing in
 * the arithmetic knows which side of a door a well was sunk on; only the footage
 * does.
 *
 * IT IS EXACT, NOT SMALL-ANGLE. At the tower's own figures — a 1.08 m mouth 2.4 m
 * out — arcsin gives 13.003° against the ratio's 12.891°, and 0.11° is 5 mm of
 * arc there. That is nothing; the arcsin is used anyway because it stays right
 * when the mouth is moved out to the wall, which the footage says it should be.
 * If the mouth is wider than the circle it stands on it swallows the axis and no
 * bearing clears the plane: the clamp then returns a quarter turn, which is the
 * honest answer to an impossible question rather than a NaN.
 */
export function besideDoorwayBearing(
  doorwayAzimuthDeg: number,
  doorwayHalfWidthDeg: number,
  mouthRadius: number,
  mouthDiameter: number,
  side: 1 | -1,
): number {
  const clearDeg = mouthHalfAngleDeg(mouthRadius, mouthDiameter)
  const a = doorwayAzimuthDeg + side * (Math.abs(doorwayHalfWidthDeg) + clearDeg)
  return ((a % 360) + 360) % 360
}

/**
 * Half the arc a round mouth of this diameter takes up, seen from the axis.
 *
 * Exact rather than small-angle, and clamped rather than left to return NaN —
 * see besideDoorwayBearing(), which is this function plus a jamb. Pulled out so
 * that the two placements built on it, "beside one doorway" and "between two",
 * cannot come to different answers about how wide the mouth is.
 */
export function mouthHalfAngleDeg(mouthRadius: number, mouthDiameter: number): number {
  const ratio = Math.min(1, Math.max(0, mouthDiameter / 2 / Math.max(1e-9, mouthRadius)))
  return (Math.asin(ratio) * 180) / Math.PI
}

/** Where a mouth may stand between two doorways, and where in that band it goes. */
export interface BetweenDoorways {
  /**
   * The bearing equidistant from both jambs — the only point in the band that
   * does not prefer one doorway to the other.
   */
  bearingDeg: number
  /** Anticlockwise end of the band: the mouth's rim tangent to the nearer jamb. */
  fromDeg: number
  /** Clockwise end, likewise. */
  toDeg: number
  /** Half the band. How far the mouth may be shifted either way before it touches. */
  freedomDeg: number
  /** Jamb to facing jamb, before the mouth's own width is taken off. */
  clearSpanDeg: number
}

/**
 * WHERE A ROUND MOUTH STANDS BETWEEN TWO DOORWAYS.
 *
 * The companion to besideDoorwayBearing(), and it answers a different sentence.
 * "Beside the passage" names ONE opening and leaves the side open, so that
 * function takes the side as an argument — nothing in the arithmetic knows which
 * hand of a door a well was sunk on. "Between the entrances" names TWO, and two
 * jambs facing each other across a gap have a middle. There is nothing left to
 * choose: the side question dissolves, and what was a [PLACEHOLDER] with a
 * witness beside it becomes a derivation with a stated tolerance.
 *
 * THE GAP TAKEN IS THE SHORTER ONE. Two doorways divide the drum into two arcs
 * and a wellhead is "between" them in the ordinary sense of the word, not in the
 * sense that every point of a circle is between any two others. On storey 3 the
 * choice is 81.8° against 263.9°, so nothing turns on it here; it is written down
 * because the day a storey has its doorways near each other, the long way round
 * would put the well across the room and still pass a test called "between".
 *
 * THE MIDDLE IS OF THE JAMBS, NOT OF THE DOORWAY CENTRES. They coincide exactly
 * when the two doorways subtend the same angle, which on storey 3 they do — both
 * are STAIR.doorwayWidth at the same storey radius, so 154.496 comes out of
 * either. Bisecting the JAMBS is the one that stays right when they differ, and
 * it is also the sentence: a walker between two openings is between their edges.
 *
 * `freedomDeg` is the honest part. The mouth is 1.08 m across on a 2.4 m radius
 * and the gap is 81.8°, so the band is 55.8° wide: his sentence fixes the bearing
 * to within ±27.9°, or 1.17 m of travel along the floor, and NOT to a degree.
 * A caller that wants the number without the tolerance is claiming a precision
 * the sentence has not got.
 */
export function betweenDoorways(
  aAzimuthDeg: number,
  aHalfWidthDeg: number,
  bAzimuthDeg: number,
  bHalfWidthDeg: number,
  mouthRadius: number,
  mouthDiameter: number,
): BetweenDoorways {
  const norm = (x: number) => ((x % 360) + 360) % 360
  const aHalf = Math.abs(aHalfWidthDeg)
  const bHalf = Math.abs(bHalfWidthDeg)
  // clockwise from a to b, so the two gaps are the arc's remainder either side
  const d = norm(bAzimuthDeg - aAzimuthDeg)
  const clockwise = d - aHalf - bHalf
  const anticlockwise = 360 - d - aHalf - bHalf
  const [lo, span] =
    clockwise <= anticlockwise
      ? [aAzimuthDeg + aHalf, clockwise]
      : [bAzimuthDeg + bHalf, anticlockwise]
  const mouthHalf = mouthHalfAngleDeg(mouthRadius, mouthDiameter)
  return {
    bearingDeg: norm(lo + span / 2),
    fromDeg: norm(lo + mouthHalf),
    toDeg: norm(lo + span - mouthHalf),
    freedomDeg: span / 2 - mouthHalf,
    clearSpanDeg: span,
  }
}

/** One length of chase found standing inside one passage. */
export interface ChaseBreach {
  passage: string
  /** 0-based storey whose length of chase does it. */
  floorIndex: number
  /** How far the chase's arc reaches into the passage's, degrees. */
  overlapDeg: number
  /** How far past the passage's inner face the chase's back reaches, metres. */
  biteMetres: number
  bottomY: number
  topY: number
}

/** A passage as this module needs it: a tunnel described by its sections. */
export interface PassageRun {
  label: string
  sections: ReadonlyArray<{
    azimuthDeg: number
    bottomY: number
    topY: number
    innerRadius: number
  }>
}

/**
 * WHERE THE CHASE STANDS IN A STAIR PASSAGE — the damage report, recomputed.
 *
 * Both dimensions, asked of the same pair: only the sections of a passage that
 * share a length of chase's HEIGHT are considered, and their bearings are then
 * compared with the chase's. That is the lesson of downpipeChases() and of
 * clearArcsFor() applied together rather than one instead of the other — a
 * height-blind guard cries wolf, a plan-blind one calls a two-metre miss a
 * clearance, and what is wanted here is neither a guard nor a placement rule but
 * an inventory of what a SOURCED position costs.
 *
 * The third dimension is the one that says whether it matters. A chase bites
 * `depth` past the room face; a passage begins `wallClearance` past it. Where the
 * two arcs cross, the bite is how much of the jamb between room and stair is
 * removed, and anything over the jamb's own thickness is a hole between them.
 *
 * Returns worst first, and empty when the chase is clear — so the report is
 * silent exactly when there is nothing to say.
 */
export function chaseBreaches(
  chases: readonly DownpipeChase[],
  passages: readonly PassageRun[],
  faceRadiusAt: (y: number) => number,
): ChaseBreach[] {
  const DEG = 180 / Math.PI
  const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
  const out: ChaseBreach[] = []
  for (const c of chases) {
    const midY = (c.bottomY + c.topY) / 2
    const face = faceRadiusAt(midY)
    const chaseHalfDeg = (c.width / 2 / Math.max(1e-9, face)) * DEG
    for (const p of passages) {
      const shared = p.sections.filter((s) => !(s.topY < c.bottomY || s.bottomY > c.topY))
      if (shared.length === 0) continue
      const lo = Math.min(...shared.map((s) => s.azimuthDeg))
      const hi = Math.max(...shared.map((s) => s.azimuthDeg))
      const overlapDeg = chaseHalfDeg + (hi - lo) / 2 - sep(c.azimuthDeg, (lo + hi) / 2)
      if (overlapDeg <= 0) continue
      out.push({
        passage: p.label,
        floorIndex: c.floorIndex,
        overlapDeg,
        biteMetres: face + c.depth - Math.min(...shared.map((s) => s.innerRadius)),
        bottomY: c.bottomY,
        topY: c.topY,
      })
    }
  }
  return out.sort((a, b) => b.overlapDeg - a.overlapDeg)
}

/**
 * Profile of the well shaft: a funnel collar at the mouth narrowing to the bore.
 * Returned as (radius, y) pairs ready to be revolved.
 *
 * The collar is why the photographs show an opening far wider than the 0.7 m
 * [ref] quotes — that figure is the bore lower down.
 */
export function wellProfile(
  mouthY: number,
  depth: number,
  bore: number,
  mouthDiameter: number,
  collarDepth: number,
): Array<{ r: number; y: number }> {
  const boreR = bore / 2
  const mouthR = Math.max(boreR, mouthDiameter / 2)
  return [
    { r: mouthR, y: mouthY },
    { r: boreR, y: mouthY - Math.max(0.01, collarDepth) },
    { r: boreR, y: mouthY - depth },
  ]
}

/** Where along a run a droplet sits at time t, as a fraction from top to bottom. */
export function flowPosition(topY: number, bottomY: number, t: number): number {
  const u = ((t % 1) + 1) % 1
  return topY + (bottomY - topY) * u
}

export interface Point3 {
  x: number
  y: number
  z: number
}

/**
 * Where along a BENT run a droplet sits at time t — same wrap as flowPosition(),
 * but the run is a polyline and t is a fraction of its LENGTH, not of its legs.
 *
 * It exists because the wellhead and the shaft stopped sharing a bearing. While
 * they did, the fall was one plumb line and a single Y was the whole answer; with
 * the shaft on the far side of the chamber the water goes down the wall, across
 * the floor and only then into the mouth, and a droplet animated on Y alone rains
 * through four rooms at a bearing no pipe stands on.
 *
 * Parametrised by arc length rather than by segment index so the drop does not
 * pause at the elbow: on storey 3 the leg is 6.23 m against a 13 m fall, and
 * splitting t evenly between the three legs would run the horizontal one at twice
 * the speed of the vertical.
 */
export function flowAlongPath(points: readonly Point3[], t: number): Point3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }
  if (points.length === 1) return { ...points[0] }
  const legs: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    legs.push(len)
    total += len
  }
  const u = ((t % 1) + 1) % 1
  if (total <= 0) return { ...points[0] }
  let want = u * total
  for (let i = 0; i < legs.length; i += 1) {
    if (want > legs[i] && i < legs.length - 1) {
      want -= legs[i]
      continue
    }
    const f = legs[i] <= 0 ? 0 : Math.min(1, want / legs[i])
    const a = points[i]
    const b = points[i + 1]
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
    }
  }
  return { ...points[points.length - 1] }
}

/**
 * Below ground the pipes leave the tower horizontally through the wall, square
 * in section rather than round [ref]. Returns their start and end radii.
 */
export function buriedRunRadii(
  innerRadius: number,
  outerRadius: number,
  overshoot = 1.5,
): { from: number; to: number } {
  return { from: Math.max(0.1, innerRadius * 0.35), to: outerRadius + overshoot }
}
