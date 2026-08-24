import { describe, expect, it } from 'vitest'
import { EMPTY_FRAME, frameCost, lastPassOnly, readFrame, type RenderPass } from './frameCounters'
import { BUDGET_MOBILE, overBudget } from '../config/perf'

/**
 * THE INSTRUMENT LIED WHERE THE MODEL WAS HEAVIEST.
 *
 * Measured in the orbit view, 2026-08-24. The F3 readout said "draw calls 9 / 60"
 * and "triangles 40 / 350,000"; an honest re-render from the same camera
 * (`window.__perf()`, one `gl.render` of the scene alone) gave 86 calls and
 * 114,052 triangles. Both figures were true readings of a WebGLRenderer — of
 * different passes.
 *
 * The orbit frame is TWO passes. drei's GizmoHelper is a Hud: it takes over the
 * render loop at priority 1, draws the scene, clears the depth buffer and draws
 * its own little scene of axes on top. three resets `info.render` at the head of
 * every `render()` when `autoReset` is on, so what stands at the end of the
 * frame is the gizmo's pass and nothing else.
 */
const SCENE_PASS: RenderPass = { label: 'scene', calls: 86, triangles: 114_052 }
const GIZMO_PASS: RenderPass = { label: 'gizmo', calls: 9, triangles: 40 }

const ORBIT_FRAME: readonly RenderPass[] = [SCENE_PASS, GIZMO_PASS]

/**
 * Walking, the gizmo is not mounted, so r3f draws the scene itself and the frame
 * is one pass. That is the whole reason the HUD told the truth in walk mode and
 * only there — not because walk mode was measured more carefully.
 */
const SINGLE_PASS_FRAME: readonly RenderPass[] = [SCENE_PASS]

describe('what a frame costs', () => {
  it('is every pass the frame submitted, counted once', () => {
    expect(frameCost(ORBIT_FRAME)).toEqual({ calls: 95, triangles: 114_092, passes: 2 })
  })

  it('counts nothing as nothing', () => {
    expect(frameCost([])).toEqual(EMPTY_FRAME)
  })

  it('agrees with the last-pass reading when the frame has one pass', () => {
    // the fix changes no figure in walk mode, which is the check that it is a
    // repair of the reading and not a new number
    expect(frameCost(SINGLE_PASS_FRAME)).toEqual(lastPassOnly(SINGLE_PASS_FRAME))
  })
})

describe('the reading the readout was taking', () => {
  it('reports the gizmo and calls it the scene', () => {
    expect(lastPassOnly(ORBIT_FRAME)).toEqual({ calls: 9, triangles: 40, passes: 2 })
  })

  it('understates the frame by an order of magnitude', () => {
    const read = lastPassOnly(ORBIT_FRAME)
    const truth = frameCost(ORBIT_FRAME)
    expect(read.calls / truth.calls).toBeLessThan(0.1)
    expect(read.triangles / truth.triangles).toBeLessThan(0.001)
  })
})

/**
 * The point of the repair, stated against the budget itself: a mobile phone is
 * held to 60 draw calls, the orbit frame submits 95, and the readout whose job
 * is to say so was reporting a figure that could never cross the line. A budget
 * that cannot be enforced where it is broken is not a budget.
 */
describe('the budget can see the break', () => {
  it('does not, from the last pass alone', () => {
    expect(overBudget(lastPassOnly(ORBIT_FRAME).calls, BUDGET_MOBILE.drawCalls)).toBe(false)
  })

  it('does, from the frame', () => {
    expect(overBudget(frameCost(ORBIT_FRAME).calls, BUDGET_MOBILE.drawCalls)).toBe(true)
  })

  it('leaves the triangle line under its ceiling either way', () => {
    // said out loud so a later reader does not take the red draw-call figure as
    // a claim about triangles: 114,092 against 350,000 is not the problem
    expect(overBudget(frameCost(ORBIT_FRAME).triangles, BUDGET_MOBILE.triangles)).toBe(false)
  })
})

describe('reading three’s own counter', () => {
  it('takes the pass count from the render() counter’s delta', () => {
    expect(readFrame({ calls: 95, triangles: 114_092, frame: 12 }, 10)).toEqual({
      calls: 95,
      triangles: 114_092,
      passes: 2,
    })
  })

  it('reports no passes rather than negative ones when the counter restarts', () => {
    // a lost-and-restored WebGL context rebuilds WebGLInfo from zero, so the
    // delta against a reading taken before the loss is negative
    expect(readFrame({ calls: 0, triangles: 0, frame: 0 }, 4_211).passes).toBe(0)
  })
})
