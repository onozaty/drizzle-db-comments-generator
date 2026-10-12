import { isDeepStrictEqual } from "node:util";
import { diff } from "./diff";
import { readState, writeMigration, writeState } from "./migration";
import { toPostgresSql } from "./postgres";
import { buildState, type Casing, type CommentsState } from "./state";

export type GenerateOptions = {
  /** The project directory, to run drizzle-kit in. */
  cwd: string;
  outDir: string;
  migrationName: string;
  configPath: string;
  appendEnumValues?: boolean;
  casing?: Casing;
  dryRun?: boolean;
};

export type GenerateResult =
  | { status: "no-changes"; stateUpdated: boolean }
  | { status: "dry-run"; sql: string }
  | { status: "generated"; sql: string; file: string };

/** Generates a comment migration from the schema modules, based on the state saved by the previous generation. */
export function generate(modules: Record<string, unknown>[], options: GenerateOptions): GenerateResult {
  const prev = readState(options.outDir);
  const next = buildState(modules, { appendEnumValues: options.appendEnumValues, casing: options.casing });
  const changes = diff(prev, next);
  if (changes.length === 0) {
    // Changes without comments (such as dropped tables, columns or enums) need no statements,
    // but must be recorded so that re-adding them is detected as a change
    const stateUpdated = !options.dryRun && !isDeepStrictEqual(toPlain(prev), toPlain(next));
    if (stateUpdated) writeState(options.outDir, next);
    return { status: "no-changes", stateUpdated };
  }

  const sql = toPostgresSql(changes);
  if (options.dryRun) return { status: "dry-run", sql };

  const file = writeMigration(sql, {
    outDir: options.outDir,
    name: options.migrationName,
    configPath: options.configPath,
    cwd: options.cwd,
  });
  writeState(options.outDir, next);
  return { status: "generated", sql, file };
}

// Compares the states as saved in JSON (ignores undefined properties and prototypes)
const toPlain = (state: CommentsState): unknown => JSON.parse(JSON.stringify(state));
