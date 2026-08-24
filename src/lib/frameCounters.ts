/**
 * What a frame cost, and where in the frame that question has an answer.
 *
 * `gl.info.render` is not a per-frame counter. three resets it at the head of
 * every `WebGLRenderer.render()` when `info.autoReset` is on (three 0.185,
 * WebGLRenderer.render: `this.info.render.frame ++; if (this.info.autoReset ===
 * true) this.info.reset();`), so what it holds is the cost of the LAST pass —
 * and a frame is only one pass when nothing has taken the render loop over.
 *
 * Something had. drei's GizmoHelper is a Hud, which subscribes at r3f priority 1
 * and, because any subscriber with a positive priority stops r3f rendering by
 * itself (@react-three/fiber, `if (!state.internal.priority) state.gl.render(…)`),
 * becomes responsible for drawing the scene: it renders the scene, clears the
 * depth buffer, and renders its own scene of axes. Two passes. The counters left
 * standing at the end describe the second one — nine draw calls of coloured
 * cones in the corner — and that is the figure the F3 readout was showing
 * against a 60-call budget for a 95-call frame.
 *
 * The arithmetic here is the difference between those two readings, kept where
 * it can be asserted rather than inside a component that CLAUDE.md rule 6 keeps
 * out of the suite.
 */

/** One `render()` call's contribution to a frame. */
export interface RenderPass {
  /** What submitted it. Carried for reading, not used in the arithmetic. */
  label: string
  calls: number
  triangles: number
}

/** A whole frame, however many passes it was made of. */
export interface FrameCounters {
  calls: number
  triangles: number
  /** How many `render()` calls the frame was made of. */
  passes: number
}

export const EMPTY_FRAME: FrameCounters = { calls: 0, triangles: 0, passes: 0 }

/**
 * Everything the frame submitted.
 *
 * A draw call is a draw call whoever asked for it: the budget in
 * docs/optimization-addendum.md is a statement about what the GPU is handed in a
 * frame, so a second pass is part of the frame's cost and not an exemption from
 * it. Under the fix in components/ui/PerfHud.tsx the renderer accumulates this
 * for us — `info.autoReset` is turned off and the counters are cleared once per
 * frame instead of once per pass — so this function is the model that says what
 * that arrangement is supposed to produce.
 */
export function frameCost(passes: readonly RenderPass[]): FrameCounters {
  return passes.reduce<FrameCounters>(
    (total, p) => ({
      calls: total.calls + p.calls,
      triangles: total.triangles + p.triangles,
      passes: total.passes + 1,
    }),
    EMPTY_FRAME,
  )
}

/**
 * What a reader sees who reads the counters after the frame with three's own
 * per-pass reset left on: the last pass, alone.
 *
 * Kept, and named, because it is not a hypothetical — it is what the readout
 * reported for as long as the gizmo was mounted, and a rule with a name is a
 * rule a later change cannot re-introduce by accident.
 */
export function lastPassOnly(passes: readonly RenderPass[]): FrameCounters {
  const last = passes[passes.length - 1]
  if (!last) return EMPTY_FRAME
  return { calls: last.calls, triangles: last.triangles, passes: passes.length }
}

/** One reading of three's `WebGLInfo.render`. */
export interface InfoRender {
  calls: number
  triangles: number
  /** three's own `render()` counter. It counts PASSES, not frames. */
  frame: number
}

/**
 * A frame's cost from one reading of the renderer's counters plus the value its
 * pass counter held when they were last cleared.
 *
 * `info.render.frame` increments on every `render()` and is NOT touched by
 * `info.reset()`, so its delta since the clear is exactly how many passes the
 * accumulated figures cover. The clamp is for a lost and restored WebGL
 * context: `initGLContext()` builds a fresh WebGLInfo whose counter starts at
 * zero again, which would otherwise report a negative number of passes.
 */
export function readFrame(now: InfoRender, frameAtClear: number): FrameCounters {
  return {
    calls: now.calls,
    triangles: now.triangles,
    passes: Math.max(0, now.frame - frameAtClear),
  }
}

/**
 * r3f frame priority for the probe that clears and reads the counters.
 *
 * NEGATIVE, and both halves of that matter. r3f sorts `useFrame` subscribers
 * ascending and runs them before its own render, so a negative priority is the
 * only point in a frame guaranteed to come before every pass in it — including
 * the gizmo's, which runs at 1. And it must not be POSITIVE: r3f counts
 * subscribers with `priority > 0` and stops rendering the scene itself when
 * there are any, so a probe that asked to run last would silently blank the
 * canvas in walk mode, where nothing else has taken the loop over.
 */
export const COUNTER_CLEAR_PRIORITY = -1
