import { pgEnum, pgSchema, pgTable, serial, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { pgTableWithComment, withComment } from "./comment";
import { buildState } from "./state";

describe("buildState", () => {
  it("collects table and column comments", () => {
    // Arrange
    const users = pgTableWithComment("users", "Users", {
      id: serial("id").primaryKey().comment("User ID"),
    });

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state).toEqual({
      version: 1,
      tables: { users: { schema: undefined, table: "users", comment: "Users", columns: { id: "User ID" } } },
    });
  });

  it("keeps tables and columns without comments as null", () => {
    // Arrange
    const users = pgTable("users", { id: serial("id"), name: text("name") });

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state.tables.users).toEqual({
      schema: undefined,
      table: "users",
      comment: null,
      columns: { id: null, name: null },
    });
  });

  it("treats an empty comment as no comment", () => {
    // Arrange
    const users = pgTableWithComment("users", "", { id: serial("id").comment("") });

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state.tables.users).toMatchObject({ comment: null, columns: { id: null } });
  });

  it("keys tables in a schema by schema.table and keeps the schema", () => {
    // Arrange
    const users = withComment(pgSchema("auth").table)("users", "Users", { id: serial("id") });

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state.tables["auth.users"]).toMatchObject({ schema: "auth", table: "users" });
  });

  it("collects a table exported more than once only once", () => {
    // Arrange
    const users = pgTable("users", { id: serial("id") });

    // Act
    const state = buildState([{ users, alias: users }, { users }]);

    // Assert
    expect(Object.keys(state.tables)).toEqual(["users"]);
  });

  it("throws an error when different tables map to the same key", () => {
    // Arrange
    const dotted = pgTable("auth.users", { id: serial("id") });
    const inSchema = pgSchema("auth").table("users", { id: serial("id") });

    // Act & Assert
    expect(() => buildState([{ dotted, inSchema }])).toThrow(`Multiple tables map to the same name "auth.users"`);
  });

  it("keeps tables and columns with names of Object properties", () => {
    // Arrange
    const table = pgTable("__proto__", { constructor: text("constructor"), proto: text("__proto__").comment("Proto") });

    // Act
    const state = buildState([{ table }]);

    // Assert
    expect(Object.entries(state.tables).map(([key, t]) => [key, Object.entries(t.columns)])).toEqual([
      [
        "__proto__",
        [
          ["constructor", null],
          ["__proto__", "Proto"],
        ],
      ],
    ]);
  });

  it("collects tables from multiple modules", () => {
    // Arrange
    const users = pgTable("users", { id: serial("id") });
    const posts = pgTable("posts", { id: serial("id") });

    // Act
    const state = buildState([{ users }, { posts }]);

    // Assert
    expect(Object.keys(state.tables)).toEqual(["users", "posts"]);
  });

  it("ignores exports other than tables", () => {
    // Arrange
    const users = pgTable("users", { id: serial("id") });
    const status = pgEnum("status", ["A", "B"]);

    // Act
    const state = buildState([{ users, status, helper: () => 1, value: 1 }]);

    // Assert
    expect(Object.keys(state.tables)).toEqual(["users"]);
  });

  describe("includeEnum", () => {
    const status = pgEnum("status", ["ACTIVE", "INACTIVE"]);

    it.each([
      {
        name: "appends the enum values to the comment",
        comment: "Status",
        expected: "Status\nenum: status(ACTIVE, INACTIVE)",
      },
      {
        name: "uses the enum values as the comment when there is none",
        comment: undefined,
        expected: "enum: status(ACTIVE, INACTIVE)",
      },
    ])("$name", ({ comment, expected }) => {
      // Arrange
      const column = status("status");
      const users = pgTable("users", { status: comment ? column.comment(comment) : column });

      // Act
      const state = buildState([{ users }], { includeEnum: true });

      // Assert
      expect(state.tables.users?.columns.status).toBe(expected);
    });

    it("does not append the enum values when disabled", () => {
      // Arrange
      const users = pgTable("users", { status: status("status").comment("Status") });

      // Act
      const state = buildState([{ users }]);

      // Assert
      expect(state.tables.users?.columns.status).toBe("Status");
    });
  });
});
