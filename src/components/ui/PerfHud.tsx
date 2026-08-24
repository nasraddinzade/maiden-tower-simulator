import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { activeBudget, activeDprPolicy, overBudget } from '../../config/perf'
import { COUNTER_CLEAR_PRIORITY, EMPTY_FRAME, readFrame, type FrameCounters } from '../../lib/frameCounters'

export interface PerfSample {
  fps: number
  frameMs: number
  drawCalls: number
  triangles: number
  /** How many render passes those figures cover. See PerfProbe. */
  passes: number
  programs: number
  geometries: number
  textures: number
}

export interface PerfProbeProps {
  onSample: (s: PerfSample) => void
}

/**
 * Reads the renderer's own counters once a second.
 *
 * Lives inside the Canvas because that is the only place `gl.info` is reachable;
 * the readout itself is DOM, so measuring costs no draw calls of its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE COUNTERS ARE READ, AND WHY THAT POINT AND NOT ANOTHER.
 *
 * They used to be read here, in an ordinary `useFrame`, straight off
 * `gl.info.render`. In walk mode that is correct and in the orbit view it was
 * off by an order of magnitude: F3 reported 9 draw calls and 40 triangles for a
 * frame that submitted 95 and 114,092. Measured 2026-08-24.
 *
 * Neither figure was a bug in the counting. three clears `info.render` at the
 * head of every `render()` while `info.autoReset` is on, so the counters
 * describe ONE PASS, and the orbit frame has two: drei's GizmoHelper is a Hud,
 * it takes the render loop over at r3f priority 1, draws the scene, clears the
 * depth buffer and draws its own corner scene of axes. What stood at the end of
 * the frame was the corner. In walk mode the gizmo is not mounted, r3f renders
 * the scene itself, one pass, and the same read told the truth — which is why
 * the readout looked reliable exactly where the model is cheapest and lied
 * exactly where it is heaviest.
 *
 * So the counters are now cleared ONCE PER FRAME rather than once per pass
 * (`info.autoReset = false`, which is what three documents that switch for), and
 * read at the top of the following frame, before anything in it has drawn:
 *
 *   · not after the last pass — r3f only allows that at a POSITIVE frame
 *     priority, and a positive priority makes r3f stop rendering the scene
 *     itself, which would blank the canvas in walk mode where nothing else
 *     renders. See COUNTER_CLEAR_PRIORITY.
 *   · not after the scene's own pass — there is no hook between passes, and a
 *     figure that skipped the second pass would be a budget that excuses
 *     whatever it does not like the look of. The GPU is handed the gizmo's nine
 *     calls the same as the tower's eighty-six.
 *   · not by re-rendering the scene to measure it, the way `__perf` below does
 *     — that answers a different question (what one pass of the scene costs
 *     from this camera) and it answers it by doing the work twice, every second,
 *     on the phone whose frame time is being measured.
 *
 * The top of the frame is the one place a single hook sees a whole frame: every
 * pass of the previous one, counted once, in the order the GPU actually got
 * them. The figure is therefore a real frame's real cost, one frame stale.
 */
export function PerfProbe({ onSample }: PerfProbeProps) {
  const { gl, scene, camera } = useThree()
  const frames = useRef(0)
  const elapsed = useRef(0)
  /** The last complete frame, all passes. */
  const lastFrame = useRef<FrameCounters>(EMPTY_FRAME)
  /** three's pass counter as it stood when the figures were last cleared. */
  const passesAtClear = useRef(0)

  useEffect(() => {
    const previous = gl.info.autoReset
    gl.info.autoReset = false
    passesAtClear.current = gl.info.render.frame
    return () => {
      gl.info.autoReset = previous
    }
  }, [gl])

  useFrame(() => {
    lastFrame.current = readFrame(gl.info.render, passesAtClear.current)
    passesAtClear.current = gl.info.render.frame
    gl.info.reset()
  }, COUNTER_CLEAR_PRIORITY)

  // Dev-only handle: lets a headless check force one frame and read the
  // renderer's counters, which is otherwise impossible when the page is not
  // compositing (no rAF ⇒ no useFrame ⇒ no samples).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__perf = () => {
      // clears explicitly: `autoReset` is off while the probe is mounted, and
      // this handle exists to measure ONE pass of the scene on its own
      gl.info.reset()
      gl.render(scene, camera)
      let meshes = 0
      scene.traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh && o.visible) meshes += 1
      })
      return {
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        meshesInScene: meshes,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
      }
    }
    // The scene itself, for inspecting what is actually being drawn where. R3F
    // stops exposing its store on the canvas element, so there is no other way
    // in from the console.
    ;(window as unknown as Record<string, unknown>).__scene = scene
    // Renderer and camera as well, for the same reason and one more: a GPU timer
    // query has to bracket a real `gl.render`, and the camera has to be moved to
    // the place being measured. Both are unreachable from outside r3f otherwise.
    ;(window as unknown as Record<string, unknown>).__gfx = { gl, scene, camera }
  }, [gl, scene, camera])

  useFrame((_, delta) => {
    frames.current += 1
    elapsed.current += delta
    if (elapsed.current < 1) return

    const fps = frames.current / elapsed.current
    onSample({
      fps,
      frameMs: 1000 / Math.max(fps, 0.001),
      drawCalls: lastFrame.current.calls,
      triangles: lastFrame.current.triangles,
      passes: lastFrame.current.passes,
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    })
    frames.current = 0
    elapsed.current = 0
  })

  return null
}

