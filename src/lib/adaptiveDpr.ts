/**
 * The pixel-ratio ladder: how far the renderer backs off when the frame stops
 * fitting, and how it climbs back. Pure, so the whole policy is testable without
 * a GPU — the component that owns it does nothing but feed it frame times.
 *
 * WHY A LADDER AND NOT drei's AdaptiveDpr. drei ships two things. `AdaptiveDpr`
 * reacts to `regress()` — a hint raised by pointer input and controls damping,
 * not by a measured frame — so it lowers the image WHILE THE VISITOR IS TURNING
 * and restores it when they stop, which is the opposite of what a phone needs
 * from a building: the turn is exactly when you are reading the wall. Its
 * companion `PerformanceMonitor` does measure, but reports a 0..1 factor whose
 * mapping to a ratio is left to the caller, with no floor of its own. What the
 * addendum asks for is neither: a cap, a ladder of named rungs, and a rule for
 * when to step. That is three numbers and a comparison, and writing them here
 * means the rule can be asserted rather than watched.
 *
 * THE HYSTERESIS IS ASYMMETRIC ON PURPOSE. Changing the ratio reallocates the
 * drawing buffer and every render target hanging off it, so an oscillating
 * controller costs more than the rung it is arguing about. It falls after two
 * bad windows and climbs after six good ones, and the two thresholds are a full
 * refresh interval apart (config/perf.ts) so that jitter alone cannot cross
 * both. What it cannot avoid is a hunt when the true cost sits exactly on a
 * refresh boundary: there the ladder oscillates on a period of eight windows,
 * which is the honest answer to a frame that genuinely fits at neither rung.
 */

import type { DprPolicy } from '../config/perf'

export interface DprLadderState {
  /** Index into `policy.rungs`. 0 is full sharpness. */
  rung: number
  /** Consecutive decision windows spent over budget. */
  overWindows: number
  /** Consecutive decision windows spent comfortably under it. */
  underWindows: number
}

export const INITIAL_LADDER: DprLadderState = { rung: 0, overWindows: 0, underWindows: 0 }

/**
 * The ratio a rung asks for on a given display.
 *
 * The cap comes first and the rung scales what survives it, so the ladder means
 * the same thing on every device: rung 1 is always three quarters of the linear
 * resolution this display was going to get, whatever that was.
 */
export function dprAtRung(rung: number, deviceRatio: number, policy: DprPolicy): number {
  const capped = Math.min(deviceRatio, policy.ceiling)
  const index = Math.max(0, Math.min(policy.rungs.length - 1, Math.round(rung)))
  return Math.max(policy.floor, capped * policy.rungs[index])
}

/** The ratio to open at: the cap, undecided by any measurement yet. */
export function initialDpr(deviceRatio: number, policy: DprPolicy): number {
  return dprAtRung(0, deviceRatio, policy)
}

/**
 * Median of a decision window.
 *
 * The median and not the mean: one 300 ms hitch — a chunk arriving, a texture
 * uploading, the tab coming back — is not evidence that the frame is too big,
 * and a mean lets a single one of those drop a rung the visitor then has to
 * wait six windows to get back.
 */
export function medianFrameMs(samples: readonly number[]): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * One decision, from one window's median frame time.
 *
 * Returns the state unchanged when nothing is due, so a caller can compare
 * identities to know whether the ratio has to be re-applied.
 */
export function stepLadder(
  state: DprLadderState,
  medianMs: number,
  policy: DprPolicy,
): DprLadderState {
  const failed = medianMs > policy.dropAboveMs
  const roomy = medianMs < policy.climbBelowMs

  const overWindows = failed ? state.overWindows + 1 : 0
  const underWindows = roomy ? state.underWindows + 1 : 0

  const lowest = policy.rungs.length - 1
  if (overWindows >= policy.dropAfterWindows && state.rung < lowest) {
    return { rung: state.rung + 1, overWindows: 0, underWindows: 0 }
  }
  if (underWindows >= policy.climbAfterWindows && state.rung > 0) {
    return { rung: state.rung - 1, overWindows: 0, underWindows: 0 }
  }
  return { rung: state.rung, overWindows, underWindows }
}

/**
 * Pixels a frame costs at a given ratio — the quantity the ladder is actually
 * spending, and the one that carries from this desktop to a phone when a
 * millisecond does not.
 */
export function framePixels(cssWidth: number, cssHeight: number, dpr: number): number {
  return cssWidth * dpr * cssHeight * dpr
}
