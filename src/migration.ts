import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CommentsState } from "./state";

const STATE_FILE = "comments-latest.json";

/** Reads the state saved by the previous generation, or an empty state if there is none. */
export function readState(outDir: string): CommentsState {
  const statePath = path.join(outDir, STATE_FILE);
  return fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
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
 * Writes the SQL into a custom migration created by drizzle-kit, and saves the state.
 * Letting drizzle-kit create the file keeps its journal consistent.
 * Returns the path of the created migration file.
 */
export function writeMigration(outDir: string, name: string, sql: string, state: CommentsState): string {
  const before = listSqlFiles(outDir);
  execFileSync("npx", ["drizzle-kit", "generate", "--custom", `--name=${name}`], { stdio: "inherit" });
  const created = [...listSqlFiles(outDir)].filter((f) => !before.has(f));
  if (created.length !== 1 || created[0] === undefined) {
    throw new Error(`Could not identify the generated migration file: ${created.join(", ")}`);
  }
  fs.writeFileSync(created[0], sql);
  fs.writeFileSync(path.join(outDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
  return created[0];
}