export interface PerfHudProps {
  sample: PerfSample | null
  /** A snapshot to compare against, so the before/after is visible in the app. */
  baseline: PerfSample | null
  /**
   * Live device pixels per CSS pixel. Shown because it MOVES now: the ladder in
   * lib/adaptiveDpr.ts lowers it when the frame stops fitting, and a frame time
   * that improved because the image got softer is a different fact from one that
   * improved because there was less to draw. Without this line the two are
   * indistinguishable in this readout.
   */
  dpr: number
  onCapture: () => void
  onClear: () => void
}

const fmt = (n: number) => n.toLocaleString('en-US')

function Delta({ now, was, lowerIsBetter = true }: { now: number; was: number; lowerIsBetter?: boolean }) {
  if (!was) return null
  const change = ((now - was) / was) * 100
  const good = lowerIsBetter ? change < -1 : change > 1
  const bad = lowerIsBetter ? change > 1 : change < -1
  return (
    <span style={{ color: good ? '#8fd9a8' : bad ? '#e8a0a0' : '#93a1b3' }}>
      {' '}
      {change >= 0 ? '+' : ''}
      {change.toFixed(0)}%
    </span>
  )
}

/**
 * The budget readout, F3.
 *
 * docs/optimization-addendum.md asks for this from Phase 1: the live counters
 * against the target, and the figure red when it is over. Which target depends
 * on the device — a phone is held to half the draw calls and a third of the
 * triangles of a desktop.
 *
 * The counters are a whole frame, every pass of it — see PerfProbe for how long
 * that was not true and where it stopped being true.
 */
export function PerfHud({ sample, baseline, dpr, onCapture, onClear }: PerfHudProps) {
  const [open, setOpen] = useState(true)
  const budget = { ...activeBudget(), dprCeiling: activeDprPolicy().ceiling }
  if (!sample) return null

  const over = (v: number, limit: number) =>
    overBudget(v, limit) ? { color: '#ff6b6b', fontWeight: 700 as const } : undefined
  const limitNote = (limit: number) => (
    <span style={{ color: '#6f7885' }}> / {fmt(limit)}</span>
  )

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 21,
        font: '11px/1.5 ui-monospace, monospace',
        color: '#dfe6ee',
        background: 'rgba(12,14,18,.86)',
        border: '1px solid rgba(255,255,255,.14)',
        borderRadius: 6,
        padding: '6px 9px',
        minWidth: 210,
      }}
    >
      <div
        style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {sample.fps.toFixed(0)} fps ·{' '}
          <span style={over(sample.frameMs, budget.frameMs)}>{sample.frameMs.toFixed(1)} ms</span>
          {limitNote(budget.frameMs)}
        </span>
        <span style={{ color: '#7d8794' }}>{open ? '−' : '+'}</span>
      </div>

      {open && (
        <>
          <div>
            draw calls <b style={over(sample.drawCalls, budget.drawCalls)}>{fmt(sample.drawCalls)}</b>
            {limitNote(budget.drawCalls)}
            {baseline && <Delta now={sample.drawCalls} was={baseline.drawCalls} />}
            {/*
              WHAT THE FIGURE COVERS, shown only when it is more than the obvious
              one pass. Without it the orbit view's number looks like a
              regression against walk mode rather than a second pass being
              counted at last — the difference this readout exists to tell.
            */}
            {sample.passes > 1 && (
              <span style={{ color: '#6f7885' }}> · {sample.passes} passes</span>
            )}
          </div>
          <div>
            triangles <b style={over(sample.triangles, budget.triangles)}>{fmt(sample.triangles)}</b>
            {limitNote(budget.triangles)}
            {baseline && <Delta now={sample.triangles} was={baseline.triangles} />}
          </div>
          <div style={{ color: '#93a1b3' }}>
            geom {sample.geometries} · tex {sample.textures} · prog {sample.programs}
          </div>
          <div style={{ color: dpr < budget.dprCeiling ? '#e8c98a' : '#93a1b3' }}>
            dpr {dpr.toFixed(2)}
            <span style={{ color: '#6f7885' }}> / {budget.dprCeiling}</span>
          </div>

          {baseline && (
            <div style={{ marginTop: 4, color: '#93a1b3', borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 4 }}>
              baseline: {baseline.frameMs.toFixed(1)} ms · {fmt(baseline.drawCalls)} calls ·{' '}
              {fmt(baseline.triangles)} tris
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            <button onClick={onCapture} style={btn}>
              baseline
            </button>
            <button onClick={onClear} style={btn} disabled={!baseline}>
              clear
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const btn: React.CSSProperties = {
  font: '10px ui-monospace, monospace',
  color: '#dfe6ee',
  background: 'rgba(255,255,255,.08)',
  border: '1px solid rgba(255,255,255,.18)',
  borderRadius: 4,
  padding: '2px 7px',
  cursor: 'pointer',
}
