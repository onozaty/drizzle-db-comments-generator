import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { GeneratorError } from "./errors";
import { type CommentsState, emptyState, STATE_VERSION } from "./state";

const STATE_FILE = "comments-latest.json";

/** Reads the state saved by the previous generation, or an empty state if there is none. */
export function readState(outDir: string): CommentsState {
  const statePath = path.join(outDir, STATE_FILE);
  if (!fs.existsSync(statePath)) return emptyState();
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (state?.version !== STATE_VERSION) {
    throw new GeneratorError(
      `Unsupported format of ${statePath} (version: ${state?.version}, expected: ${STATE_VERSION})`,
    );
  }
  if (!isValidTables(state.tables)) {
    throw new GeneratorError(`Invalid content of ${statePath}. Fix or delete the file.`);
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
 * Returns the CLI script of the drizzle-kit installed in the project, from the `bin` of its package.json.
 * Runs it directly instead of npx, which would download drizzle-kit if it is not installed.
 */
export function resolveDrizzleKitBin(cwd: string): string {
  let entry: string;
  try {
    entry = createRequire(path.join(cwd, "package.json")).resolve("drizzle-kit");
  } catch (e) {
    if ((e as { code?: string }).code === "MODULE_NOT_FOUND") {
      throw new GeneratorError("drizzle-kit is not installed in the project");
    }
    throw e;
  }
  // package.json is not in the exports of drizzle-kit, so look for it from the resolved entry
  for (let dir = path.dirname(entry); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const packageJson = path.join(dir, "package.json");
    if (!fs.existsSync(packageJson)) continue;
    const { name, bin } = JSON.parse(fs.readFileSync(packageJson, "utf8"));
    if (name !== "drizzle-kit") continue;
    const script = typeof bin === "string" ? bin : bin?.["drizzle-kit"];
    if (typeof script === "string" && fs.existsSync(path.join(dir, script))) return path.join(dir, script);
    break;
  }
  throw new GeneratorError(`Could not find the CLI script of drizzle-kit (${entry})`);
}

export type MigrationOptions = {
  outDir: string;
  name: string;
  /** Config file passed to drizzle-kit, so that it uses the same migrations folder. */
  configPath: string;
};

/**
 * Writes the SQL into a custom migration created by drizzle-kit.
 * Letting drizzle-kit create the file keeps its journal consistent.
 * Returns the path of the created migration file.
 */
export function writeMigration(sql: string, { outDir, name, configPath }: MigrationOptions): string {
  const before = listSqlFiles(outDir);
  const bin = resolveDrizzleKitBin(process.cwd());
  execFileSync(process.execPath, [bin, "generate", `--config=${configPath}`, "--custom", `--name=${name}`], {
    stdio: "inherit",
  });
  const created = [...listSqlFiles(outDir)].filter((f) => !before.has(f));
  if (created.length !== 1 || created[0] === undefined) {
    throw new GeneratorError(`Could not identify the generated migration file: ${created.join(", ")}`);
  }
  fs.writeFileSync(created[0], sql);
  return created[0];
}
