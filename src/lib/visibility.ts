/**
 * Storey visibility and level of detail (Phase 11). Pure, testable.
 *
 * The tower is a stack of closed rooms: standing on one storey you can see your
 * own, a glimpse of the next through the oculus, and nothing else. Rendering all
 * eight is therefore mostly wasted work — the Phase-11 spec asks for current ± 1.
 */

export interface VisibilityOptions {
  /** How many storeys either side of the viewer stay at full detail. */
  radius?: number
  /** Ignore the storey window entirely (used when looking at the tower from outside). */
  showAll?: boolean
}

/** Index of the storey a given world height belongs to. */
export function storeyAt(
  y: number,
  floors: Array<{ floorY: number }>,
): number {
  if (floors.length === 0) return 0
  let index = 0
  for (let i = 0; i < floors.length; i++) {
    if (y >= floors[i].floorY) index = i
  }
  return index
}

/** Whether a storey should be drawn, given where the viewer is. */
export function isStoreyVisible(
  storeyIndex: number,
  viewerStorey: number,
  options: VisibilityOptions = {},
): boolean {
  if (options.showAll) return true
  const radius = options.radius ?? 1
  return Math.abs(storeyIndex - viewerStorey) <= radius
}

/** The full visible set, as indices. */
export function visibleStoreys(
  viewerStorey: number,
  count: number,
  options: VisibilityOptions = {},
): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    if (isStoreyVisible(i, viewerStorey, options)) out.push(i)
  }
  return out
}

/**
 * Radial segment count for a storey, dropping with distance from the viewer.
 *
 * A cupola three storeys away is a few pixels of a dark ceiling glimpsed through
 * an oculus; it does not need the same lathe resolution as the one overhead.
 */
export function lodSegments(
  storeyIndex: number,
  viewerStorey: number,
  full: number,
  minimum = 12,
): number {
  const distance = Math.abs(storeyIndex - viewerStorey)
  if (distance === 0) return full
  const reduced = Math.round(full / (1 + distance))
  return Math.max(minimum, reduced)
}
