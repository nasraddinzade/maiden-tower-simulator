/// <reference types="vitest/config" />
import { gzipSync } from 'node:zlib'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { bootBudgetReport, type ChunkRecord } from './src/lib/bootBudget.ts'
import { PAYLOAD_BUDGET } from './src/config/perf.ts'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CHUNK MAP IS GONE, AND ITS REMOVAL IS WHAT MADE THE LAZY PHYSICS REAL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There used to be a hand-written `manualChunks` here, added in Phase 11 to
 * fetch the heavy engines in parallel and cache them separately across deploys.
 * It did neither. Measured on the build it produced — the chunk each module
 * ACTUALLY landed in, read out of `generateBundle`:
 *
 *   chunk «physics» 2 431 kB   rapier · @react-three/fiber · react · scheduler
 *   chunk «csg»       828 kB   three-mesh-bvh · three-bvh-csg · ALL OF three.js
 *   chunk «react»     237 kB   react-dom · leva's floating-ui and stitches
 *   chunk «three»      49 kB   GLTFLoader, and nothing else
 *
 * Under rolldown (vite 8) a named group behaves as a SINK: every module shared
 * between the entry and any async chunk is swept into the first group that
 * exists, whatever its own rule said. So `react` — which matched the rule
 * `/react/` and was meant for the chunk named after it — was emitted inside
 * `physics`, and the entry therefore had to import `physics` to start at all.
 * Putting rapier behind `import()` changed nothing while that map was here: the
 * chunk stayed on the critical path because react was in it. Confirmed by
 * moving the sink about — with the map's own rules the entry pulled `physics`;
 * with rapier ungrouped it pulled `xr` (5.9 MB); with a vendor group first, that
 * one swallowed rapier as well. The map cannot express what it was written to
 * express.
 *
 * Rolldown's own splitting gets it right, because it splits on the thing that
 * matters — which entry can reach a module — rather than on a name. Measured,
 * gzip -9, the whole set the document blocks on (its two scripts, the
 * stylesheet and the page itself):
 *
 *                        decompressed   transferred   first paint waits on it
 *   before   eager         4 530.4 kB     1 519.8 kB   yes, all of it
 *   after    eager         2 000.5 kB       608.4 kB   yes
 *            rapier        2 266.6 kB       839.9 kB   NO — fetched on «walk»
 *            WebXR         6 134.8 kB     1 996.1 kB   NO — fetched on «VR»
 *
 * −55.8% decompressed and −60.0% over the wire, and the largest single thing
 * this project ships is now something nobody downloads unless they ask to walk.
 *
 * The names rolldown picks are worse than the ones the map imposed — the second
 * eager file is called `preload-helper` and holds three.core.js and react — and
 * that is worth saying out loud rather than hiding: a name is a label, and the
 * old labels were wrong about their contents in every case above.
 *
 * WHAT IS GIVEN UP, plainly: the app's own code no longer has a chunk of its
 * own, so a one-line edit to a component invalidates the 1 607 kB entry chunk
 * for a returning visitor instead of a 382 kB one. That is a real cost and it is
 * the smaller one. The map was charging EVERY visitor 891 kB of engine on first
 * sight of the page to save a returning one part of a re-download — and the
 * returning visitor was paying that 891 kB again anyway whenever the app
 * changed, because `physics` held react and react moves with the app.
 */

/**
 * Fail the build when the first paint waits on something it should not.
 *
 * The arithmetic is in src/lib/bootBudget.ts and is unit-tested against the
 * measured bundle; this plugin's only job is to translate rolldown's bundle
 * into the plain records that module takes, and to gzip each chunk so the
 * figure is what a visitor downloads rather than what is on disk.
 *
 * IT FAILS THE BUILD RATHER THAN WARNING. A warning about a megabyte is a line
 * in a log that scrolls past; this rule exists because exactly such a line
 * (vite's own "some chunks are larger than 900 kB") had been printing on every
 * build for months while the page opened on nothing.
 */
function bootBudget(): Plugin {
  return {
    name: 'maiden-tower:boot-budget',
    apply: 'build',
    /*
     * AFTER vite's own plugins, or index.html is not in the bundle yet: the
     * document is emitted by vite:build-html in its own generateBundle, and a
     * check that ran first would report an eager payload with the page missing
     * from it — 5.4 kB of it, in a figure that claims to be everything.
     */
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunks: ChunkRecord[] = []
      let entry: string | null = null
      /*
       * The CSS and the document are counted with the entry chunk rather than
       * as graph nodes of their own: both are render-blocking, neither is
       * reachable by an import, and together they are 5.6 kB — most of it the
       * inline splash the document now carries. Small, but this figure claims
       * to be everything the first paint waits on, and the splash is the one
       * part of it the visitor actually sees.
       */
      let blockingBytes = 0
      let blockingTransfer = 0
      let blockingFiles = 0
      const utf8 = new TextEncoder()
      /** Bytes on disk and bytes on the wire, for one emitted file. */
      const weigh = (body: string | Uint8Array) => {
        const bytes = typeof body === 'string' ? utf8.encode(body) : body
        return { bytes: bytes.byteLength, transferBytes: gzipSync(bytes, { level: 9 }).byteLength }
      }
      for (const [file, output] of Object.entries(bundle)) {
        if (output.type === 'asset') {
          if (!file.endsWith('.css') && !file.endsWith('.html')) continue
          const { bytes, transferBytes } = weigh(output.source)
          blockingBytes += bytes
          blockingTransfer += transferBytes
          blockingFiles += 1
          continue
        }
        chunks.push({
          file,
          ...weigh(output.code),
          imports: output.imports,
          dynamicImports: output.dynamicImports,
          modules: Object.keys(output.modules),
        })
        if (output.isEntry) entry = file
      }
      if (!entry) return

      const { payload, violations } = bootBudgetReport(chunks, entry, {
        bytes: PAYLOAD_BUDGET.firstLoadBytes - blockingBytes,
        transferBytes: PAYLOAD_BUDGET.firstLoadTransferBytes - blockingTransfer,
        deferred: PAYLOAD_BUDGET.deferredPackages,
      })

      const kB = (n: number) => (n / 1000).toFixed(1)
      this.info(
        `first paint waits on ${payload.files.length + blockingFiles} files, ` +
          `${kB(payload.bytes + blockingBytes)} kB decompressed, ` +
          `${kB(payload.transferBytes + blockingTransfer)} kB transferred ` +
          `(budget ${kB(PAYLOAD_BUDGET.firstLoadTransferBytes)} kB)`,
      )
      if (violations.length > 0) {
        this.error(
          'boot budget broken — see src/config/perf.ts and src/lib/bootBudget.ts\n  ' +
            violations.join('\n  '),
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bootBudget()],
  build: {
    /*
     * The blunt warning cannot tell a chunk the first paint waits on from one
     * nobody will ever fetch — it would fire for the rapier chunk, which is now
     * deliberately the largest thing we emit and is deliberately not fetched.
     * bootBudget() above checks the sharp figure and fails on it, so this is set
     * clear of everything we currently ship rather than left to cry wolf.
     */
    chunkSizeWarningLimit: 3000,
  },
  test: {
    // Only pure-math modules are tested (see CLAUDE.md rule 6): no jsdom needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
