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
  it('imports without throwing', async () => {
    await expect(import('../App')).resolves.toBeDefined()
  })
})
