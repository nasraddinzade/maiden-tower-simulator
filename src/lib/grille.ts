/**
 * Where the bars of a window grille go. Pure numbers, no three.js, so the layout
 * can be asserted (CLAUDE.md rule 6).
 */

export interface GrilleBar {
  /** Distance across the opening from its centre, metres. Positive = one side. */
  offset: number
  /** Length of the bar, jamb embedment included. */
  length: number
  orientation: 'vertical' | 'horizontal'
}

/**
 * `count` bars evenly spaced across a span, symmetric about its centre.
 *
 * Symmetric because a slit is narrow and a grid laid from one jamb puts its last
 * gap wherever the arithmetic lands, which reads as a mistake even when the
 * spacing is right. Spaced from the centre, any remainder is split between the
 * two jambs, where a mason would put it.
 */
export function barOffsets(span: number, barSide: number, count: number): number[] {
  if (count <= 0 || span <= barSide) return []
  /*
   * COUNTED, NOT SPACED. This used to take a gap and fit as many bars as would
   * go, and on a 0.40 m slit with a 0.12 m gap that came out at ONE vertical bar
   * and eleven horizontals — a ladder lying on its side, not a grille. The
   * photographs show the opposite proportion: a hung gate of eight to eleven
   * uprights with two or three rails across.
   *
   * A count also survives the openings being different sizes, which a gap does
   * not: the arched window was more than twice the width of a slit, and a fixed
   * gap silently gave it a different character. That window went out of the model
   * on 2026-08-10 and every opening is a slit now — but the leva width control
   * still scales them, and the ends the owner has yet to rule on may not all be
   * the same size when he does, so the argument stands and the example is kept
   * as the one that was measured.
   */
  const pitch = (span - barSide) / (count + 1)
  const out: number[] = []
  for (let i = 1; i <= count; i += 1) out.push(-((span - barSide) / 2) + i * pitch)
  return out
}

/**
 * The whole grid for one opening.
 *
 * Verticals run the full height and horizontals the full width, both carried
 * `embed` past the opening at each end so no bar ends in mid-air against a jamb
 * it never quite reaches.
 */
export function grilleBars(
  width: number,
  height: number,
  barSide: number,
  uprights: number,
  rails: number,
  embed: number,
): GrilleBar[] {
  const bars: GrilleBar[] = []
  for (const offset of barOffsets(width, barSide, uprights)) {
    bars.push({ offset, length: height + 2 * embed, orientation: 'vertical' })
  }
  for (const offset of barOffsets(height, barSide, rails)) {
    bars.push({ offset, length: width + 2 * embed, orientation: 'horizontal' })
  }
  return bars
}
