import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Builds once before the tests that run dist/, instead of in each test file
    globalSetup: ["test/global-setup.ts"],
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Integration tests with PostgreSQL run separately with vitest.db.config.ts
    exclude: ["**/*.db.test.ts"],
  },
});
