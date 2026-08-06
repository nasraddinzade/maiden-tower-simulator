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
 * Bars evenly spaced across a span, laid out from the CENTRE outward.
 *
 * Centre-out rather than edge-in, because a slit is narrow and a grid laid from
 * one edge puts its last gap wherever the arithmetic lands — which reads as a
 * mistake even when the spacing is right. Laid from the middle the pattern is
 * symmetric about the opening, and any odd remainder is split between the two
 * jambs where a mason would put it.
 *
 * Returns [] when the span cannot hold a bar with a gap either side, which is
 * the honest answer for an opening narrower than the spacing rather than a bar
 * jammed against both jambs.
 */
export function barOffsets(span: number, barSide: number, gap: number): number[] {
  const pitch = barSide + gap
  if (span <= pitch) return []
  // bars strictly inside the opening, with a gap between the outermost and each jamb
  const count = Math.max(0, Math.floor((span - gap) / pitch) - 1)
  if (count <= 0) return []
  const out: number[] = []
  const first = -((count - 1) / 2) * pitch
  for (let i = 0; i < count; i += 1) out.push(first + i * pitch)
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
  gap: number,
  embed: number,
): GrilleBar[] {
  const bars: GrilleBar[] = []
  for (const offset of barOffsets(width, barSide, gap)) {
    bars.push({ offset, length: height + 2 * embed, orientation: 'vertical' })
  }
  for (const offset of barOffsets(height, barSide, gap)) {
    bars.push({ offset, length: width + 2 * embed, orientation: 'horizontal' })
  }
  return bars
}
