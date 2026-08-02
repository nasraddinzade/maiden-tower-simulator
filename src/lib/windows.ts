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
  /** Sill height above that storey's floor. */
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
