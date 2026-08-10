/**
 * Openings in the CHAMBER walls (Phase 5). Pure geometry + validation of the
 * editable src/data/windows.json, three.js-free so it can be unit-tested.
 *
 * [ref]: "Окна — узкие щели/ниши, расширяющиеся внутрь (flare inward)."
 * So an opening is a truncated pyramid: the small face outside, the large face
 * at the far end of the reveal, cut through the wall at that height.
 *
 * THIS FILE NOW SERVES ONE OPENING. On 2026-08-10 the owner stated that the
 * tower's slits are at the beginning and the end of the stair passages and that
 * the storeys themselves have no windows at all; every slit therefore moved to
 * src/lib/passageOpenings.ts, where its azimuth and its height are derived from
 * the flight rather than stored. What is left here is the later arched window —
 * a modern insertion, cut through a chamber wall by somebody who wanted a window
 * — and the arithmetic it still needs.
 *
 * The functions are kept rather than inlined because that opening is genuinely a
 * chamber opening: it has a height fraction measured off a photograph, it lights
 * a storey, and its reveal ends at the room face. All three questions are
 * meaningless for a slit at the end of a passage and are exactly right for this.
 */

export type WindowKind = 'slit' | 'arched'

/** An opening cut through a chamber wall, positioned in its own right. */
export interface ChamberWindowSpec {
  id: string
  kind: WindowKind
  /** Azimuth clockwise from north. */
  azimuthDeg: number
  /** Position up the tower as a fraction of total height, as measured in photos. */
  heightFraction: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  /** Shape of the head: 'flat' | 'round' | 'pointed'. See WindowHead. */
  head?: 'flat' | 'round' | 'pointed'
  /**
   * Which end of the reveal the grille hangs at. Defaults to 'outer'.
   *
   * 'revealEnd' used to be spelled 'room', and for this opening it still means
   * the room face. The rename is because the same field now serves slits whose
   * reveal ends on a stair landing, where "room" would be a lie.
   */
  barrierAt?: 'outer' | 'revealEnd'
  /**
   * Whether this is the aperture Islamov's winter-solstice claim refers to.
   * No source identifies it; see the note in windows.json before setting any
   * of these true (CLAUDE.md rule 7).
   */
  solsticeAligned: boolean
  note?: string | string[]
  questionedBy?: string
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
export function flaresInward(
  w: Pick<ChamberWindowSpec, 'outerWidth' | 'innerWidth' | 'outerHeight' | 'innerHeight'>,
): boolean {
  return w.innerWidth > w.outerWidth && w.innerHeight >= w.outerHeight
}

/**
 * Problems that should stop an opening being built. Returns an empty array when
 * the spec is usable. Kept as data rather than throwing so the UI can show them.
 *
 * The floorIndex check is gone with the field: it was a grouping key written when
 * geometry came from floorIndex + heightAboveFloor, and both are now unused.
 */
export function validateChamberWindow(
  w: ChamberWindowSpec,
  wallThicknessAtSill: number,
): string[] {
  const errs: string[] = []
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
export function solsticeWindows<T extends { solsticeAligned: boolean }>(windows: T[]): T[] {
  return windows.filter((w) => w.solsticeAligned)
}

/**
 * Openings grouped by the azimuth they share, to a tolerance.
 *
 * IT MEASURES THE MODEL NOW, it does not recover a reading. It used to be
 * described as recovering the photographed two-column arrangement from the data
 * — but the columns were what the data had been tuned to, so the recovery was
 * circular. Applied to the DERIVED openings it answers a real question: does the
 * stacked-flight layout actually produce columns, and how far apart are they?
 */
export function groupByAzimuth<T extends { azimuthDeg: number }>(
  windows: T[],
  toleranceDeg = 2,
): T[][] {
  const groups: T[][] = []
  for (const w of windows) {
    const g = groups.find((grp) => Math.abs(grp[0].azimuthDeg - w.azimuthDeg) <= toleranceDeg)
    if (g) g.push(w)
    else groups.push([w])
  }
  return groups
}

/**
 * Where a chamber opening's centre sits in world Y.
 *
 * heightFraction is the MEASURED quantity, established by cross-checking eleven
 * exterior photographs. The geometry used to be built from floorY +
 * heightAboveFloor + outerHeight/2 instead, so the measurement was documented
 * and then ignored — that is what put storey 3's window above storey 3's own
 * vault and stacked upper-3 and upper-4 at exactly the same height when the
 * photographs put them 2.9 m apart. Both fields are gone now; the fraction
 * decides, and both datums come from the tower's real extent — groundY is the
 * outside ground line, not the entry floor, because that is where a photograph's
 * scale starts.
 */
export function windowCentreY(
  w: Pick<ChamberWindowSpec, 'heightFraction'>,
  groundY: number,
  height: number,
): number {
  return groundY + w.heightFraction * height
}

/**
 * Which storey a chamber opening lights, derived from where it IS.
 *
 * The storey lit is the one whose floor is the highest floor at or below the
 * opening's SILL, not its centre: an opening whose sill is above a slab lights
 * the room above it however far its head reaches.
 *
 * MEANINGLESS FOR A PASSAGE SLIT, which is why it is confined to this file. A
 * slit at the end of a flight lights a landing inside the wall, and the storey
 * its height happens to fall in is not a fact about it.
 */
export function windowStoreyIndex(
  w: Pick<ChamberWindowSpec, 'heightFraction' | 'outerHeight'>,
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
 * Negative where the sill is below that floor, which happens when an opening
 * straddles a slab — the reason to report the number rather than assume it is
 * positive.
 */
export function sillAboveFloor(
  w: Pick<ChamberWindowSpec, 'heightFraction' | 'outerHeight'>,
  floorYs: number[],
  groundY: number,
  height: number,
): number {
  const sill = windowCentreY(w, groundY, height) - w.outerHeight / 2
  return sill - floorYs[windowStoreyIndex(w, floorYs, groundY, height)]
}
