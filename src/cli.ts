#!/usr/bin/env node
/**
 * Generates `COMMENT ON` statements as a drizzle-kit custom migration (PostgreSQL)
 * from the table/column comments defined in Drizzle schemas.
 * The schema files and the migrations folder are read from the drizzle-kit config file.
 *
 * Usage:
 *   drizzle-db-comments-generator [--config <file>] [--name <name>] [--enum] [--dry-run]
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, loadModule } from "./config";
import { GeneratorError } from "./errors";
import { generate } from "./generate";

const USAGE = "Usage: drizzle-db-comments-generator [--config <file>] [--name <name>] [--enum] [--dry-run]";

function parse() {
  return parseArgs({
    options: {
      config: { type: "string" },
      name: { type: "string" },
      enum: { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
}

async function main(): Promise<void> {
  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse().values;
  } catch (e) {
    console.error(`${(e as Error).message}\n${USAGE}`);
    process.exit(1);
  }

  const config = loadConfig(values.config);
  const modules = config.schemaFiles.map(loadModule);

  const result = generate(modules, {
    outDir: config.outDir,
    configPath: config.configPath,
    migrationName: values.name ?? "update_comments",
    includeEnum: values.enum,
    casing: config.casing,
    dryRun: values["dry-run"],
  });
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
}

main().catch((e) => {
  // Shows the stack trace of unexpected errors, such as errors thrown while loading schemas
  console.error(e instanceof GeneratorError ? e.message : e);
  process.exit(1);
});
