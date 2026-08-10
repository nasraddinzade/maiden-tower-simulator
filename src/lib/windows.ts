/**
 * The arithmetic every opening in the tower needs, whatever wall it is cut in.
 *
 * THIS FILE USED TO BE "OPENINGS IN THE CHAMBER WALLS" AND THERE ARE NO LONGER
 * ANY. On 2026-08-10 the owner said twice — the second time with the argument
 * for an exception in front of him — that the storeys themselves carry no
 * windows at all and that the openings are at the beginning and the end of the
 * stair passages. Every slit had already moved to src/lib/passageOpenings.ts,
 * where its azimuth and its height are derived from the flight rather than
 * stored; the one opening this file still served, the later arched insertion in
 * storey 4's wall, was withdrawn with the second statement. See
 * src/data/windows.json → chamberOpeningsHistory for the full record of what it
 * was and why it was believed.
 *
 * WHAT WENT WITH IT, rather than being left as machinery nothing drives:
 * ChamberWindowSpec, validateChamberWindow(), windowCentreY(),
 * windowStoreyIndex() and sillAboveFloor(). All five took a `heightFraction` —
 * where an opening sits up the drum as a fraction of the tower's height, read
 * off a photograph — and that is a property only an opening positioned in its
 * own right can have. An opening at the end of a flight is placed by the flight;
 * asking which storey it lights, or how far its sill stands above that storey's
 * floor, is asking about a room it does not open into. With `chamberOpenings`
 * empty they had no callers and no data, which is the definition of dead.
 *
 * WHAT IS LEFT IS NOT DEAD, and each of the four is applied to the openings that
 * do exist: splayHalfAngleDeg() measures the acceptance cone Phase 8 reasons
 * about, flaresInward() states the one thing [ref] says about the shape of these
 * holes, solsticeWindows() is the CLAUDE.md rule 7 guard, and groupByAzimuth()
 * measures whether the derived layout really does stand in columns.
 *
 * [ref]: "Окна — узкие щели/ниши, расширяющиеся внутрь (flare inward)."
 * So an opening is a truncated pyramid: the small face outside, the large face
 * at the far end of the reveal, cut through the wall at that height.
 */

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
export function flaresInward(w: {
  outerWidth: number
  innerWidth: number
  outerHeight: number
  innerHeight: number
}): boolean {
  return w.innerWidth > w.outerWidth && w.innerHeight >= w.outerHeight
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
