/**
 * Runs the built package in temporary projects of both ES modules and CommonJS:
 * the CLI, to check how config files and schemas are actually loaded with tsx,
 * and the library at runtime, to check that `.comment()` is added to the drizzle-orm the project uses.
 * (Inside vitest, imports are handled by vite, so unit tests cannot check these.)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(ROOT, "dist/cli.cjs");

const SCHEMA = `
import { serial, text } from "drizzle-orm/pg-core";
import { pgTableWithComment } from "drizzle-db-comments-generator";
import { status } from "./enums";

export const users = pgTableWithComment("users", "Users", {
  id: serial("id").primaryKey().comment("User ID"),
  status: status("status").comment("Status"),
});
`;

const ENUMS = `
import { pgEnum } from "drizzle-orm/pg-core";

export const status = pgEnum("status", ["ACTIVE"]);
`;

const CONFIG = `
import { defineConfig } from "drizzle-kit";

export default defineConfig({ dialect: "postgresql", schema: "./src/schema.ts", out: "./drizzle" });
`;

let cwd: string;

beforeAll(() => {
  execFileSync("pnpm", ["run", "build"], { cwd: ROOT, stdio: "ignore" });
}, 60_000);

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-"));
  // Links the packages instead of installing them
  fs.mkdirSync(path.join(cwd, "node_modules"));
  for (const name of ["drizzle-orm", "drizzle-kit"]) {
    fs.symlinkSync(fs.realpathSync(path.join(ROOT, "node_modules", name)), path.join(cwd, "node_modules", name));
  }
  fs.symlinkSync(ROOT, path.join(cwd, "node_modules", "drizzle-db-comments-generator"));
  fs.mkdirSync(path.join(cwd, "src"));
  fs.writeFileSync(path.join(cwd, "src/schema.ts"), SCHEMA);
  fs.writeFileSync(path.join(cwd, "src/enums.ts"), ENUMS);
  fs.writeFileSync(path.join(cwd, "drizzle.config.ts"), CONFIG);
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

const runCli = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });

describe("cli", () => {
  it.each([
    { name: "an ES module project", packageJson: { name: "project", type: "module" } },
    { name: "a CommonJS project", packageJson: { name: "project" } },
  ])("loads the config and the schema in $name", ({ packageJson }) => {
    // Arrange
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify(packageJson));

    // Act
    const result = runCli("--dry-run");

    // Assert
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`COMMENT ON TABLE "users" IS 'Users';`);
    expect(result.stdout).toContain(`COMMENT ON COLUMN "users"."id" IS 'User ID';`);
    expect(result.stdout).toContain(`COMMENT ON COLUMN "users"."status" IS 'Status';`);
  });

  it("names columns by the casing in the config", () => {
    // Arrange
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "project" }));
    fs.writeFileSync(
      path.join(cwd, "src/schema.ts"),
      `
import { text } from "drizzle-orm/pg-core";
import { pgTableWithComment } from "drizzle-db-comments-generator";

export const users = pgTableWithComment("users", "Users", { fullName: text().comment("Full name") });
`,
    );
    fs.writeFileSync(
      path.join(cwd, "drizzle.config.ts"),
      CONFIG.replace(`out: "./drizzle"`, `out: "./drizzle", casing: "snake_case"`),
    );

    // Act
    const result = runCli("--dry-run");

    // Assert
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`COMMENT ON COLUMN "users"."full_name" IS 'Full name';`);
  });

  it("fails with the usage for an unknown option", () => {
    // Arrange
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "project" }));

    // Act
    const result = runCli("--schema", "src/schema.ts");

    // Assert
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown option '--schema'");
    expect(result.stderr).toContain("Usage:");
  });
});

describe("library at runtime", () => {
  const APP = `
const users = pgTableWithComment("users", "Users", { name: text("name").comment("Name") });
console.log(getTableConfig(users).columns[0].config.comment);
`;

  it.each([
    {
      name: "an ES module project",
      packageJson: { name: "project", type: "module" },
      app: `import { getTableConfig, text } from "drizzle-orm/pg-core";\nimport { pgTableWithComment } from "drizzle-db-comments-generator";\n${APP}`,
    },
    {
      name: "a CommonJS project",
      packageJson: { name: "project" },
      app: `const { getTableConfig, text } = require("drizzle-orm/pg-core");\nconst { pgTableWithComment } = require("drizzle-db-comments-generator");\n${APP}`,
    },
  ])("adds .comment() to the drizzle-orm used in $name", ({ packageJson, app }) => {
    // Arrange
    fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify(packageJson));
    fs.writeFileSync(path.join(cwd, "app.js"), app);

    // Act
    const result = spawnSync(process.execPath, ["app.js"], { cwd, encoding: "utf8" });

    // Assert
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("Name\n");
  });
});
