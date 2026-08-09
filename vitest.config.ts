import { defineConfig } from 'vitest/config'

// Vitest runs the TypeScript unit tests. The Node-based `*.test.mjs` suites
// under src/main/services/download use the node:test runner instead and are
// executed via `npm run test:node`, so they are excluded from Vitest's globs
// here to prevent it from trying (and failing) to collect them.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts']
  }
})
