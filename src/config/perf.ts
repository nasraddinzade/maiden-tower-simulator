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

// ————————————————————————— pixel ratio —————————————————————————

/**
 * How many device pixels the renderer is allowed per CSS pixel, and how far it
 * may back off when the frame stops fitting.
 *
 * THE CEILING WAS ALREADY IN FORCE AND NOBODY HAD WRITTEN IT DOWN, which is the
 * only reason this block reads as a change. `<Canvas>` defaults to `dpr={[1,2]}`
 * and r3f resolves it as `Math.min(Math.max(1, devicePixelRatio), 2)`
 * (@react-three/fiber, calculateDpr) — so a phone reporting 3 has been drawing
 * FOUR times a logical screen, not nine, and point 3 of the optimisation
 * addendum ("Ограничь Math.min(devicePixelRatio, 2)") was being satisfied by a
 * dependency's default rather than by a decision. Measured in the browser with
 * devicePixelRatio forced to 3: CSS box 375×812, drawing buffer 750×1624,
 * gl.getPixelRatio() → 2. Naming the number here changes no pixel today and
 * makes a dependency bump unable to change one tomorrow.
 *
 * WHAT WAS GENUINELY MISSING is the second half of that point: "если кадр
 * стабильно > 33 мс, снижай масштаб рендера до 0.75, потом до 0.6". `rungs` is
 * that ladder, verbatim, as fractions of the capped ratio; nothing in `src/`
 * measured a frame against a budget and acted on it before.
 *
 * Pixels are the one cost that scales with nothing else in this model: the
 * masonry is a fragment shader with no textures behind it, so a pixel not drawn
 * is the whole of that shader not run. Dropping one rung on a phone at
 * devicePixelRatio ≥ 2 removes 43.8% of the pixels in the frame (2.00² → 1.50²),
 * two rungs removes 64.0%.
 */
export interface DprPolicy {
  /** Never draw more device pixels per CSS pixel than this. */
  ceiling: number
  /** Never draw fewer than this, however long the frames get. */
  floor: number
  /** Render scale rungs, as fractions of the capped device ratio. */
  rungs: readonly number[]
  /** Frames medianed into one decision. */
  windowFrames: number
  /** Median frame time above which a window counts as a failure, ms. */
  dropAboveMs: number
  /** Median frame time below which a window counts as having room to spare, ms. */
  climbBelowMs: number
  /** Consecutive failing windows before dropping a rung. */
  dropAfterWindows: number
  /** Consecutive roomy windows before climbing back. */
  climbAfterWindows: number
}

/**
 * THE THRESHOLDS ARE NOT THE BUDGET, and the difference is vsync.
 *
 * A vsynced renderer cannot produce an arbitrary frame time. On a 60 Hz display
 * it produces 16.67 ms, or 33.33, or 50.00 — one, two or three refresh
 * intervals — and nothing in between. So a desktop holding a perfect 60 fps
 * MEASURES 16.67 against a 16 ms budget and is over it on every single frame:
 * a controller that compared the measurement with the budget would walk the
 * image down to the floor on a machine that was never in trouble.
 *
 * The thresholds below therefore sit BETWEEN adjacent refresh multiples, where
 * jitter cannot reach them:
 *
 *   target        holds at      fails at      drop above           climb below
 *   60 fps        16.67 ms      33.33 ms      25.0 = 1.5 × 16.67   17.5 = 1.05 ×
 *   30 fps        33.33 ms      50.00 ms      41.7 = 2.5 × 16.67   35.0 = 1.05 ×
 *
 * `frameMs` in the budgets above stays what it was — the figure the F3 readout
 * turns red against, which is a statement of intent and is read by a human who
 * can tell 16.67 from a stall. This is the figure a controller acts on alone.
 */
const REFRESH_60 = 1000 / 60

/**
 * Desktop. The floor is 1: a desktop screen is read at arm's length and a ratio
 * under 1 is visible as blur on text and on the masonry's course lines, which is
 * a worse trade than dropping to 40 fps on a machine that is not a phone.
 */
export const DPR_DESKTOP: DprPolicy = {
  ceiling: 2,
  floor: 1,
  rungs: [1, 0.75, 0.6],
  windowFrames: 30,
  dropAboveMs: REFRESH_60 * 1.5,
  climbBelowMs: REFRESH_60 * 1.05,
  dropAfterWindows: 2,
  climbAfterWindows: 6,
}

/**
 * Mobile. Same ceiling — a strong phone should still get the sharp image, which
 * is the whole reason the cap is adaptive rather than one hard number — and a
 * lower floor, because the phone is the device where the alternative to a soft
 * image is a walk that does not answer the thumb.
 */
export const DPR_MOBILE: DprPolicy = {
  ...DPR_DESKTOP,
  floor: 0.75,
  dropAboveMs: REFRESH_60 * 2.5,
  climbBelowMs: REFRESH_60 * 2 * 1.05,
}

export function activeDprPolicy(): DprPolicy {
  return isMobileProfile() ? DPR_MOBILE : DPR_DESKTOP
}
