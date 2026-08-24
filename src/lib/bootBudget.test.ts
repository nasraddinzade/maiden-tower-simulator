import { describe, expect, it } from 'vitest'
import {
  bootBudgetReport,
  bootFiles,
  bootPayload,
  importPath,
  type BootBudget,
  type ChunkRecord,
} from './bootBudget'

/**
 * THE FIXTURE IS THE BUILD THAT SHIPPED, and the numbers are measured.
 *
 * `npx vite build` on the commit before the physics was made lazy: seven files
 * in the document's modulepreload list, of which `physics` — 2 431.5 kB
 * decompressed, 891.4 kB gzipped — held rapier and was reached by a single
 * `import { Physics } from '@react-three/rapier'` at the top of App.tsx. The xr
 * chunk was already behind a dynamic import and is here to prove the walk
 * distinguishes the two kinds of edge.
 */
const SHIPPED: ChunkRecord[] = [
  {
    file: 'index.js',
    bytes: 381_605,
    transferBytes: 135_162,
    imports: ['runtime.js', 'physics.js', 'react.js', 'vendor.js', 'csg.js', 'three.js'],
    dynamicImports: ['xr.js'],
    modules: ['src/App.tsx', 'src/main.tsx'],
  },
  {
    file: 'physics.js',
    bytes: 2_431_489,
    transferBytes: 891_416,
    imports: ['runtime.js', 'csg.js'],
    dynamicImports: [],
    modules: [
      'node_modules/@dimforge/rapier3d-compat/rapier.mjs',
      'node_modules/@react-three/rapier/dist/react-three-rapier.esm.js',
      'node_modules/react/cjs/react.production.js',
    ],
  },
  {
    file: 'csg.js',
    bytes: 827_952,
    transferBytes: 213_121,
    imports: ['runtime.js'],
    dynamicImports: [],
    modules: ['node_modules/three/build/three.core.js', 'node_modules/three-bvh-csg/src/index.js'],
  },
  {
    file: 'react.js',
    bytes: 237_271,
    transferBytes: 75_476,
    imports: ['runtime.js', 'physics.js'],
    dynamicImports: [],
    modules: ['node_modules/react-dom/cjs/react-dom-client.production.js'],
  },
  {
    file: 'vendor.js',
    bytes: 599_906,
    transferBytes: 188_767,
    imports: ['runtime.js', 'physics.js', 'react.js', 'csg.js'],
    dynamicImports: [],
    modules: ['node_modules/i18next/dist/esm/i18next.js'],
  },
  {
    file: 'three.js',
    bytes: 49_406,
    transferBytes: 14_417,
    imports: ['csg.js'],
    dynamicImports: [],
    modules: ['node_modules/three/examples/jsm/loaders/GLTFLoader.js'],
  },
  {
    file: 'runtime.js',
    bytes: 716,
    transferBytes: 428,
    imports: [],
    dynamicImports: [],
    modules: ['rolldown/runtime.js'],
  },
  {
    file: 'xr.js',
    bytes: 5_859_444,
    transferBytes: 1_919_393,
    imports: ['runtime.js', 'physics.js', 'react.js', 'vendor.js', 'csg.js', 'three.js'],
    dynamicImports: [],
    modules: ['node_modules/@react-three/xr/dist/index.js', 'node_modules/@iwer/sem/lib/index.js'],
  },
]

/** The same bundle after the physics moved behind `import('./runtime')`. */
const LAZY: ChunkRecord[] = [
  {
    file: 'index.js',
    bytes: 1_607_063,
    transferBytes: 501_512,
    imports: ['shared.js'],
    dynamicImports: ['physics.js', 'xr.js'],
    modules: ['src/App.tsx', 'node_modules/three/build/three.module.js'],
  },
  {
    file: 'shared.js',
    bytes: 387_202,
    transferBytes: 104_026,
    imports: [],
    dynamicImports: [],
    modules: ['node_modules/three/build/three.core.js', 'node_modules/react/cjs/react.production.js'],
  },
  {
    file: 'physics.js',
    bytes: 2_263_945,
    transferBytes: 838_683,
    imports: ['shared.js', 'index.js'],
    dynamicImports: [],
    modules: [
      'node_modules/@dimforge/rapier3d-compat/rapier.mjs',
      'src/components/physics/runtime.ts',
    ],
  },
  {
    file: 'xr.js',
    bytes: 110_249,
    transferBytes: 32_033,
    imports: ['shared.js', 'index.js'],
    dynamicImports: [],
    modules: ['node_modules/@react-three/xr/dist/index.js'],
  },
]

