/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Phase 11: a single 3.9 MB bundle is a poor first paint on a phone. Split
    // the heavy engines out so the app shell and the physics WASM can be fetched
    // in parallel and cached separately across deploys.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // WebXR and its UI stack are dynamically imported (see LazyXR); giving
          // them their own name keeps the catch-all below from dragging them
          // back into the always-loaded vendor chunk.
          // @iwer (the XR emulation runtime), hls.js and @mediapipe are pulled in
          // by the XR stack and are by far the heaviest things in the tree —
          // they must ride with it, not with the always-loaded vendor chunk.
          if (
            id.includes('@react-three/xr') ||
            id.includes('@pmndrs') ||
            id.includes('fortawesome') ||
            id.includes('uikit') ||
            id.includes('@iwer') ||
            id.includes('hls.js') ||
            id.includes('@mediapipe')
          ) {
            return 'xr'
          }
          if (id.includes('three-mesh-bvh') || id.includes('three-bvh-csg')) return 'csg'
          if (id.includes('@dimforge') || id.includes('rapier')) return 'physics'
          if (id.includes('/three/')) return 'three'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react'
          }
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  test: {
    // Only pure-math modules are tested (see CLAUDE.md rule 6): no jsdom needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
