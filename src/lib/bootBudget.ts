/**
 * What the first paint waits on, as arithmetic over the bundle's own graph.
 *
 * docs/optimization-addendum.md sets «вес первой загрузки < 6 МБ» in Phase 1
 * and config/perf.ts has carried that number since — under a comment saying
 * "Checked at build time, not at runtime", which nothing did. Nothing checked
 * it, so nothing noticed that 2 431 kB of the 4 530 kB the visitor downloaded
 * before the first pixel was a physics engine used only by a mode most visitors
 * never enter. The budget was not wrong; it was unenforced, and an unenforced
 * budget is a comment.
 *
 * THE FIGURE THAT MATTERS IS NOT THE BUNDLE'S TOTAL SIZE. It is the transitive
 * closure of STATIC imports from the entry: those are the files a browser must
 * have before it can run a line, and every one of them is in the document's
 * modulepreload list. A dynamic import — `import('./runtime')` — is an edge the
 * browser does not follow until something calls it, so a 2.3 MB chunk behind
 * one costs the first paint nothing. Two chunks of identical size can therefore
 * differ by everything, and only the graph can tell them apart.
 *
 * No bundler types here, no fs, no three.js: vite.config.ts reads the real
 * bundle and hands these functions plain records, and the tests hand them
 * fixtures (CLAUDE.md rule 6 — this is arithmetic, so it is tested).
 */

/** One emitted JavaScript chunk, as the bundler describes it. */
export interface ChunkRecord {
  /** Emitted file name, e.g. `assets/index-a1b2c3.js`. Identifies the chunk. */
  file: string
  /** Decompressed size, bytes. */
  bytes: number
  /** Size over the wire — gzip, the floor any static host gives you. */
  transferBytes: number
  /** Chunks imported at load time. Following these is what "eager" means. */
  imports: readonly string[]
  /** Chunks imported only when an `import()` call runs. Deliberately not followed. */
  dynamicImports: readonly string[]
  /** Source module ids this chunk contains, for the deferral rules below. */
  modules: readonly string[]
}

export interface BootPayload {
  /** Every chunk the first paint waits on, entry first, then sorted. */
  files: string[]
  bytes: number
  transferBytes: number
}

/**
 * A package that must stay off the critical path, and how to recognise it.
 *
 * Matched against module ids rather than chunk names because chunk names are a
 * bundler's guess and change with its version: this repo's own hand-written
 * chunk map produced a chunk called `physics` that contained react, and a chunk
 * called `csg` that contained the whole of three.js. The module id is the one
 * thing in the bundle that still means what it says.
 */
export interface DeferralRule {
  /** What to call it when the build fails. */
  name: string
  /** Substring of a module id. Any match inside an eager chunk is a violation. */
  marker: string
}

export interface BootBudget {
  /** Decompressed ceiling for the eager set, bytes. */
  bytes: number
  /** Transferred (gzip) ceiling for the eager set, bytes. */
  transferBytes: number
  /** Packages that must be reachable only through an `import()`. */
  deferred: readonly DeferralRule[]
}

function indexBy(chunks: readonly ChunkRecord[]): Map<string, ChunkRecord> {
  const byFile = new Map<string, ChunkRecord>()
  for (const c of chunks) byFile.set(c.file, c)
  return byFile
}

/**
 * Every chunk reachable from `entry` by STATIC imports, transitively.
 *
 * Breadth-first, so `importPath` below can report the shortest chain — the
 * shortest chain is the one a person can act on. A chunk that is both statically
 * and dynamically imported is eager: the static edge is enough.
 */
export function bootFiles(chunks: readonly ChunkRecord[], entry: string): string[] {
  const byFile = indexBy(chunks)
  if (!byFile.has(entry)) throw new Error(`bootFiles: no chunk named ${entry}`)
  const seen = new Set<string>([entry])
  const queue = [entry]
  const order: string[] = []
  while (queue.length > 0) {
    const file = queue.shift() as string
    order.push(file)
    for (const next of byFile.get(file)?.imports ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return order
}

/** The eager set and what it weighs. Each chunk counted once, however many edges reach it. */
export function bootPayload(chunks: readonly ChunkRecord[], entry: string): BootPayload {
  const byFile = indexBy(chunks)
  const files = bootFiles(chunks, entry)
  let bytes = 0
  let transferBytes = 0
  for (const file of files) {
    const chunk = byFile.get(file)
    if (!chunk) continue
    bytes += chunk.bytes
    transferBytes += chunk.transferBytes
  }
  return { files, bytes, transferBytes }
}

/**
 * The shortest chain of static imports from `entry` to `target`, or null.
 *
 * This is the half of the report that is worth reading. "physics is eager" says
 * a rule was broken; "index → physics" says which import to go and delete.
 */
export function importPath(
  chunks: readonly ChunkRecord[],
  entry: string,
  target: string,
): string[] | null {
  const byFile = indexBy(chunks)
  if (!byFile.has(entry)) throw new Error(`importPath: no chunk named ${entry}`)
  if (entry === target) return [entry]
  const cameFrom = new Map<string, string>()
  const seen = new Set<string>([entry])
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift() as string
    for (const next of byFile.get(file)?.imports ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      cameFrom.set(next, file)
      if (next === target) {
        const path = [next]
        let at = next
        while (cameFrom.has(at)) {
          at = cameFrom.get(at) as string
          path.unshift(at)
        }
        return path
      }
      queue.push(next)
    }
  }
  return null
}

export interface BootBudgetReport {
  payload: BootPayload
  /** One line per broken rule, ready to print. Empty means the build is clean. */
  violations: string[]
}

/** Decimal kB, so a figure here can be compared with vite's own build report. */
function kb(bytes: number): string {
  return `${(bytes / 1000).toFixed(1)} kB`
}

/**
 * Check the eager set against the budget and the deferral rules.
 *
 * Both halves matter and they fail differently. The size ceiling catches drift —
 * a dependency that grew, a page that gained a panel. The deferral rules catch
 * the fault this module was written for, which is not drift at all: one static
 * `import` in one component, and a chunk that was meant to be fetched on a
 * button press is fetched by everybody, at once, before anything is drawn.
 */
export function bootBudgetReport(
  chunks: readonly ChunkRecord[],
  entry: string,
  budget: BootBudget,
): BootBudgetReport {
  const byFile = indexBy(chunks)
  const payload = bootPayload(chunks, entry)
  const violations: string[] = []

  if (payload.transferBytes > budget.transferBytes) {
    violations.push(
      `first paint waits on ${kb(payload.transferBytes)} transferred, budget ${kb(budget.transferBytes)}`,
    )
  }
  if (payload.bytes > budget.bytes) {
    violations.push(
      `first paint waits on ${kb(payload.bytes)} decompressed, budget ${kb(budget.bytes)}`,
    )
  }

  for (const rule of budget.deferred) {
    for (const file of payload.files) {
      const chunk = byFile.get(file)
      if (!chunk) continue
      const hit = chunk.modules.find((id) => id.includes(rule.marker))
      if (!hit) continue
      const path = importPath(chunks, entry, file)
      violations.push(
        `${rule.name} must be loaded on demand, but ${hit} is in ${file}` +
          (path ? `, reached by ${path.join(' → ')}` : ''),
      )
      break
    }
  }

  return { payload, violations }
}
