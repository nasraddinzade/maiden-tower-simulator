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

/**
 * Payload targets, bytes. Checked at build time, not at runtime — and now
 * actually checked: vite.config.ts runs lib/bootBudget.ts over the emitted
 * bundle and fails the build. It said "checked at build time" for months while
 * nothing read it, which is how 906 kB of physics engine came to be downloaded
 * before the first pixel of a view that has no physics in it.
 */
export const PAYLOAD_BUDGET = {
  /**
   * Everything the first paint waits on, DECOMPRESSED. Straight out of
   * docs/optimization-addendum.md («вес первой загрузки < 6 МБ»), whose
   * reference point is Messenger at 5.7 MB for an entire multiplayer world.
   *
   * IT NEVER CAUGHT ANYTHING, and that is worth writing down rather than
   * quietly retuning: the eager set was 4 528 kB with the whole of rapier in
   * it, comfortably inside 6 MB, so the budget said the page was fine while a
   * phone sat on a blank screen. A ceiling this far above the measurement is a
   * ceiling that only notices a catastrophe.
   */
  firstLoadBytes: 6 * 1024 * 1024,
  /**
   * The same set as it crosses the wire, gzipped — the number a visitor on a
   * phone actually waits for, and the sharp one.
   *
   * 750 kB is the measurement plus a quarter, not a round figure chosen for
   * comfort: the eager set is 608 kB after this change, and a budget set at
   * arm's length is the mistake above repeated. Anything that pushes the first
   * paint past three quarters of a megabyte has to be argued for in the diff
   * that does it.
   */
  firstLoadTransferBytes: 750_000,
  /**
   * Packages that must be reachable only through an `import()`. Matched against
   * module ids, because chunk NAMES lie — the hand-written chunk map this repo
   * used to carry produced a chunk called `physics` holding react and one
   * called `csg` holding the whole of three.js.
   */
  deferredPackages: [
    { name: 'rapier (physics)', marker: '@dimforge/rapier3d-compat' },
    { name: 'rapier (react bindings)', marker: '@react-three/rapier' },
    { name: 'WebXR', marker: '@react-three/xr' },
    { name: 'the XR emulator', marker: '@iwer/' },
  ],
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
