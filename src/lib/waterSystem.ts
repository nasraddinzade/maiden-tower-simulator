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
