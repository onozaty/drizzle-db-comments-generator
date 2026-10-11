/**
 * Temporary user projects for tests that run the built package (dist/) as users do.
 */
import { execFileSync, type SpawnSyncReturns, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
const CLI = path.join(ROOT, "dist/cli.cjs");
const DRIZZLE_KIT = path.join(fs.realpathSync(path.join(ROOT, "node_modules/drizzle-kit")), "bin.cjs");

/** Builds the package, so that tests run the current source. Called once per test run by test/global-setup.ts. */
export function build(): void {
  execFileSync("pnpm", ["run", "build"], { cwd: ROOT, stdio: "ignore", timeout: 120_000 });
}

// spawnSync blocks the test worker, so the timeout of the test runner does not apply to child processes
const CHILD_TIMEOUT = 60_000;

export type Project = {
  dir: string;
  /** Writes a file, relative to the project directory. */
  write(file: string, content: string): void;
  /** Runs the CLI of this package. */
  runCli(...args: string[]): SpawnSyncReturns<string>;
  /** Runs drizzle-kit. */
  runDrizzleKit(...args: string[]): SpawnSyncReturns<string>;
  /** Runs a script with Node.js. */
  runNode(...args: string[]): SpawnSyncReturns<string>;
  remove(): void;
};

/** Creates a project that links this package and its dependencies instead of installing them. */
export function createProject(packageJson: Record<string, unknown>): Project {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-"));
  fs.mkdirSync(path.join(dir, "node_modules"));
  // pg is the driver drizzle-kit migrate uses
  for (const name of ["drizzle-orm", "drizzle-kit", "pg"]) {
    fs.symlinkSync(fs.realpathSync(path.join(ROOT, "node_modules", name)), path.join(dir, "node_modules", name));
  }
  fs.symlinkSync(ROOT, path.join(dir, "node_modules/drizzle-db-comments-generator"));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(packageJson));

  const runNode = (...args: string[]) =>
    spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8", timeout: CHILD_TIMEOUT });
  return {
    dir,
    write(file, content) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), content);
    },
    runCli: (...args) => runNode(CLI, ...args),
    runDrizzleKit: (...args) => runNode(DRIZZLE_KIT, ...args),
    runNode,
    remove: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Describes a failed child process, including timeouts and spawn errors. */
export function describeFailure(name: string, result: SpawnSyncReturns<string>): string {
  const reason = result.error
    ? String(result.error)
    : result.signal
      ? `signal ${result.signal}`
      : `status ${result.status}`;
  return `${name} failed (${reason}):\n${result.stdout}\n${result.stderr}`;
}
