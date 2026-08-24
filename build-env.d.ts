/**
 * The one Node API the build config uses, declared rather than installed.
 *
 * vite.config.ts runs in Node and has to gzip each chunk to know what a visitor
 * actually downloads — the whole boot budget is stated in transferred bytes, and
 * there is no way to measure that without a compressor. `@types/node` is the
 * obvious way to type it and the wrong trade here: it is an optional peer of
 * vite and vitest, it is not installed, and pulling it in puts Node's globals
 * over the DOM's across all 58 test files and every component — `setTimeout`
 * returning a Timeout rather than a number is the usual first casualty. One
 * function is a smaller thing to declare than a platform.
 *
 * The signature is narrowed to what is used: a string in, something with a
 * `byteLength` out. Nothing else from `node:zlib` is in scope, which is the
 * point — a shim that grew would be @types/node written badly.
 */
declare module 'node:zlib' {
  export function gzipSync(data: string | Uint8Array, options?: { level?: number }): Uint8Array
}
