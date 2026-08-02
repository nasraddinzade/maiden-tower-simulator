/**
 * Performance budget.
 *
 * From docs/optimization-addendum.md, which sets these in Phase 1 rather than
 * Phase 11 on purpose: a budget discovered late is a rewrite, a budget seen
 * every phase is an hour's work. The reference point given there is Messenger
 * (abeto.co) — 5.7 MB first load, 17.5 MB total, for a whole world with NPCs and
 * multiplayer. One tower has no excuse for more.
 *
 * These are TARGETS, not measurements. The HUD compares live counters against
 * them and turns a figure red when it is over. Nothing here changes what is
 * rendered — a budget that silently degrades the model would hide the very
 * problem it exists to show.
 */

export interface PerfBudget {
  drawCalls: number
  triangles: number
  /** Frame time, milliseconds. */
  frameMs: number
}

/** Desktop targets. */
export const BUDGET_DESKTOP: PerfBudget = {
  drawCalls: 120,
  triangles: 900_000,
  frameMs: 16,
}

/** Mobile targets — roughly half the draw calls, a third of the triangles. */
export const BUDGET_MOBILE: PerfBudget = {
  drawCalls: 60,
  triangles: 350_000,
  frameMs: 33,
}

/** Payload targets, bytes. Checked at build time, not at runtime. */
export const PAYLOAD_BUDGET = {
  /** Everything the first paint waits on. */
  firstLoadBytes: 6 * 1024 * 1024,
  /** Everything, including lazily-loaded chunks. */
  totalBytes: 20 * 1024 * 1024,
  /** GPU texture memory. */
  textureBytes: 150 * 1024 * 1024,
} as const

/**
 * Shell triangle ceiling after CSG cleanup.
 *
 * The addendum: "не больше 150k треугольников. Если CSG выдаёт больше —
 * уменьшай сегментацию цилиндра, а не терпи." 96 radial segments give a 0.5 m
 * facet at 8 m radius, which the eye cannot pick out, so the segmentation is
 * already where it should be.
 */
export const SHELL_TRIANGLE_CEILING = 150_000

/**
 * A phone is not told apart from a laptop reliably, and guessing wrong either
 * way is worse than asking the display. Coarse-pointer + narrow viewport is the
 * signal that actually correlates with the mobile budget.
 */
export function isMobileProfile(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return coarse && Math.min(window.innerWidth, window.innerHeight) < 900
}

export function activeBudget(): PerfBudget {
  return isMobileProfile() ? BUDGET_MOBILE : BUDGET_DESKTOP
}

/** True when a measured value has broken its budget. */
export function overBudget(value: number, limit: number): boolean {
  return value > limit
}
