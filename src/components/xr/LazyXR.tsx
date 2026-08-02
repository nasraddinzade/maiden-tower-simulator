import { useCallback, useEffect, useState, type ReactNode } from 'react'

/**
 * WebXR, loaded only when someone asks for it (Phase 12).
 *
 * @react-three/xr brings its own UI stack with it: importing it statically put
 * 1.88 MB gzipped into the vendor chunk, which undid the whole Phase-11 budget
 * for a feature most visitors never use. Loading it on the button press keeps
 * the first paint small and costs a headset user one short wait.
 */

// Minimal shape of what we use, so the lazy module needs no ambient types.
interface XRStoreLike {
  enterVR: () => void
}
type XRComponent = (props: { store: XRStoreLike; children?: ReactNode }) => ReactNode

export interface LazyXR {
  /** Non-null once the module has loaded. */
  session: { XR: XRComponent; store: XRStoreLike } | null
  /** Load the module if needed, then request a VR session. */
  enter: () => void
  loading: boolean
  error: string | null
}

export function useLazyXR(): LazyXR {
  const [session, setSession] = useState<LazyXR['session']>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const enter = useCallback(() => {
    if (session) {
      session.store.enterVR()
      return
    }
    if (loading) return
    setLoading(true)
    setError(null)
    import('@react-three/xr')
      .then((mod) => {
        const store = mod.createXRStore() as unknown as XRStoreLike
        setSession({ XR: mod.XR as unknown as XRComponent, store })
        setPending(true)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [session, loading])

  // Enter only after the provider has mounted, or the session has nothing to attach to.
  useEffect(() => {
    if (pending && session) {
      setPending(false)
      session.store.enterVR()
    }
  }, [pending, session])

  return { session, enter, loading, error }
}

/** Wraps the scene in the XR provider once it exists, and passes through until then. */
export function MaybeXR({ session, children }: { session: LazyXR['session']; children: ReactNode }) {
  if (!session) return <>{children}</>
  const { XR, store } = session
  return <XR store={store}>{children}</XR>
}
