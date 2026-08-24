import { init } from '@dimforge/rapier3d-compat'
import { Physics } from '@react-three/rapier'
import { FirstPersonPlayer } from '../player/FirstPersonPlayer'
import { FixedColliders } from './FixedColliders'
import type { PhysicsRuntime } from './lazyPhysics'

/**
 * THE ONLY MODULE IN src/ THAT MAY IMPORT RAPIER AS A VALUE.
 *
 * Reached exclusively through `import('./runtime')` in lazyPhysics.ts, which is
 * what keeps the 2.4 MB engine off the first paint. FirstPersonPlayer is
 * re-exported from here rather than from App because it uses `useRapier` and
 * rapier's own `Ray`: importing it eagerly would put the chunk back on the
 * critical path just as surely as importing `<Physics>` did.
 *
 * vite.config.ts fails the build if anything else acquires a static edge to it.
 */

/**
 * `init()` HERE RATHER THAN LEAVING IT TO <Physics>.
 *
 * @react-three/rapier instantiates the WASM inside a suspend-react call, so a
 * <Physics> mounting cold throws a promise and the surrounding <Suspense>
 * replaces the tower with its fallback — `null` — for the length of a WASM
 * compile. Doing it here folds that wait into the button press that is already
 * waiting for the download. rapier's own `init` is guarded (`if (wasm !==
 * undefined) return wasm`), so <Physics> calling it again a moment later
 * resolves on the first retry and the scene comes back in a frame.
 */
export async function load(): Promise<PhysicsRuntime> {
  await init()
  return { Physics, FixedColliders, FirstPersonPlayer }
}
