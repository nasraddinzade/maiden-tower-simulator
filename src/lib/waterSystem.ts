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
