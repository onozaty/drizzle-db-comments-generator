import { defineConfig } from "drizzle-kit";

/**
 * Connects to the PostgreSQL of the DevContainer unless EXAMPLE_DATABASE_URL is set.
 * Uses a dedicated variable instead of DATABASE_URL so that example:reset never drops another database by accident.
 */
export const databaseUrl = process.env.EXAMPLE_DATABASE_URL ?? "postgres://db_user:db_password@localhost:5432/sample";

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
