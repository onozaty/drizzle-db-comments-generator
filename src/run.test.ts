import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject, type Project } from "../test/helpers/project";
import { run, USAGE } from "./run";

let project: Project;
let cwd: string;
let logs: string[];
let errors: unknown[];
const output = { log: (message: string) => logs.push(message), error: (message: unknown) => errors.push(message) };

beforeEach(() => {
  // The schemas import this package as users do, from dist/ built by test/global-setup.ts.
  // Importing src/ there would load it again outside vitest and mix its unexecuted lines into the coverage.
  // drizzle-orm of the schemas (CommonJS) may differ from the one of src/ in vitest; the same instance as in production
  // is checked by the e2e tests (test/cli.test.ts).
  project = createProject({ name: "project" });
  cwd = project.dir;
  logs = [];
  errors = [];
});

afterEach(() => {
  project.remove();
});

const writeConfig = (config: Record<string, unknown> = {}, file = "drizzle.config.json") =>
  fs.writeFileSync(
    path.join(cwd, file),
    JSON.stringify({ dialect: "postgresql", schema: "schema.ts", out: "drizzle", ...config }),
  );

// Each step of a test writes the config and the schema to new files, since modules loaded by require are cached in the process
const writeSchema = (body: string, file = "schema.ts") =>
  fs.writeFileSync(
    path.join(cwd, file),
    `import { pgEnum, pgTable, serial, text } from "drizzle-orm/pg-core";
import { withComment } from "@onozaty/drizzle-db-comments-generator";
${body}`,
  );

describe("run", () => {
  it("prints the SQL with --dry-run", () => {
    // Arrange
    writeConfig();
    writeSchema(
      `export const users = withComment(pgTable("users", { id: withComment(serial("id"), "User ID") }), "Users");`,
    );

    // Act
    const code = run(["--dry-run"], { cwd, output });

    // Assert
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(logs).toEqual([expect.stringContaining(`COMMENT ON COLUMN "users"."id" IS 'User ID';`)]);
  });

  it("appends enum values to comments with --append-enum-values", () => {
    // Arrange
    writeConfig();
    writeSchema(`
const status = pgEnum("status", ["ACTIVE"]);
export const users = pgTable("users", { status: withComment(status("status"), "Status") });`);

    // Act
    const code = run(["--dry-run", "--append-enum-values"], { cwd, output });

    // Assert
    expect(code).toBe(0);
    expect(logs).toEqual([expect.stringContaining(`IS 'Status\nenum: status(ACTIVE)';`)]);
  });

  it("uses the config file given with --config", () => {
    // Arrange
    writeConfig({ schema: "missing.ts" });
    fs.writeFileSync(
      path.join(cwd, "other.config.json"),
      JSON.stringify({ dialect: "postgresql", schema: "schema.ts", out: "drizzle" }),
    );
    writeSchema(`export const users = withComment(pgTable("users", { id: serial("id") }), "Users");`);

    // Act
    const code = run(["--config", "other.config.json", "--dry-run"], { cwd, output });

    // Assert
    expect(code).toBe(0);
    expect(logs).toEqual([expect.stringContaining(`COMMENT ON TABLE "users" IS 'Users';`)]);
  });

  it("prints that the state is updated when only tables or columns are added or dropped", () => {
    // Arrange
    writeConfig();
    writeSchema(`
export const users = pgTable("users", { id: serial("id") });
export const posts = pgTable("posts", { id: serial("id") });`);
    run([], { cwd, output });
    writeConfig({ schema: "schema2.ts" }, "drizzle2.config.json");
    writeSchema(`export const users = pgTable("users", { id: serial("id") });`, "schema2.ts");

    // Act
    const code = run(["--config", "drizzle2.config.json"], { cwd, output });

    // Assert
    expect(code).toBe(0);
    expect(logs).toEqual([
      "No comment changes (updated the state of the schema)",
      "No comment changes (updated the state of the schema)",
    ]);
  });

  it("prints that there are no changes", () => {
    // Arrange
    writeConfig();
    writeSchema(`export const users = pgTable("users", { id: serial("id") });`);
    run([], { cwd, output });
    logs = [];

    // Act
    const code = run([], { cwd, output });

    // Assert
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(logs).toEqual(["No comment changes"]);
  });

  it.each([
    { name: "an unknown option", args: ["--schema", "schema.ts"], message: "Unknown option '--schema'" },
    { name: "an option without its value", args: ["--config"], message: "Option '--config <value>' argument missing" },
    { name: "a positional argument", args: ["schema.ts"], message: "Unexpected argument 'schema.ts'" },
  ])("fails with the usage for $name", ({ args, message }) => {
    // Act
    const code = run(args, { cwd, output });

    // Assert
    expect(code).toBe(1);
    expect(errors).toEqual([expect.stringContaining(message)]);
    expect(errors[0]).toContain(USAGE);
  });

  it("fails with only the message for errors of the input", () => {
    // Act
    const code = run([], { cwd, output });

    // Assert
    expect(code).toBe(1);
    expect(errors).toEqual(["Config file not found: drizzle.config.ts, drizzle.config.js, drizzle.config.json"]);
  });

  it("fails with the error itself, including the stack trace, for unexpected errors", () => {
    // Arrange
    writeConfig();
    writeSchema(`throw new Error("Broken schema");`);

    // Act
    const code = run([], { cwd, output });

    // Assert
    expect(code).toBe(1);
    expect(errors).toEqual([expect.objectContaining({ message: "Broken schema", stack: expect.any(String) })]);
  });
});
