/**
 * Window openings (Phase 5). Pure geometry + validation of the editable
 * src/data/windows.json, three.js-free so it can be unit-tested.
 *
 * [ref]: "Окна — узкие щели/ниши, расширяющиеся внутрь (flare inward)."
 * So an opening is a truncated pyramid: the small face outside, the large face
 * on the room side, cut through the full wall thickness at that height.
 */

export type WindowKind = 'slit' | 'arched'

export interface WindowSpec {
  id: string
  kind: WindowKind
  /** 0-based storey the opening lights. */
  floorIndex: number
  /** Azimuth clockwise from north. */
  azimuthDeg: number
  /** Position up the tower as a fraction of total height, as measured in photos. */
  heightFraction: number
  /**
   * Sill height above that storey's floor.
   *
   * DOCUMENTATION, NOT GEOMETRY — read windowCentreY() before using it. Every
   * entry in windows.json carries 1.4 here, which is a filler, while
   * heightFraction carries the actual photographic reading.
   */
  heightAboveFloor: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  /**
   * Whether this is the aperture Islamov's winter-solstice claim refers to.
   * No source identifies it; see the note in windows.json before setting any
   * of these true (CLAUDE.md rule 7).
   */
  solsticeAligned: boolean
  note?: string
}

/** Splay of the reveal, in degrees, half-angle in plan. */
export function splayHalfAngleDeg(
  outerWidth: number,
  innerWidth: number,
  wallThickness: number,
): number {
  if (wallThickness <= 0) throw new Error('wall thickness must be positive')
  const halfSpread = (innerWidth - outerWidth) / 2
  return (Math.atan2(halfSpread, wallThickness) * 180) / Math.PI
}

/** True when the opening genuinely widens toward the room, as the sources require. */
export function flaresInward(w: Pick<WindowSpec, 'outerWidth' | 'innerWidth' | 'outerHeight' | 'innerHeight'>): boolean {
  return w.innerWidth > w.outerWidth && w.innerHeight >= w.outerHeight
}

/**
 * Problems that should stop an opening being built. Returns an empty array when
 * the spec is usable. Kept as data rather than throwing so the UI can show them.
 */
export function validateWindow(
  w: WindowSpec,
  floorCount: number,
  wallThicknessAtSill: number,
): string[] {
  const errs: string[] = []
  if (!Number.isInteger(w.floorIndex) || w.floorIndex < 0 || w.floorIndex >= floorCount) {
    errs.push(`${w.id}: floorIndex ${w.floorIndex} is outside 0..${floorCount - 1}`)
  }
  if (w.outerWidth <= 0 || w.outerHeight <= 0) errs.push(`${w.id}: outer size must be positive`)
  if (!flaresInward(w)) errs.push(`${w.id}: does not flare inward`)
  if (w.innerWidth >= wallThicknessAtSill * 4) {
    errs.push(`${w.id}: inner width ${w.innerWidth} is implausibly wide for a ${wallThicknessAtSill.toFixed(1)} m wall`)
  }
  if (w.heightFraction < 0 || w.heightFraction > 1) {
    errs.push(`${w.id}: heightFraction ${w.heightFraction} outside 0..1`)
  }
  return errs
}

/** Every opening flagged as the solstice aperture. Expected to be empty for now. */
export function solsticeWindows(windows: WindowSpec[]): WindowSpec[] {
  return windows.filter((w) => w.solsticeAligned)
}

/**
 * Openings grouped by the azimuth they share, to a tolerance. Photographs show
 * the slits fall into two columns; this recovers them from the data.
 */
export function groupByAzimuth(windows: WindowSpec[], toleranceDeg = 2): WindowSpec[][] {
  const groups: WindowSpec[][] = []
  for (const w of windows) {
    const g = groups.find((grp) => Math.abs(grp[0].azimuthDeg - w.azimuthDeg) <= toleranceDeg)
    if (g) g.push(w)
    else groups.push([w])
  }
  return groups
}

/**
 * Where an opening's centre sits in world Y.
 *
 * heightFraction is the MEASURED quantity: windows.json's own provenance note
 * describes the two slit columns by their heightFraction ranges (0.28–0.61 and
 * 0.67–0.94), established by cross-checking eleven exterior photographs.
 * heightAboveFloor is 1.4 for every one of the nine openings — a filler that was
 * never a reading of anything.
 *
 * The geometry used to be built from floorY + heightAboveFloor + outerHeight/2,
 * so the measurement was documented and then ignored. That is what put storey
 * 3's window above storey 3's own vault, drove storey 6's slits through into
 * storey 7 at floor level, and stacked upper-3 and upper-4 at exactly the same
 * height when the photographs put them 2.9 m apart.
 *
 * So: the fraction decides, and floorIndex is left for grouping alone. Both
 * datums come from the tower's real extent — groundY is the outside ground
 * line, not the entry floor, because that is where a photograph's scale starts.
 */
export function windowCentreY(w: WindowSpec, groundY: number, height: number): number {
  return groundY + w.heightFraction * height
}

/**
 * How far each opening moves when built from its fraction rather than its
 * nominal sill. Reports the disagreement rather than hiding it: a large value
 * means the two fields were telling different stories about the same window.
 */
export function centreYDrift(
  windows: WindowSpec[],
  floorYOf: (floorIndex: number) => number,
  groundY: number,
  height: number,
): { id: string; fromFraction: number; fromSill: number; drift: number }[] {
  return windows.map((w) => {
    const fromFraction = windowCentreY(w, groundY, height)
    const fromSill = floorYOf(w.floorIndex) + w.heightAboveFloor + w.outerHeight / 2
    return { id: w.id, fromFraction, fromSill, drift: fromFraction - fromSill }
  })
}

/**
 * Which storey an opening actually lights, derived from where it IS.
 *
 * windows.json also carries a `floorIndex`, and it is no longer trustworthy: it
 * was written when geometry came from floorIndex + heightAboveFloor, so it names
 * the storey the old formula would have put the opening in. Once heights started
 * coming from the photographs, several openings moved past a slab — lower-1 is
 * filed under storey 3 and lights storey 2; upper-2 is filed under storey 6 and
 * its sill is level with storey 7's floor.
 *
 * The storey lit is the one whose floor is the highest floor at or below the
 * opening's SILL, not its centre: a slit whose sill is above a slab lights the
 * room above it however far its head reaches.
 */
export function windowStoreyIndex(
  w: WindowSpec,
  floorYs: number[],
  groundY: number,
  height: number,
): number {
  const sill = windowCentreY(w, groundY, height) - w.outerHeight / 2
  let best = 0
  for (let i = 0; i < floorYs.length; i += 1) if (floorYs[i] <= sill) best = i
  return best
}

/**
 * How far an opening's sill stands above the floor of the room it lights.
 *
 * Negative where the sill is below that floor, which happens when a slit
 * straddles a slab — the reason to report the number rather than assume it is
 * positive.
 */
export function sillAboveFloor(
  w: WindowSpec,
  floorYs: number[],
  groundY: number,
  height: number,
): number {
  const sill = windowCentreY(w, groundY, height) - w.outerHeight / 2
  return sill - floorYs[windowStoreyIndex(w, floorYs, groundY, height)]
}
