import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  INITIAL_LADDER,
  dprAtRung,
  medianFrameMs,
  stepLadder,
  type DprLadderState,
} from '../../lib/adaptiveDpr'
import { activeDprPolicy } from '../../config/perf'

export interface AdaptiveDprProps {
  /**
   * Where to send a changed ratio. It has to leave the Canvas: see below.
   */
  onRatio: (dpr: number) => void
  /** Rung changes are announced here too, for the F3 readout. */
  onRung?: (rung: number) => void
}

/**
 * Watches the frame and walks the pixel ratio down when it stops fitting.
 *
 * All the policy is in lib/adaptiveDpr.ts and config/perf.ts; this holds a ring
 * of frame times, hands one median per window to the ladder, and reports the
 * ratio it asks for. It draws nothing.
 *
 * IT REPORTS UPWARD INSTEAD OF CALLING setDpr, and that is not a style choice.
 * r3f re-applies the `dpr` prop from `<Canvas>` on every render of that element
 * — `configure()` compares `state.viewport.dpr` with `calculateDpr(dpr)` and
 * resets it when they differ — and this app re-renders `<Canvas>` about once a
 * second, because PerfProbe pushes a sample to the HUD's state that often. A
 * controller that called `setDpr` from in here would therefore be undone within
 * the second, silently, and only on the machines slow enough to need it. The
 * ratio has to live in the state that feeds the prop, so App owns it and this
 * asks.
 *
 * THE FIRST WINDOW IS THROWN AWAY. Shader compilation, the CSG evaluator and the
 * first upload of every geometry all land in the opening second, and they are
 * not the steady state the ladder is meant to judge. Neither is a frame that
 * arrives after the tab was hidden, which is why samples longer than
 * `STALL_MS` are dropped rather than medianed: a 4-second delta is not a slow
 * frame, it is no frame at all.
 */
const STALL_MS = 250

export function AdaptiveDpr({ onRatio, onRung }: AdaptiveDprProps) {
  const policy = useRef(activeDprPolicy()).current
  const samples = useRef<number[]>([])
  const ladder = useRef<DprLadderState>(INITIAL_LADDER)
  const windowsSeen = useRef(0)

  useFrame((_, delta) => {
    const ms = delta * 1000
    if (ms > STALL_MS) return
    samples.current.push(ms)
    if (samples.current.length < policy.windowFrames) return

    const median = medianFrameMs(samples.current)
    samples.current.length = 0
    windowsSeen.current += 1
    if (windowsSeen.current === 1) return

    const next = stepLadder(ladder.current, median, policy)
    if (next.rung === ladder.current.rung) {
      ladder.current = next
      return
    }
    ladder.current = next
    const device = typeof window === 'undefined' ? 1 : window.devicePixelRatio
    onRatio(dprAtRung(next.rung, device, policy))
    onRung?.(next.rung)
  })

  return null
}
