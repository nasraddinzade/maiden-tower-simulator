import { useEffect, useRef } from 'react'
import { TOUCH } from '../../config/player'
import { inThumbZone, stickVector, type Stick } from '../../lib/touchInput'

export interface TouchControlsProps {
  /**
   * The canvas the touches are read from. NOT `window`, and that is the whole
   * of the panel bug: the Phase-6 stick listened on the window, so a thumb
   * landing on the hypothesis panel — 66% of a phone screen — drove the walker
   * as well as the panel. Listening on the canvas means a tap on a panel is a
   * tap on a panel, with no hit-testing of our own to keep in step with the UI.
   *
   * Passed as an element rather than a ref so that mounting order cannot leave
   * this effect looking at a `null` that will never be re-read.
   */
  canvas: HTMLCanvasElement | null
  /** The stick's deflection while a thumb steers; null when none is down. */
  stickRef: React.RefObject<Stick | null>
  /** Accumulated look delta in CSS px; the player consumes and zeroes it. */
  lookRef: React.RefObject<{ dx: number; dy: number }>
}

/**
 * Touch controls for walking, 2026-08-23.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * TWO THUMBS, TRACKED BY POINTER ID, OR IT IS NOT A WALK.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Walking a building is moving and looking AT THE SAME TIME — you follow a wall
 * with your eyes while your feet keep going — and it is the thing a naive touch
 * layer cannot do, because it tracks "the touch" instead of "this touch". This
 * one keeps a map from `pointerId` to a role, assigns the role once at
 * pointerdown and never revisits it, so the left thumb driving the stick and the
 * right thumb dragging the view never see each other.
 *
 * POINTER EVENTS, NOT TOUCH EVENTS, and `setPointerCapture` on each id. Capture
 * is what makes a drag survive leaving the canvas: without it a thumb that
 * slides over a panel, or off the edge of the glass, stops sending moves and the
 * walker keeps walking with no way to stop him. It is also what guarantees the
 * matching pointerup arrives here rather than at whatever the thumb happens to
 * be over, which is how a stick gets stuck on.
 *
 * THE PAGE MUST NOT MOVE UNDER THE WALK. `touch-action: none` is set on the
 * canvas in index.css — on the CANVAS, deliberately, not on the document: a
 * visitor reading the hypothesis panel may genuinely want to pinch-zoom the
 * text, and `user-scalable=no` in the viewport meta would take that away from
 * them and from anybody who needs it to read at all. The meta tag stays
 * `width=device-width, initial-scale=1`, which is the correct one precisely
 * because it leaves zoom alone. `preventDefault()` on a touch pointerdown does
 * the rest: it suppresses the compatibility mouse events, and therefore the
 * phantom `click` that a phone would otherwise send into FirstPersonPlayer's
 * pointer-lock request.
 *
 * THE MOUSE IS NOT TOUCHED. `pointerType === 'mouse'` returns immediately, so
 * on a desktop this component observes and does nothing: pointer lock, WASD and
 * the mouse behave exactly as they did.
 *
 * THE RING IS DRAWN BY HAND, not by React state. A stick moves at the touch
 * sample rate — 60 to 120 times a second — and a `setState` per sample is a
 * React render per sample on the device that can least afford one. The two divs
 * below are mounted once and moved by writing `transform` directly, which costs
 * a compositor transform and no reconciliation at all.
 */
