import { useEffect, useRef, useState } from 'react'
import { joystickToInput, NO_INPUT, type MoveInput } from '../../lib/playerMovement'

export interface TouchControlsProps {
  /** Written every frame the stick moves; the player reads it. */
  inputRef: React.RefObject<MoveInput | null>
  /** Accumulated look delta; the player consumes and zeroes it. */
  lookRef: React.RefObject<{ dx: number; dy: number }>
}

const STICK_RADIUS = 56

/**
 * Phase-6 mobile controls: a virtual stick bottom-left for movement, and a drag
 * anywhere on the right half to look around — the spec's layout.
 *
 * Rendered as DOM over the canvas rather than in the scene, so it costs nothing
 * on desktop and stays crisp at any device pixel ratio.
 */
export function TouchControls({ inputRef, lookRef }: TouchControlsProps) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null)
  const stickTouch = useRef<number | null>(null)
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const leftHalf = t.clientX < window.innerWidth / 2
        if (leftHalf && stickTouch.current === null) {
          stickTouch.current = t.identifier
          origin.current = { x: t.clientX, y: t.clientY }
          setKnob({ x: 0, y: 0 })
        } else if (!leftHalf && lookTouch.current === null) {
          lookTouch.current = { id: t.identifier, x: t.clientX, y: t.clientY }
        }
      }
    }

    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickTouch.current && origin.current) {
          const dx = t.clientX - origin.current.x
          const dy = t.clientY - origin.current.y
          const mag = Math.hypot(dx, dy)
          const clamp = Math.min(1, mag / STICK_RADIUS)
          const nx = mag ? (dx / mag) * clamp : 0
          const ny = mag ? (dy / mag) * clamp : 0
          setKnob({ x: nx * STICK_RADIUS, y: ny * STICK_RADIUS })
          // pushing the stick right to the rim means run
          if (inputRef.current !== undefined) {
            inputRef.current = joystickToInput(nx, ny, 0.15, clamp > 0.85)
          }
        } else if (lookTouch.current && t.identifier === lookTouch.current.id) {
          lookRef.current.dx += t.clientX - lookTouch.current.x
          lookRef.current.dy += t.clientY - lookTouch.current.y
          lookTouch.current.x = t.clientX
          lookTouch.current.y = t.clientY
        }
      }
    }

    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickTouch.current) {
          stickTouch.current = null
          origin.current = null
          setKnob(null)
          inputRef.current = { ...NO_INPUT }
        } else if (lookTouch.current && t.identifier === lookTouch.current.id) {
          lookTouch.current = null
        }
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [inputRef, lookRef])

  if (!knob || !origin.current) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: origin.current.x - STICK_RADIUS,
        top: origin.current.y - STICK_RADIUS,
        width: STICK_RADIUS * 2,
        height: STICK_RADIUS * 2,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,.35)',
        background: 'rgba(255,255,255,.06)',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: STICK_RADIUS + knob.x - 22,
          top: STICK_RADIUS + knob.y - 22,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(255,255,255,.5)',
        }}
      />
    </div>
  )
}
