import { useEffect, useRef } from 'react'
import { TOUCH } from '../../config/player'
import { inThumbZone, stickVector, type Stick } from '../../lib/touchInput'
import {
  beginThumb,
  createBook,
  dropDead,
  endAll,
  endThumb,
  markCaptured,
  moveThumb,
} from '../../lib/pointerBook'

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
  /**
   * A full-screen panel stands over the canvas.
   *
   * THE ONE PANEL THAT IS OPENED BY TOUCHING THE BUILDING ITSELF. The chrome —
   * the language sheet, the credits, the "Unsettled" detail, the hypotheses,
   * the sun — is reached by pressing a control, and a press whose target is not
   * the canvas already ends the walk's pointers (see onDocumentDown). A hotspot
   * is reached by pressing the CANVAS, so that rule cannot see it, and measured
   * at 375×812 the gap costs the visitor his bearings: thumb on the stick, tap
   * a marker, the panel covers 351×698 of a 375×812 screen and the same thumb
   * still drives — 1.753 m walked with nothing to see it by.
   *
   * He was never stranded (lifting the thumb stopped him; the first touch on
   * the panel reset everything), but a walk nobody can see is not a walk he is
   * making. The effect below simply does not run while this is true, so the
   * canvas carries no listeners at all under a panel and the book is empty when
   * one closes — structural, like the book itself, rather than remembered.
   */
  coveredByPanel?: boolean
}

