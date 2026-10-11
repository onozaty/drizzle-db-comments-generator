/**
 * The CLI: generates `COMMENT ON` statements as a drizzle-kit custom migration (PostgreSQL)
 * from the table/column comments defined in Drizzle schemas.
 * The schema files and the migrations folder are read from the drizzle-kit config file.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, loadModule } from "./config";
import { GeneratorError } from "./errors";
import { generate } from "./generate";

export const USAGE = "Usage: drizzle-db-comments-generator [--config <file>] [--name <name>] [--enum] [--dry-run]";

export type RunOptions = {
  /**
   * The directory to resolve the config file and run drizzle-kit in.
   * tsx, which loads the config file and the schemas, looks for tsconfig.json from process.cwd(),
   * so that tsconfig of this directory (such as `paths`) applies only when it is the same as process.cwd(), as with the CLI.
   */
  cwd?: string;
  output?: { log(message: string): void; error(message: unknown): void };
};

function parse(args: string[]) {
  return parseArgs({
    args,
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

/** Runs the CLI with the arguments, and returns the exit code. */
export function run(args: string[], { cwd = process.cwd(), output = console }: RunOptions = {}): number {
  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(args).values;
  } catch (e) {
    output.error(`${(e as Error).message}\n${USAGE}`);
    return 1;
  }

  try {
    const config = loadConfig(values.config, cwd);
    const modules = config.schemaFiles.map(loadModule);
    const result = generate(modules, {
      cwd,
      outDir: config.outDir,
      configPath: config.configPath,
      migrationName: values.name ?? "update_comments",
      includeEnum: values.enum,
      casing: config.casing,
      dryRun: values["dry-run"],
    });
    switch (result.status) {
      case "no-changes":
        output.log(
          result.stateUpdated
            ? "No comment changes (updated the state of dropped tables/columns)"
            : "No comment changes",
        );
        break;
      case "dry-run":
        output.log(result.sql);
        break;
      case "generated":
        output.log(`Generated comment migration: ${path.relative(cwd, result.file)}`);
        break;
    }
    return 0;
  } catch (e) {
    // Shows the stack trace of unexpected errors, such as errors thrown while loading schemas
    output.error(e instanceof GeneratorError ? e.message : e);
    return 1;
  }
}
