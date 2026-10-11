import { defineConfig } from "vitest/config";

// Integration tests with PostgreSQL (`pnpm run test:db`), separated since they need a database
export default defineConfig({
  test: {
    // Builds once before the tests that run dist/, instead of in each test file
    globalSetup: ["test/global-setup.ts"],
    include: ["test/**/*.db.test.ts"],
    testTimeout: 60_000,
  },
});