/**
 * Touch controls for walking, 2026-08-23, made recoverable 2026-08-24.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * TWO THUMBS, TRACKED BY POINTER ID, AND NO WAY TO STRAND EITHER.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Walking a building is moving and looking AT THE SAME TIME — you follow a wall
 * with your eyes while your feet keep going — and it is the thing a naive touch
 * layer cannot do, because it tracks "the touch" instead of "this touch". This
 * one gives each `pointerId` a role, assigned once at pointerdown by where it
 * landed and never revisited, so the left thumb driving the stick and the right
 * thumb dragging the view never see each other.
 *
 * THE BOOKKEEPING IS lib/pointerBook.ts AND IT IS ONE RECORD. It used to be
 * three — a Map, a `mover` id and a `looker` id — and three records of one fact
 * can disagree. Enumerated there: 31% of six-event sequences left the shipped
 * version with a role held by an id belonging to nobody, the walker walking and
 * the stick refusing every new thumb. The visitor's only way out was a reload.
 * That is what the owner meant by «теряется в каких-то моментах», and it is
 * fixed by shape rather than by care: a role is taken exactly when a live thumb
 * holds it, so ending a thumb cannot leave one behind.
 *
 * FOUR WAYS A GESTURE ENDS, AND ALL FOUR ARE HEARD. `pointerup` is the polite
 * one. `pointercancel` is the OS taking the gesture. `lostpointercapture` is the
 * capture being withdrawn under us. And the fourth is silence — the tab going to
 * the background, the phone being turned, a panel opening over the canvas — for
 * which there is no event on the pointer at all and the reset has to come from
 * outside. See the listeners below: everything that can end a walk ends it.
 *
 * SILENCE HAS TWO SOURCES AND ONLY ONE OF THEM IS AN EVENT. The document-level
 * pointerdown covers every panel a visitor PRESSES A CONTROL to open. It cannot
 * cover the hotspot panel, which is opened by pressing the canvas itself, and
 * measured on a phone that gap let the same thumb walk 1.753 m under a panel
 * filling the screen. `coveredByPanel` closes it — see the prop.
 *
 * POINTER EVENTS, NOT TOUCH EVENTS, and `setPointerCapture` on each id. Capture
 * is what makes a drag survive leaving the canvas: without it a thumb that
 * slides over a panel, or off the edge of the glass, stops sending moves and the
 * walker keeps walking with no way to stop him. It is also what guarantees the
 * matching pointerup arrives here rather than at whatever the thumb happens to
 * be over, and it is the one question a browser will answer about whether a
 * pointer still exists — `hasPointerCapture`, which is how dead ones are swept.
 *
 * THE PAGE MUST NOT MOVE UNDER THE WALK. `touch-action: none` is set on the
 * canvas in index.css — on the CANVAS, deliberately, not on the document: a
 * visitor reading the hypothesis panel may genuinely want to pinch-zoom the
 * text, and `user-scalable=no` in the viewport meta would take that away from
 * them and from anybody who needs it to read at all.
 *
 * `preventDefault()` on a touch pointerdown stays, but it is no longer load
 * bearing and the comment that said it was has gone. It suppresses the
 * compatibility mouse events; it does NOT suppress the compatibility `click`,
 * which the Pointer Events spec exempts by name, and that click is what reached
 * FirstPersonPlayer and locked the pointer on the owner's phone. The gate for
 * that is now where it belongs — lib/pointerLock.ts, on the input actually in
 * use — rather than on a side effect of this call.
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
export function TouchControls({
  canvas,
  stickRef,
  lookRef,
  coveredByPanel = false,
}: TouchControlsProps) {
  const ringRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // A panel over the canvas ends the walk by TEARING THIS EFFECT DOWN, not by
    // remembering to stop: the cleanup below already calls resetAll(), so the
    // ring goes out, the walker stops and every listener leaves with it. The
    // panel closing rebuilds all of it around a fresh, empty book.
    if (!canvas || coveredByPanel) return

    const book = createBook()
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
    /** The stick is gone: the walker stops dead and the ring goes with him. */
    const stopMoving = () => {
      stickRef.current = null
      if (ring) ring.style.opacity = '0'
    }

    /**
     * Every thumb is gone, by something other than a thumb.
     *
     * The look delta is dropped here and NOT on an ordinary pointerup, and the
     * difference is what the delta means. Lifted normally it is motion the
     * visitor made a few milliseconds ago and the next frame owes it to him.
     * Dropped by a tab going to the background it is motion from before an
     * interruption of unknown length, and spending it on return would snap the
     * view somewhere he never dragged it.
     */
    const resetAll = () => {
      endAll(book)
      stopMoving()
      lookRef.current.dx = 0
      lookRef.current.dy = 0
    }

    const onDown = (e: PointerEvent) => {
      // the desktop path, untouched: the mouse still asks for pointer lock
      if (e.pointerType === 'mouse') return
      e.preventDefault()

      /*
       * Sweep pointers that no longer exist, on the one occasion the browser
       * can be asked. Not on a timer: a thumb resting still on the stick sends
       * no events at all, so elapsed time says nothing about whether it is
       * there, and only capture does. A thumb we never managed to capture is
       * left alone, because there is nothing to ask about it.
       */
      const dead = dropDead(book, (t) => !t.captured || canvas.hasPointerCapture(t.id))
      if (dead.includes('move')) stopMoving()

      const box = canvas.getBoundingClientRect()
      const inZone = inThumbZone(e.clientX - box.left, e.clientY - box.top, box.width, box.height, {
        widthFraction: TOUCH.zoneWidthFraction,
        heightFraction: TOUCH.zoneHeightFraction,
      })

      const { role, retired } = beginThumb(book, {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        inZone,
      })
      // a down for an id already in the book is proof the earlier one ended
      if (retired.includes('move')) stopMoving()
      // a second thumb in a zone that already has one: ignored rather than let
      // to steal the role, which would jump the view or the stick
      if (!role) return

      if (role === 'move') {
        stickRef.current = { x: 0, y: 0 }
        showRing(e.clientX, e.clientY)
      }

      // capture AFTER the role is settled: a capture without a role would keep
      // delivering moves this handler has nothing to do with
      try {
        canvas.setPointerCapture(e.pointerId)
        /*
         * ASKED, NOT ASSUMED, and the difference is a thumb's life. Chrome 148
         * accepts setPointerCapture for a pointerId that is not active and
         * simply does not capture it — measured here, no throw, and
         * hasPointerCapture false immediately afterwards. Recording `true` on
         * the strength of the call not throwing would mark a thumb captured
         * that the browser will never answer for, and the sweep above would
         * then retire it the moment a second finger landed.
         *
         * Reading the answer back makes the failure fall the safe way: a
         * capture the browser did not take is recorded as no capture, the sweep
         * ignores that thumb, and the walk degrades to what it was before the
         * sweep existed instead of losing the stick to it.
         */
        markCaptured(book, e.pointerId, canvas.hasPointerCapture(e.pointerId))
      } catch {
        // NotFoundError: the pointer stopped being active between the browser
        // dispatching this event and us handling it — a thumb lifted inside one
        // frame, or the OS taking the gesture. The thumb stays in the book
        // uncaptured, so the walk degrades to "works until the thumb leaves the
        // canvas" rather than throwing on the visitor's first touch, and the
        // resets below still reclaim it.
      }
    }

    const onMove = (e: PointerEvent) => {
      const m = moveThumb(book, { id: e.pointerId, x: e.clientX, y: e.clientY })
      if (!m) return
      e.preventDefault()

      if (m.role === 'move') {
        // measured from where the thumb landed: the throw IS the speed
        const s = stickVector(m.dx, m.dy, TOUCH.stickRadiusPx)
        stickRef.current = s
        moveKnob(s)
      } else {
        // the player consumes and zeroes this, so accumulate rather than assign:
        // several samples can land between two rendered frames
        lookRef.current.dx += m.dx
        lookRef.current.dy += m.dy
      }
    }

    /**
     * Up, cancel, or a capture withdrawn — the same event to the book, and
     * idempotent, because `pointerup` is followed by an implicit
     * `lostpointercapture` for the pointer it just released.
     */
    const onEnd = (e: PointerEvent) => {
      if (endThumb(book, e.pointerId) === 'move') stopMoving()
    }

    /**
     * A press that landed on the interface rather than on the building.
     *
     * Capture phase on the document, so it is seen before the control it hit
     * does anything, and it covers every way out of the walk in one rule
     * instead of five: the language switcher, the credits, the "Unsettled"
     * detail panel, the hypothesis panel, the sun sheet, a hotspot's own close
     * button. A thumb that goes to a panel has stopped walking, and the thumbs
     * still on the glass are no longer part of a gesture anybody is making.
     *
     * It costs a visitor who taps a control mid-stride the need to re-plant his
     * thumb, and that is the right price: the alternative is the state this
     * whole commit exists to remove, where the stick is held by a finger that
     * is somewhere else.
     */
    const onDocumentDown = (e: PointerEvent) => {
      if (e.target === canvas) return
      resetAll()
    }

    /** The tab going away. Chrome usually cancels the pointers; usually is not a guarantee. */
    const onVisibility = () => {
      if (document.hidden) resetAll()
    }

    canvas.addEventListener('pointerdown', onDown, { passive: false })
    canvas.addEventListener('pointermove', onMove, { passive: false })
    canvas.addEventListener('pointerup', onEnd)
    canvas.addEventListener('pointercancel', onEnd)
    // the browser can take a capture away — a system gesture, the phone ringing
    // — and the thumb that had it will never send an up
    canvas.addEventListener('lostpointercapture', onEnd)

    document.addEventListener('pointerdown', onDocumentDown, true)
    document.addEventListener('visibilitychange', onVisibility)
    // focus leaving the page: an app switch, a notification, a permission sheet
    window.addEventListener('blur', resetAll)
    window.addEventListener('pagehide', resetAll)
    // the phone turned sideways to look at a tower — the canvas box the stick
    // was measured against no longer exists
    window.addEventListener('orientationchange', resetAll)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onEnd)
      canvas.removeEventListener('pointercancel', onEnd)
      canvas.removeEventListener('lostpointercapture', onEnd)
      document.removeEventListener('pointerdown', onDocumentDown, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', resetAll)
      window.removeEventListener('pagehide', resetAll)
      window.removeEventListener('orientationchange', resetAll)
      // leaving walk mode with a thumb down must not leave the walker walking
      resetAll()
    }
  }, [canvas, stickRef, lookRef, coveredByPanel])

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
