/**
 * Type-checks type-tests/consumer.ts against the built type declarations (dist/) with several TypeScript versions,
 * in both an ES module project (this repository) and a CommonJS project (a temporary one),
 * to check the TypeScript versions and project types users can use. Run `pnpm run build` first.
 *
 * skipLibCheck is disabled so that errors in our type declarations are not skipped. drizzle-orm itself reports errors
 * then (types of database drivers that are not installed), so only errors in node_modules are ignored.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONSUMER = path.join(ROOT, "type-tests/consumer.ts");

// Package names of TypeScript in devDependencies:
// the oldest supported (5.0, the first with moduleResolution bundler) and the latest of each major version
const TYPESCRIPTS = [
  { name: "typescript-5.0", major: 5 },
  { name: "typescript-5.9", major: 5 },
  { name: "typescript-6.0", major: 6 },
  { name: "typescript", major: 7 },
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-types-"));

/** A CommonJS project that links this package and drizzle-orm, with a copy of the type tests. */
function createCommonJsProject() {
  const dir = path.join(tmpDir, "commonjs");
  fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "consumer" }));
  fs.symlinkSync(ROOT, path.join(dir, "node_modules/drizzle-db-comments-generator"));
  fs.symlinkSync(
    fs.realpathSync(path.join(ROOT, "node_modules/drizzle-orm")),
    path.join(dir, "node_modules/drizzle-orm"),
  );
  fs.copyFileSync(CONSUMER, path.join(dir, "consumer.ts"));
  return path.join(dir, "consumer.ts");
}

const commonJsConsumer = createCommonJsProject();
const PROJECTS = [
  { name: "ESM, bundler", file: CONSUMER, options: { module: "esnext", moduleResolution: "bundler" } },
  { name: "ESM, nodenext", file: CONSUMER, options: { module: "nodenext", moduleResolution: "nodenext" } },
  { name: "CommonJS, nodenext", file: commonJsConsumer, options: { module: "nodenext", moduleResolution: "nodenext" } },
  // module commonjs with moduleResolution bundler is allowed from TypeScript 6
  {
    name: "CommonJS, bundler",
    file: commonJsConsumer,
    options: { module: "commonjs", moduleResolution: "bundler" },
    minMajor: 6,
  },
];

function run(args) {
  return new Promise((resolve) => {
    // A larger heap, since type-checking drizzle-orm without skipLibCheck uses a lot of memory
    const child = spawn(process.execPath, ["--max-old-space-size=4096", ...args], { cwd: ROOT });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", (error) => resolve({ error, stdout, stderr }));
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

/** Splits the output of tsc into diagnostics, each with its continuation lines. */
function diagnostics(stdout) {
  const result = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (/error TS\d+/.test(line)) result.push([line]);
    else if (line.startsWith(" ") && result.length > 0) result.at(-1)?.push(line);
  }
  return result.map((lines) => lines.join("\n"));
}

// Only errors located in node_modules (drizzle-orm) are ignored. Errors without a location, such as config errors, fail.
const isIgnored = (diagnostic) =>
  /^(.*)\(\d+,\d+\): error TS/.exec(diagnostic)?.[1]?.replace(/\\/g, "/").includes("/node_modules/") ?? false;

async function check(typescript, project) {
  const tsc = path.join(ROOT, "node_modules", typescript.name, "bin/tsc");
  const label = `${typescript.name} (${project.name})`;
  const version = await run([tsc, "--version"]);
  if (version.status !== 0 || !version.stdout.trim()) {
    return { label, problems: [`Could not run ${tsc}: ${version.error ?? version.stderr}`] };
  }

  const tsconfig = path.join(tmpDir, `${typescript.name}-${project.name.replace(/\W+/g, "-")}.json`);
  fs.writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        ...project.options,
        target: "es2022",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: [],
      },
      files: [project.file],
    }),
  );
  const result = await run([tsc, "-p", tsconfig]);
  const problems = [];
  if (result.error || result.signal || result.status === null || result.stderr.trim()) {
    problems.push(`tsc did not finish normally: ${result.error ?? result.signal ?? result.stderr.trim()}`);
  }
  problems.push(...diagnostics(result.stdout).filter((d) => !isIgnored(d)));
  return { label: `${label}: ${version.stdout.trim()}`, problems };
}

/** Runs the tasks with limited concurrency, since each tsc uses a lot of memory. */
async function runAll(tasks, concurrency) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

try {
  const tasks = TYPESCRIPTS.flatMap((typescript) =>
    PROJECTS.filter((project) => typescript.major >= (project.minMajor ?? 0)).map(
      (project) => () => check(typescript, project),
    ),
  );
  const results = await runAll(tasks, Math.max(1, Math.min(4, os.availableParallelism() - 1)));
  for (const { label, problems } of results) {
    console.log(`${problems.length === 0 ? "OK  " : "FAIL"} ${label}`);
    for (const problem of problems) console.log(problem.replace(/^/gm, "  "));
  }
  process.exitCode = results.some((r) => r.problems.length > 0) ? 1 : 0;
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
