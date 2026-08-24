import { useEffect, useLayoutEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

/**
 * Phase-11 spec: Suspense plus a loading indicator.
 *
 * The tower is procedural, so there are no meshes to download — what the viewer
 * actually waits for is the first CSG evaluation of the shell, which is a second
 * or two of solid work. Showing nothing during that reads as a hang, which is
 * the thing worth fixing. (It used to be the physics WASM as well; that is now
 * fetched on the walk button instead — components/physics/lazyPhysics.tsx.)
 *
 * THIS SPLASH IS THE SECOND ONE THE VISITOR SEES, and it is deliberately the
 * same picture as the first. index.html paints an inline copy — same ground,
 * same name, same 220 px rule — from the moment the document arrives, because
 * this component cannot appear until the bundle has been fetched and run. The
 * effect below is the handover.
 */
export function LoadingScreen() {
  const { progress, active } = useProgress()
  const [done, setDone] = useState(false)

  /*
   * Take down the inline splash, in a LAYOUT effect and not a passive one.
   * useLayoutEffect runs before the browser paints the commit that mounted this
   * component, so the first frame that shows React's splash is the first frame
   * without the static one: no flash of two bars, and no gap of bare
   * background between them. A passive effect would run after that paint.
   */
  useLayoutEffect(() => {
    document.getElementById('boot')?.remove()
  }, [])

  // The tower is procedural, so drei's loader may never activate at all. Give it
  // a moment to report, then get out of the way — a splash that never lifts is
  // worse than no splash.
  useEffect(() => {
    const timer = window.setTimeout(() => setDone(true), 900)
    return () => window.clearTimeout(timer)
  }, [])

  if (done && !active) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: '#0e1116',
        color: '#dfe6ee',
        font: '13px/1.6 ui-monospace, monospace',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <div style={{ letterSpacing: '.06em' }}>Qız Qalası</div>
      <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,.14)', borderRadius: 2 }}>
        <div
          style={{
            width: `${Math.max(6, progress)}%`,
            height: '100%',
            background: '#c8d6e5',
            borderRadius: 2,
            transition: 'width .2s ease-out',
          }}
        />
      </div>
      <div style={{ color: '#7d8794', fontSize: 11 }}>{Math.round(progress)}%</div>
    </div>
  )
}
