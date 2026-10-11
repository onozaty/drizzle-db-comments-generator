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
import { generate } from "./generate";

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

const result = generate(modules, { outDir, migrationName, includeEnum, dryRun });
switch (result.status) {
  case "no-changes":
    console.log(
      result.stateUpdated ? "No comment changes (updated the state of dropped tables/columns)" : "No comment changes",
    );
    break;
  case "dry-run":
    console.log(result.sql);
    break;
  case "generated":
    console.log(`Generated comment migration: ${path.relative(process.cwd(), result.file)}`);
    break;
}
