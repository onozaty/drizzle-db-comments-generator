#!/usr/bin/env node
/**
 * Generates `COMMENT ON` statements as a drizzle-kit custom migration (PostgreSQL)
 * from the table/column comments defined in Drizzle schemas.
 *
 * Usage:
 *   drizzle-db-comments-generator --schema src/db/schema.ts --out drizzle [--name <name>] [--enum] [--dry-run]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { diff, toMigrationSql } from "./diff";
import { readState, writeMigration } from "./migration";
import { buildState } from "./state";

const args = process.argv.slice(2);
const getArgs = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1] as string] : []));
const schemaFiles = getArgs("--schema").map((p) => path.resolve(p));
const outDir = path.resolve(getArgs("--out")[0] ?? "drizzle");
const migrationName = getArgs("--name")[0] ?? "update_comments";
const includeEnum = args.includes("--enum");
const dryRun = args.includes("--dry-run");
if (schemaFiles.length === 0) {
  console.error("Specify --schema <file> (can be repeated)");
  process.exit(1);
}

const modules: Record<string, unknown>[] = [];
for (const file of schemaFiles) {
  modules.push(await import(pathToFileURL(file).href));
}
const next = buildState(modules, { includeEnum });
const blocks = diff(readState(outDir), next);

if (blocks.length === 0) {
  console.log("No comment changes");
  process.exit(0);
}
const sql = toMigrationSql(blocks);

if (dryRun) {
  console.log(sql);
  process.exit(0);
}

const created = writeMigration(outDir, migrationName, sql, next);
console.log(`Generated comment migration: ${path.relative(process.cwd(), created)}`);
