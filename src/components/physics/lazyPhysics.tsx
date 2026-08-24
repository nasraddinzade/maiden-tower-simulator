import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react'
/*
 * TYPE-ONLY IMPORTS, AND THAT IS THE WHOLE TRICK.
 *
 * `import type` is erased before a bundler ever sees it, so naming rapier's own
 * Physics here costs nothing at runtime and buys exact types — the alternative,
 * re-declaring the props by hand, is a second copy of somebody else's interface
 * that goes stale silently. vite.config.ts's boot-budget plugin is what proves
 * the erasure actually happened: if any of these ever became a value import the
 * build fails naming the chunk it pulled in.
 */
import type { Physics } from '@react-three/rapier'
import type { FirstPersonPlayer, FirstPersonPlayerProps } from '../player/FirstPersonPlayer'
import type { FixedColliders, ColliderSpecs } from './FixedColliders'

export type { ColliderSpecs }

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE VISITOR WAS DOWNLOADING THE PHYSICS ENGINE BEFORE SEEING A SINGLE PIXEL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Measured on the production build (gzip -9), everything the first paint
 * waited on:
 *
 *     chunk               decompressed        transferred
 *     physics               2 431.5 kB            891.4 kB
 *     csg                     828.0 kB            213.1 kB
 *     vendor                  599.9 kB            188.8 kB
 *     index                   381.6 kB            135.2 kB
 *     react                   237.3 kB             75.5 kB
 *     three                    49.4 kB             14.4 kB
 *     runtime + css + html      2.8 kB              1.5 kB
 *     ─────────────────────────────────────────────────────
 *     total                 4 530.4 kB          1 519.8 kB
 *
 * The physics is 53.7% of that decompressed and 58.7% of what crosses the wire,
 * and NOTHING ON THE FIRST SCREEN USES IT. The opening view is an orbit around
 * the outside of the tower: no walker, no colliders, no solver — `<Physics>` was
 * mounted with `paused` true and stayed that way until somebody pressed «Walk
 * inside». On a phone on a slow connection that is 891 kB spent before the
 * tower appears, on a capability most visitors never ask for.
 *
 * Worse than the bytes: @react-three/rapier's `<Physics>` SUSPENDS while the
 * WASM instantiates (suspend-react, react-three-rapier.esm.js — `await
 * r.init()`), and it sat above the whole scene. So the first paint waited for
 * the engine to download AND to compile, with `<Suspense fallback={null}>`
 * showing nothing the entire time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * So rapier is behind a dynamic import now, and this module is the seam. Three
 * rules hold it:
 *
 *  1. `./runtime.ts` is the ONLY module in the app allowed to import rapier as a
 *     value. Everything reachable from `main.tsx` without going through a
 *     dynamic import must be rapier-free, because one static edge anywhere in
 *     that graph puts the chunk back on the critical path — which is exactly how
 *     it got there: a single `import { Physics }` at the top of App.tsx.
 *  2. Nothing in the model names rapier. The three components that used to draw
 *     stone AND carry collision now ship a *Colliders sibling — StaircaseColliders,
 *     ModernSpiralStairColliders, SiteAndEntranceStairColliders — and both halves
 *     go through <Colliders> below, which renders nothing when there is no world.
 *     That is the truthful answer rather than a placeholder: with no physics
 *     world there is nowhere to put a shape.
 *  3. Two different mechanisms carry the runtime, and the split is the whole of
 *     the correctness argument.
 *
 *     A MODULE-LEVEL STORE tells the PAGE that the engine has arrived: App is in
 *     the react-dom root, the scene is in r3f's own reconciler root, and React
 *     context does not cross between them. Only App reads it.
 *
 *     A REACT CONTEXT, provided by <MaybePhysics> from INSIDE the <Physics> it
 *     mounts, tells the SCENE the same thing. Nothing else will do: read from the
 *     store instead, and a collider or the walker can render in the window
 *     between "the module has landed" and "a physics world exists to put a shape
 *     in" — two roots do not commit as one, and the first version of this file
 *     did exactly that and threw «useRapier must be used within <Physics />» on
 *     the first press of the walk button. Under the context the question is not
 *     "has rapier loaded" but "am I inside a world", which is the question a
 *     collider actually has, and it cannot be answered wrongly.
 *
 * WHAT THIS COSTS. Pressing «Walk inside» now waits for 839.9 kB and a WASM
 * instantiation, where before it was instant — the price was simply paid by
 * everyone in advance, including everyone who never pressed it. The button
 * reports the wait (see App.tsx), and `load()` below finishes rapier's `init()`
 * itself so that <Physics>'s own suspend resolves on its first retry instead of
 * blanking the scene for the length of a WASM compile.
 */