export function TouchControls({ canvas, stickRef, lookRef }: TouchControlsProps) {
  const ringRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!canvas) return

    /** One live thumb. `origin` is the spot it landed on, in client px. */
    interface Thumb {
      role: 'move' | 'look'
      originX: number
      originY: number
      /** Last position seen, for the look role's frame-to-frame delta. */
      lastX: number
      lastY: number
    }
    const thumbs = new Map<number, Thumb>()
    /** At most one of each role at a time; a third finger is ignored. */
    let mover: number | null = null
    let looker: number | null = null

    const ring = ringRef.current
    const knob = knobRef.current

    const showRing = (x: number, y: number) => {
      if (!ring || !knob) return
      ring.style.transform = `translate3d(${x - TOUCH.stickRadiusPx}px, ${y - TOUCH.stickRadiusPx}px, 0)`
      knob.style.transform = 'translate3d(0px, 0px, 0)'
      ring.style.opacity = '1'
    }
    const moveKnob = (s: Stick) => {
      if (!knob) return
      knob.style.transform = `translate3d(${s.x * TOUCH.stickRadiusPx}px, ${s.y * TOUCH.stickRadiusPx}px, 0)`
    }
    const hideRing = () => {
      if (ring) ring.style.opacity = '0'
    }

    const onDown = (e: PointerEvent) => {
      // the desktop path, untouched: the mouse still asks for pointer lock
      if (e.pointerType === 'mouse') return
      // suppresses the compatibility click, and with it the pointer-lock request
      // that can only be rejected on a device with no pointer to lock
      e.preventDefault()

      const box = canvas.getBoundingClientRect()
      const inZone = inThumbZone(e.clientX - box.left, e.clientY - box.top, box.width, box.height, {
        widthFraction: TOUCH.zoneWidthFraction,
        heightFraction: TOUCH.zoneHeightFraction,
      })

      let role: 'move' | 'look'
      if (inZone && mover === null) {
        role = 'move'
        mover = e.pointerId
        stickRef.current = { x: 0, y: 0 }
        showRing(e.clientX, e.clientY)
      } else if (!inZone && looker === null) {
        role = 'look'
        looker = e.pointerId
      } else {
        // a second thumb in a zone that already has one: ignore it rather than
        // let it steal the role, which would jump the view or the stick
        return
      }

      thumbs.set(e.pointerId, {
        role,
        originX: e.clientX,
        originY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
      })
      // capture AFTER the role is settled: a capture without a role would keep
      // delivering moves this handler has nothing to do with
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // NotFoundError: the pointer stopped being active between the browser
        // dispatching this event and us handling it — a thumb lifted inside one
        // frame, or the OS taking the gesture. The role above is still set, and
        // the uncaptured pointer still delivers moves to the canvas it is over,
        // so the walk degrades to "works until the thumb leaves the canvas"
        // rather than throwing on the visitor's first touch.
      }
    }

    const onMove = (e: PointerEvent) => {
      const thumb = thumbs.get(e.pointerId)
      if (!thumb) return
      e.preventDefault()

      if (thumb.role === 'move') {
        const s = stickVector(
          e.clientX - thumb.originX,
          e.clientY - thumb.originY,
          TOUCH.stickRadiusPx,
        )
        stickRef.current = s
        moveKnob(s)
      } else {
        // the player consumes and zeroes this, so accumulate rather than assign:
        // several samples can land between two rendered frames
        lookRef.current.dx += e.clientX - thumb.lastX
        lookRef.current.dy += e.clientY - thumb.lastY
      }
      thumb.lastX = e.clientX
      thumb.lastY = e.clientY
    }

    const release = (pointerId: number) => {
      const thumb = thumbs.get(pointerId)
      if (!thumb) return
      thumbs.delete(pointerId)
      if (thumb.role === 'move') {
        mover = null
        stickRef.current = null
        hideRing()
      } else {
        looker = null
      }
    }
    const onUp = (e: PointerEvent) => release(e.pointerId)

    canvas.addEventListener('pointerdown', onDown, { passive: false })
    canvas.addEventListener('pointermove', onMove, { passive: false })
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    // the browser can take a capture away — a system gesture, the phone ringing
    // — and the thumb that had it will never send an up
    canvas.addEventListener('lostpointercapture', onUp)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('lostpointercapture', onUp)
      // leaving walk mode with a thumb down must not leave the walker walking
      stickRef.current = null
      lookRef.current.dx = 0
      lookRef.current.dy = 0
    }
  }, [canvas, stickRef, lookRef])

  const r = TOUCH.stickRadiusPx
  const k = TOUCH.stickKnobRadiusPx
  return (
    <div
      ref={ringRef}
      aria-hidden
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,.35)',
        background: 'rgba(255,255,255,.06)',
        // the ring never takes a touch: the canvas underneath owns them all, so
        // there is no seam between "on the ring" and "beside it"
        pointerEvents: 'none',
        opacity: 0,
        transition: 'opacity 120ms',
        zIndex: 20,
      }}
    >
      <div
        ref={knobRef}
        style={{
          position: 'absolute',
          left: r - k,
          top: r - k,
          width: k * 2,
          height: k * 2,
          borderRadius: '50%',
          background: 'rgba(255,255,255,.5)',
        }}
      />
    </div>
  )
}
