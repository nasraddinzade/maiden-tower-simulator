import { useEffect, useState } from 'react'
import type { LayoutMode, Orientation } from '../config/ui'
import { layoutModeOf, orientationOf, type Viewport } from '../lib/screenLayout'

/**
 * THE ONE PLACE THE INTERFACE ASKS HOW BIG THE SCREEN IS.
 *
 * It reports the viewport and the two things derived from it — which layout and
 * which orientation — so that no component decides for itself what a phone is.
 * The decision itself is lib/screenLayout.ts, which is arithmetic and is tested;
 * this is the subscription that feeds it, which is not.
 *
 * `(pointer: coarse)` is watched rather than read once: a tablet with a keyboard
 * folder attached changes it mid-session, and so does every desktop browser's
 * device-emulation mode — which is the one this was verified in.
 *
 * `orientationchange` is listened for ALONGSIDE `resize` and not instead of it.
 * On iOS the resize that follows a rotation can arrive before the new dimensions
 * are readable, and on Android some browsers fire only one of the two; taking
 * both and recomputing from `innerWidth`/`innerHeight` each time is idempotent,
 * so the duplicate costs a comparison and the missing one costs a wrong layout.
 */
export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>(read)

  useEffect(() => {
    const update = () =>
      setV((prev) => {
        const next = read()
        if (
          prev.width === next.width &&
          prev.height === next.height &&
          prev.coarsePointer === next.coarsePointer
        ) {
          return prev
        }
        return next
      })

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const coarse = window.matchMedia?.('(pointer: coarse)')
    coarse?.addEventListener?.('change', update)
    // the address bar collapsing on a phone is a viewport change and nothing else
    window.visualViewport?.addEventListener('resize', update)

    // one pass after mount: the first paint can precede the browser settling on
    // a dynamic-toolbar height, and the value read during render would stick
    update()

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      coarse?.removeEventListener?.('change', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return v
}

function read(): Viewport {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900, coarsePointer: false }
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  }
}

export interface ScreenLayout {
  viewport: Viewport
  mode: LayoutMode
  orientation: Orientation
}

export function useScreenLayout(): ScreenLayout {
  const viewport = useViewport()
  return { viewport, mode: layoutModeOf(viewport), orientation: orientationOf(viewport) }
}
