import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,e2e.test,accept.test}.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
