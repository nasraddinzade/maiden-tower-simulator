import { describe, expect, it } from 'vitest'
import {
  INITIAL_LADDER,
  dprAtRung,
  framePixels,
  initialDpr,
  medianFrameMs,
  stepLadder,
  type DprLadderState,
} from './adaptiveDpr'
import { DPR_DESKTOP, DPR_MOBILE } from '../config/perf'

const M = DPR_MOBILE
const REFRESH_60 = 1000 / 60

/** Feed the ladder a run of identical decision windows. */
function run(state: DprLadderState, ms: number, windows: number, policy = M): DprLadderState {
  let s = state
  for (let i = 0; i < windows; i++) s = stepLadder(s, ms, policy)
  return s
}

describe('the cap', () => {
  it('holds a phone reporting 3 to the ceiling, which is what r3f was already doing', () => {
    expect(initialDpr(3, M)).toBe(2)
    expect(initialDpr(2, M)).toBe(2)
  })

  it('never invents resolution a display does not have', () => {
    expect(initialDpr(1, M)).toBe(1)
    expect(initialDpr(1.5, M)).toBe(1.5)
  })

  it('is the same ceiling on both profiles — a strong phone keeps the sharp image', () => {
    expect(DPR_MOBILE.ceiling).toBe(DPR_DESKTOP.ceiling)
  })
})

describe('the rungs', () => {
  it('are the addendum’s ladder: full, three quarters, three fifths', () => {
    expect([...M.rungs]).toEqual([1, 0.75, 0.6])
  })

  it('scale the capped ratio, so a phone at 3 steps 2 → 1.5 → 1.2', () => {
    expect(dprAtRung(0, 3, M)).toBe(2)
    expect(dprAtRung(1, 3, M)).toBe(1.5)
    expect(dprAtRung(2, 3, M)).toBeCloseTo(1.2, 10)
  })

  it('stop at the floor rather than below it', () => {
    // a 1× display: the ladder would ask for 0.6, the floor allows 0.75
    expect(dprAtRung(2, 1, DPR_MOBILE)).toBe(0.75)
    // and a desktop is not allowed under native at all
    expect(dprAtRung(2, 1, DPR_DESKTOP)).toBe(1)
  })

  it('clamp an index past the end of the ladder instead of returning NaN', () => {
    expect(dprAtRung(9, 3, M)).toBe(dprAtRung(M.rungs.length - 1, 3, M))
    expect(dprAtRung(-4, 3, M)).toBe(dprAtRung(0, 3, M))
  })

  it('one rung removes 43.8% of the pixels, two removes 64.0%', () => {
    const full = framePixels(412, 915, dprAtRung(0, 3, M))
    const one = framePixels(412, 915, dprAtRung(1, 3, M))
    const two = framePixels(412, 915, dprAtRung(2, 3, M))
    expect((1 - one / full) * 100).toBeCloseTo(43.75, 2)
    expect((1 - two / full) * 100).toBeCloseTo(64.0, 2)
  })
})

describe('vsync, which is why the thresholds are not the budget', () => {
  it('leaves a desktop holding a perfect 60 fps alone', () => {
    // 16.67 ms IS 60 fps and it is over the 16 ms budget on every frame;
    // comparing against the budget would walk a healthy machine to the floor
    const s = run(INITIAL_LADDER, REFRESH_60, 50, DPR_DESKTOP)
    expect(s.rung).toBe(0)
  })

  it('acts when that desktop starts skipping a refresh', () => {
    expect(run(INITIAL_LADDER, REFRESH_60 * 2, 2, DPR_DESKTOP).rung).toBe(1)
  })

  it('leaves a phone holding 30 fps alone, and acts when it drops to 20', () => {
    expect(run(INITIAL_LADDER, REFRESH_60 * 2, 50, M).rung).toBe(0)
    expect(run(INITIAL_LADDER, REFRESH_60 * 3, 2, M).rung).toBe(1)
  })

  it('brackets the target period: hitting it is roomy, missing it by one refresh fails', () => {
    for (const [p, refreshesPerFrame] of [
      [DPR_DESKTOP, 1],
      [DPR_MOBILE, 2],
    ] as const) {
      const target = REFRESH_60 * refreshesPerFrame
      expect(p.climbBelowMs).toBeGreaterThan(target)
      expect(p.dropAboveMs).toBeLessThan(target + REFRESH_60)
      expect(p.dropAboveMs).toBeGreaterThan(p.climbBelowMs)
    }
  })
})

describe('stepping down', () => {
  it('does nothing on a single bad window — one hitch is not a verdict', () => {
    const s = stepLadder(INITIAL_LADDER, 60, M)
    expect(s.rung).toBe(0)
    expect(s.overWindows).toBe(1)
  })

  it('drops a rung once the frame is stably failing', () => {
    expect(run(INITIAL_LADDER, 60, M.dropAfterWindows).rung).toBe(1)
  })

  it('keeps dropping while it stays over, and stops at the last rung', () => {
    const s = run(INITIAL_LADDER, 90, 40)
    expect(s.rung).toBe(M.rungs.length - 1)
  })

  it('forgets the bad windows as soon as one window fits', () => {
    let s = stepLadder(INITIAL_LADDER, 60, M)
    s = stepLadder(s, 20, M)
    expect(s.overWindows).toBe(0)
    expect(s.rung).toBe(0)
  })
})

describe('climbing back', () => {
  const dropped = run(INITIAL_LADDER, 90, 4)

  it('needs room to spare, not merely a frame that has stopped failing', () => {
    // 40 ms is under the phone's 41.7 ms failure line and still 24 fps;
    // climbing from there puts the frame straight back over, which rings
    const s = run(dropped, 40, 20)
    expect(s.rung).toBe(dropped.rung)
  })

  it('climbs when the frame has a refresh interval in hand', () => {
    const s = run(dropped, REFRESH_60, M.climbAfterWindows)
    expect(s.rung).toBe(dropped.rung - 1)
  })

  it('climbs one rung at a time, never straight back to full', () => {
    let s = run(INITIAL_LADDER, 90, 40)
    expect(s.rung).toBe(2)
    s = run(s, 5, M.climbAfterWindows)
    expect(s.rung).toBe(1)
  })

  it('is slower to climb than to fall — a resize costs more than a rung', () => {
    expect(M.climbAfterWindows).toBeGreaterThan(M.dropAfterWindows)
  })

  it('cannot climb above full sharpness', () => {
    expect(run(INITIAL_LADDER, 1, 100).rung).toBe(0)
  })
})

describe('the decision window', () => {
  it('takes the median, so one long frame in thirty decides nothing', () => {
    const window = Array.from({ length: 30 }, (_, i) => (i === 7 ? 300 : 12))
    expect(medianFrameMs(window)).toBe(12)
  })

  it('averages the middle pair on an even window', () => {
    expect(medianFrameMs([10, 20, 30, 40])).toBe(25)
  })

  it('reports nothing rather than NaN for an empty window', () => {
    expect(medianFrameMs([])).toBe(0)
  })

  it('is long enough to see a stable failure and short enough to answer it', () => {
    // one decision is windowFrames frames; dropAfterWindows of them drop a rung
    const secondsToFirstDrop = (M.windowFrames * M.dropAfterWindows) / 30
    expect(secondsToFirstDrop).toBeLessThanOrEqual(2)
  })
})
