import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pgTableWithComment } from "./comment";
import { diff } from "./diff";
import { generate as generateMigration } from "./generate";
import { toPostgresSql } from "./postgres";
import { buildState } from "./state";

/** Generates the migration SQL for a schema change, from the schema definitions before and after the change. */
const generate = (before: Record<string, unknown>, after: Record<string, unknown>) => {
  const changes = diff(buildState([before]), buildState([after]));
  return changes.length > 0 ? toPostgresSql(changes) : undefined;
};

describe("generating comment migrations from schema changes", () => {
  it("sets comments to NULL when all comments of an existing table are removed", () => {
    // Arrange
    const before = pgTableWithComment("users", "Users", { id: serial("id").comment("User ID") });
    const after = pgTable("users", { id: serial("id") });

    // Act
    const sql = generate({ users: before }, { users: after });

    // Assert
    expect(sql).toContain(`COMMENT ON TABLE "users" IS NULL;`);
    expect(sql).toContain(`COMMENT ON COLUMN "users"."id" IS NULL;`);
  });

  it("does not touch the comment of a dropped column", () => {
    // Arrange
    const before = pgTable("users", { id: serial("id").comment("User ID"), name: text("name").comment("Name") });
    const after = pgTable("users", { id: serial("id").comment("User ID") });

    // Act
    const sql = generate({ users: before }, { users: after });

    // Assert
    expect(sql).toBeUndefined();
  });
});

describe("generate", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-"));
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("sets the comment again on a column re-added after being dropped", () => {
    // Arrange
    const withName = pgTable("users", { id: serial("id"), name: text("name").comment("Name") });
    const withoutName = pgTable("users", { id: serial("id") });
    const saved = buildState([{ users: withName }]);
    fs.writeFileSync(path.join(outDir, "comments-latest.json"), JSON.stringify(saved));
    // Dropping the column needs no comment statement, but has to be recorded in the state
    generateMigration([{ users: withoutName }], {
      outDir,
      migrationName: "update_comments",
      configPath: "drizzle.config.ts",
    });

    // Act
    const result = generateMigration([{ users: withName }], {
      outDir,
      migrationName: "update_comments",
      configPath: "drizzle.config.ts",
      dryRun: true,
    });

    // Assert
    expect(result).toEqual({
      status: "dry-run",
      sql: expect.stringContaining(`COMMENT ON COLUMN "users"."name" IS 'Name';`),
    });
  });
});