const BUDGET: BootBudget = {
  bytes: 6 * 1024 * 1024,
  transferBytes: 750_000,
  deferred: [
    { name: 'rapier (physics)', marker: '@dimforge/rapier3d-compat' },
    { name: 'WebXR', marker: '@react-three/xr' },
  ],
}

describe('the eager set', () => {
  it('follows static imports transitively', () => {
    expect(bootFiles(SHIPPED, 'index.js').sort()).toEqual([
      'csg.js',
      'index.js',
      'physics.js',
      'react.js',
      'runtime.js',
      'three.js',
      'vendor.js',
    ])
  })

  it('does not follow dynamic imports', () => {
    expect(bootFiles(SHIPPED, 'index.js')).not.toContain('xr.js')
    expect(bootFiles(LAZY, 'index.js').sort()).toEqual(['index.js', 'shared.js'])
  })

  it('counts a chunk once however many edges reach it', () => {
    // runtime.js is imported by five of the seven; csg.js by four
    const sum = SHIPPED.filter((c) => c.file !== 'xr.js').reduce((n, c) => n + c.bytes, 0)
    expect(bootPayload(SHIPPED, 'index.js').bytes).toBe(sum)
  })

  it('weighs the shipped build at 4 528.3 kB, 1 518.8 kB over the wire', () => {
    const p = bootPayload(SHIPPED, 'index.js')
    expect(p.bytes).toBe(4_528_345)
    expect(p.transferBytes).toBe(1_518_787)
  })

  it('weighs the lazy build at 1 994.3 kB, 605.5 kB over the wire', () => {
    // the document and the stylesheet add 6 243 B / 2 845 B on top of both;
    // vite.config.ts counts them, the graph here is the JavaScript alone
    const p = bootPayload(LAZY, 'index.js')
    expect(p.bytes).toBe(1_994_265)
    expect(p.transferBytes).toBe(605_538)
  })

  it('refuses an entry that is not in the bundle', () => {
    expect(() => bootFiles(SHIPPED, 'nope.js')).toThrow(/no chunk named/)
  })
})

describe('the path that made a chunk eager', () => {
  it('names the shortest chain of static imports', () => {
    expect(importPath(SHIPPED, 'index.js', 'physics.js')).toEqual(['index.js', 'physics.js'])
    expect(importPath(SHIPPED, 'index.js', 'three.js')).toEqual(['index.js', 'three.js'])
  })

  it('is null when only a dynamic import reaches it', () => {
    expect(importPath(SHIPPED, 'index.js', 'xr.js')).toBeNull()
    expect(importPath(LAZY, 'index.js', 'physics.js')).toBeNull()
  })
})

describe('the budget', () => {
  /*
   * The two that failed on the code as it stood. Both are stated against the
   * measured bundle above, not against a hypothetical one.
   */
  it('fails the shipped build on the transfer ceiling', () => {
    const { violations } = bootBudgetReport(SHIPPED, 'index.js', BUDGET)
    expect(violations.some((v) => v.includes('1518.8 kB transferred'))).toBe(true)
  })

  it('fails the shipped build because rapier is on the critical path', () => {
    const { violations } = bootBudgetReport(SHIPPED, 'index.js', BUDGET)
    const hit = violations.find((v) => v.startsWith('rapier'))
    expect(hit).toContain('index.js → physics.js')
  })

  it('passes the shipped build on the 6 MB decompressed ceiling — which is why nobody noticed', () => {
    const { violations } = bootBudgetReport(SHIPPED, 'index.js', BUDGET)
    expect(violations.some((v) => v.includes('decompressed'))).toBe(false)
  })

  it('does not complain about WebXR, which was already deferred', () => {
    const { violations } = bootBudgetReport(SHIPPED, 'index.js', BUDGET)
    expect(violations.some((v) => v.startsWith('WebXR'))).toBe(false)
  })

  it('passes the lazy build', () => {
    expect(bootBudgetReport(LAZY, 'index.js', BUDGET).violations).toEqual([])
  })

  it('catches a chunk that is BOTH statically and dynamically imported', () => {
    // the exact shape of a half-finished lazy load: the import() is added and
    // one static import is left behind, so nothing is deferred at all
    const half = LAZY.map((c) =>
      c.file === 'index.js' ? { ...c, imports: [...c.imports, 'physics.js'] } : c,
    )
    const { violations } = bootBudgetReport(half, 'index.js', BUDGET)
    expect(violations.some((v) => v.startsWith('rapier'))).toBe(true)
  })
})
