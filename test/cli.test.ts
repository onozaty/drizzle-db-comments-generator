/**
 * Runs the built package in temporary projects of both ES modules and CommonJS:
 * the CLI, to check how config files and schemas are actually loaded with tsx,
 * and the library at runtime, to check that `.comment()` is added to the drizzle-orm the project uses.
 * (Inside vitest, imports are handled by vite, so unit tests cannot check these.)
 */
import { afterEach, describe, expect, it } from "vitest";
import { createProject, type Project } from "./helpers/project";

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

let project: Project | undefined;

/** A project with a schema importing another file without the extension, and a config file in TypeScript. */
const setUp = (packageJson: Record<string, unknown>): Project => {
  project = createProject(packageJson);
  project.write("src/schema.ts", SCHEMA);
  project.write("src/enums.ts", ENUMS);
  project.write("drizzle.config.ts", CONFIG);
  return project;
};

afterEach(() => {
  project?.remove();
  project = undefined;
});

describe("cli", () => {
  it.each([
    { name: "an ES module project", packageJson: { name: "project", type: "module" } },
    { name: "a CommonJS project", packageJson: { name: "project" } },
  ])("loads the config and the schema in $name", ({ packageJson }) => {
    // Arrange
    const project = setUp(packageJson);

    // Act
    const result = project.runCli("--dry-run");

    // Assert
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`COMMENT ON TABLE "users" IS 'Users';`);
    expect(result.stdout).toContain(`COMMENT ON COLUMN "users"."id" IS 'User ID';`);
    expect(result.stdout).toContain(`COMMENT ON COLUMN "users"."status" IS 'Status';`);
  });

  it("names columns by the casing in the config", () => {
    // Arrange
    const project = setUp({ name: "project" });
    project.write(
      "src/schema.ts",
      `
import { text } from "drizzle-orm/pg-core";
import { pgTableWithComment } from "drizzle-db-comments-generator";

export const users = pgTableWithComment("users", "Users", { fullName: text().comment("Full name") });
`,
    );
    project.write("drizzle.config.ts", CONFIG.replace(`out: "./drizzle"`, `out: "./drizzle", casing: "snake_case"`));

    // Act
    const result = project.runCli("--dry-run");

    // Assert
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`COMMENT ON COLUMN "users"."full_name" IS 'Full name';`);
  });

  it("fails with the usage for an unknown option", () => {
    // Arrange
    const project = setUp({ name: "project" });

    // Act
    const result = project.runCli("--schema", "src/schema.ts");

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
    const project = setUp(packageJson);
    project.write("app.js", app);

    // Act
    const result = project.runNode("app.js");

    // Assert
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("Name\n");
  });
});