/** What `./runtime.ts` resolves to. Exact types, zero runtime imports. */
export interface PhysicsRuntime {
  Physics: typeof Physics
  FixedColliders: typeof FixedColliders
  FirstPersonPlayer: typeof FirstPersonPlayer
}

let runtime: PhysicsRuntime | null = null
let pending: Promise<PhysicsRuntime> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): PhysicsRuntime | null {
  return runtime
}

/**
 * Fetch the physics chunk, instantiate the WASM, and publish the runtime.
 *
 * Idempotent and shared: a second caller during the download joins the first
 * one's promise rather than starting a second fetch. A FAILED load clears
 * `pending`, so pressing the button again retries — a dropped connection should
 * not lock the walk out for the life of the page.
 */
export function loadPhysics(): Promise<PhysicsRuntime> {
  if (runtime) return Promise.resolve(runtime)
  pending ??= import('./runtime')
    .then((mod) => mod.load())
    .then((loaded) => {
      runtime = loaded
      for (const listener of listeners) listener()
      return loaded
    })
    .catch((err: unknown) => {
      pending = null
      throw err
    })
  return pending
}

/** The loaded runtime, or null. Readable on both sides of the <Canvas> wall. */
export function usePhysicsRuntime(): PhysicsRuntime | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export interface LazyPhysics {
  /** Non-null once the chunk has landed and rapier has instantiated. */
  runtime: PhysicsRuntime | null
  /** Ask for it. Safe to call repeatedly. */
  load: () => void
  loading: boolean
  error: string | null
}

/** The loader, for the one component that owns the walk switch. */
export function useLazyPhysics(): LazyPhysics {
  const runtime = usePhysicsRuntime()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (runtime || loading) return
    setLoading(true)
    setError(null)
    loadPhysics()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [runtime, loading])

  return { runtime, load, loading, error }
}

/**
 * The runtime as seen from inside a physics world — null everywhere else.
 *
 * Provided by <MaybePhysics> below, within the <Physics> it mounts, so a
 * non-null value is a proof of position and not merely of arrival.
 */
const WorldRuntime = createContext<PhysicsRuntime | null>(null)

/** Non-null only for components rendered inside <Physics>. */
export function useWorldRuntime(): PhysicsRuntime | null {
  return useContext(WorldRuntime)
}

/**
 * A group of static colliders, or nothing at all while there is no world.
 *
 * The call sites read the same as the rapier elements they replaced; what has
 * changed is that they no longer import them. Note that this renders nothing
 * rather than deferring: the orbit view has no physics and needs none, and a
 * collider set that materialised later would be a second reason for the scene to
 * re-render at a moment nobody asked for anything.
 */
export function Colliders(props: ColliderSpecs) {
  const runtime = useWorldRuntime()
  if (!runtime) return null
  const Group = runtime.FixedColliders
  return <Group {...props} />
}

/**
 * The walker, once there is a world for him to be a body in.
 *
 * Same gate as <Colliders> and for the same reason: FirstPersonPlayer calls
 * `useRapier`, which throws outside <Physics>, and «the module has arrived» is
 * not the same fact as «I am inside a world».
 */
export function Walker(props: FirstPersonPlayerProps) {
  const runtime = useWorldRuntime()
  if (!runtime) return null
  const Player = runtime.FirstPersonPlayer
  return <Player {...props} />
}

/**
 * A physics world, once there is one, around whatever is put inside it.
 *
 * THE SWAP REMOUNTS ITS SUBTREE. React reconciles by element type, and a
 * Fragment becoming a <Physics> is a type change at that slot: everything below
 * it is torn down and built again. That is why this wrapper contains ONLY
 * collision and the walker, and not the model.
 *
 * It used to contain the model, and the cost was measured on the shipped build:
 * pressing «Walk inside» blanked the tower for 6.9 s while the scene was
 * discarded and rebuilt — the CSG shell, the floors, the stair, every material
 * and every shader — on the one action the whole page exists for. The visitor
 * would have traded a fast first paint for a broken second one. Nothing above
 * this element is rebuilt now: the tower the visitor is looking at when he
 * presses the button is the tower he is standing in afterwards.
 */
export function MaybePhysics({
  runtime,
  paused,
  debug,
  timeStep,
  children,
}: {
  runtime: PhysicsRuntime | null
  paused?: boolean
  debug?: boolean
  timeStep?: number | 'vary'
  children: React.ReactNode
}) {
  if (!runtime) return <>{children}</>
  const World = runtime.Physics
  return (
    <World paused={paused} debug={debug} timeStep={timeStep}>
      <WorldRuntime.Provider value={runtime}>{children}</WorldRuntime.Provider>
    </World>
  )
}
