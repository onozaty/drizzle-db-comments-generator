import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { type CommentsState, emptyState, STATE_VERSION } from "./state";

const STATE_FILE = "comments-latest.json";

/** Reads the state saved by the previous generation, or an empty state if there is none. */
export function readState(outDir: string): CommentsState {
  const statePath = path.join(outDir, STATE_FILE);
  if (!fs.existsSync(statePath)) return emptyState();
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (state?.version !== STATE_VERSION) {
    throw new Error(`Unsupported format of ${statePath} (version: ${state?.version}, expected: ${STATE_VERSION})`);
  }
  if (!isValidTables(state.tables)) {
    throw new Error(`Invalid content of ${statePath}. Fix or delete the file.`);
  }
  return state;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isValidTables(tables: unknown): boolean {
  return (
    isObject(tables) &&
    Object.values(tables).every((t) => isObject(t) && typeof t.table === "string" && isObject(t.columns))
  );
}

/** Saves the state for the next generation. */
export function writeState(outDir: string, state: CommentsState): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function listSqlFiles(dir: string): Set<string> {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    (fs.readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".sql"))
      .map((f) => path.join(dir, f)),
  );
}

/**
 * Writes the SQL into a custom migration created by drizzle-kit.
 * Letting drizzle-kit create the file keeps its journal consistent.
 * Returns the path of the created migration file.
 */
export function writeMigration(outDir: string, name: string, sql: string): string {
  const before = listSqlFiles(outDir);
  execFileSync("npx", ["drizzle-kit", "generate", "--custom", `--name=${name}`], { stdio: "inherit" });
  const created = [...listSqlFiles(outDir)].filter((f) => !before.has(f));
  if (created.length !== 1 || created[0] === undefined) {
    throw new Error(`Could not identify the generated migration file: ${created.join(", ")}`);
  }
  fs.writeFileSync(created[0], sql);
  return created[0];
}
