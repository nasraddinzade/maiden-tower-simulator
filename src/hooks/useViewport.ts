import { useEffect, useState } from 'react'
import type { LayoutMode, Orientation } from '../config/ui'
import { NO_INSETS, layoutModeOf, orientationOf, type Insets, type Viewport } from '../lib/screenLayout'

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

/**
 * THE SAFE AREA, READ RATHER THAN ASSUMED — the one number in the layout that
 * CSS knows and script does not.
 *
 * `env(safe-area-inset-*)` is not exposed to JavaScript in any form: there is no
 * property on `screen`, `visualViewport` or anywhere else that reports the
 * notch, and the values are not readable off `:root` either. The only way to see
 * them is to spend them on something and measure what was spent, which is what
 * this does — a hidden element whose padding is the four env() values, read back
 * through getComputedStyle in resolved pixels.
 *
 * WHY IT IS NEEDED AT ALL, given that screenLayout.ts has always said the
 * components apply the insets through CSS calc() and the model only needs them
 * in tests. Because the thumb zone is not laid out by CSS. It is a rectangle
 * compared against a touch point in script (lib/touchInput.ts → thumbZoneRect),
 * and a zone that ignored the insets would put the stick's rim under the rounded
 * corner of a landscape phone — 44 px a side is ordinary — where a thumb cannot
 * press and the browser may claim the gesture for a system swipe.
 *
 * Zero everywhere is both the fallback and the ordinary answer: without
 * `viewport-fit=cover` in the viewport meta the insets ARE zero, and index.html
 * has it precisely so they are not.
 */
export function readSafeAreaInsets(): Insets {
  if (typeof document === 'undefined' || !document.body) return NO_INSETS
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);'
  document.body.appendChild(probe)
  const s = getComputedStyle(probe)
  const px = (v: string) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  const insets: Insets = {
    top: px(s.paddingTop),
    right: px(s.paddingRight),
    bottom: px(s.paddingBottom),
    left: px(s.paddingLeft),
  }
  probe.remove()
  return insets
}

/**
 * The insets, kept current and kept IDENTICAL while they do not change.
 *
 * The identity matters as much as the value: the rectangle derived from these is
 * memoised on it, and a fresh object every render would recompute the thumb zone
 * on every frame the perf sample lands.
 */
export function useSafeAreaInsets(): Insets {
  const [insets, setInsets] = useState<Insets>(readSafeAreaInsets)

  useEffect(() => {
    const update = () =>
      setInsets((prev) => {
        const next = readSafeAreaInsets()
        const same =
          prev.top === next.top &&
          prev.right === next.right &&
          prev.bottom === next.bottom &&
          prev.left === next.left
        return same ? prev : next
      })

    // a rotation moves the cutout from one edge to another; a resize can be the
    // address bar going away, which changes the bottom inset on some browsers
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    window.visualViewport?.addEventListener('resize', update)
    // the first read can precede the browser resolving env() on a cold load
    update()

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return insets
}

export interface ScreenLayout {
  viewport: Viewport
  mode: LayoutMode
  orientation: Orientation
  /** What the notch and the rounded corners cost, in CSS px. */
  insets: Insets
}

export function useScreenLayout(): ScreenLayout {
  const viewport = useViewport()
  const insets = useSafeAreaInsets()
  return { viewport, mode: layoutModeOf(viewport), orientation: orientationOf(viewport), insets }
}
