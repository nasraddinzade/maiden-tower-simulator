import { describe, expect, it } from 'vitest'

/**
 * THE APP MUST ACTUALLY LOAD.
 *
 * Nothing in this suite imported App.tsx, so a module-level ordering mistake in
 * it was invisible: a const declared below the table that used it, which is a
 * temporal dead zone and throws the moment the module is evaluated. Every test
 * passed, the type checker passed, and the page was a blank screen with
 * "Cannot access 'EMBRASURE_MARGIN' before initialization" in the console.
 *
 * Importing the module is the whole test. It cannot assert anything about what
 * the app renders — that is the renderer, and CLAUDE.md rule 6 keeps the
 * renderer out of the suite — but evaluating the module catches the entire class
 * of fault that made the tower disappear.
 */
describe('the application module evaluates', () => {
  /*
   * THE TIMEOUT IS NOT DECORATION. This one import pulls in three.js, rapier,
   * drei, i18next and the whole component tree, and on a cold transform cache it
   * lands either side of vitest's 5 s default — so the suite passed or failed by
   * how warm the machine was, which is worse than either. Measured at 5.0 s in a
   * full run and 3.6 s alone on 2026-08-14. Raised, not deleted: the fault this
   * test exists to catch is a module-evaluation throw, and a throw is instant.
   */
  it('imports without throwing', { timeout: 30_000 }, async () => {
    await expect(import('../App')).resolves.toBeDefined()
  })
})
