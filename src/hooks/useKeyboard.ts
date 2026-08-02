import { useEffect, useRef } from 'react'
import type { MoveInput } from '../lib/playerMovement'

export interface KeyboardState {
  move: MoveInput
  /** Storey requested via keys 1..8 since the last read, or null. */
  takeTeleportRequest: () => number | null
}

/**
 * Raw keyboard state, kept in a ref so movement never triggers a re-render.
 * Supports both QWERTY letters and the physical positions (KeyW etc.), so a
 * Russian or Azerbaijani layout still walks.
 */
export function useKeyboard(): KeyboardState {
  const move = useRef<MoveInput>({
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
  })
  const teleport = useRef<number | null>(null)

  useEffect(() => {
    const set = (code: string, down: boolean) => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          move.current.forward = down
          break
        case 'KeyS':
        case 'ArrowDown':
          move.current.back = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          move.current.left = down
          break
        case 'KeyD':
        case 'ArrowRight':
          move.current.right = down
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          move.current.run = down
          break
      }
    }

    const onDown = (e: KeyboardEvent) => {
      set(e.code, true)
      // debug teleport: Digit1..Digit8 → storeys 1..8
      const m = /^Digit([1-8])$/.exec(e.code)
      if (m) teleport.current = Number(m[1]) - 1
    }
    const onUp = (e: KeyboardEvent) => set(e.code, false)
    // releasing focus must not leave a key stuck down
    const clear = () => {
      move.current = { forward: false, back: false, left: false, right: false, run: false }
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return {
    move: move.current,
    takeTeleportRequest: () => {
      const v = teleport.current
      teleport.current = null
      return v
    },
  }
}
