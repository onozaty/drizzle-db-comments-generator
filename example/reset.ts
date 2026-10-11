/** Drops all tables and the migration history, and removes the generated migrations. */
import fs from "node:fs";
import pg from "pg";
import { databaseUrl } from "./drizzle.config.ts";

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  // drizzle-kit keeps the migration history in the "drizzle" schema
  await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await client.query("DROP SCHEMA public CASCADE");
  await client.query("CREATE SCHEMA public");
} finally {
  await client.end();
}
fs.rmSync(new URL("./drizzle", import.meta.url), { recursive: true, force: true });
console.log("Reset the database and removed example/drizzle");
