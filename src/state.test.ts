import { pgEnum, pgSchema, pgTable, serial, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { pgTableWithComment, withComment } from "./comment";
import { buildState } from "./state";

describe("buildState", () => {
  it("collects table and column comments", () => {
    // Arrange
    const users = pgTableWithComment("users", "Users", {
      id: serial("id").primaryKey().comment("User ID"),
      name: text("name"),
    });

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state).toEqual({ '"users"': { table: "Users", columns: { id: "User ID" } } });
  });

  it("uses the schema-qualified name as the key for tables in a schema", () => {
    // Arrange
    const users = withComment(pgSchema("auth").table)("users", "Users", { id: serial("id") });

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(Object.keys(state)).toEqual(['"auth"."users"']);
  });

  it("collects tables from multiple modules", () => {
    // Arrange
    const users = pgTableWithComment("users", "Users", { id: serial("id") });
    const posts = pgTableWithComment("posts", "Posts", { id: serial("id") });

    // Act
    const state = buildState([{ users }, { posts }]);

    // Assert
    expect(Object.keys(state)).toEqual(['"users"', '"posts"']);
  });

  it("ignores exports other than tables", () => {
    // Arrange
    const users = pgTableWithComment("users", "Users", { id: serial("id") });
    const status = pgEnum("status", ["A", "B"]);

    // Act
    const state = buildState([{ users, status, helper: () => 1, value: 1 }]);

    // Assert
    expect(Object.keys(state)).toEqual(['"users"']);
  });

  it("omits tables without any comments", () => {
    // Arrange
    const users = pgTable("users", { id: serial("id") });

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state).toEqual({});
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
      expect(state['"users"']?.columns.status).toBe(expected);
    });

    it("does not append the enum values when disabled", () => {
      // Arrange
      const users = pgTable("users", { status: status("status").comment("Status") });

      // Act
      const state = buildState([{ users }]);

      // Assert
      expect(state['"users"']?.columns.status).toBe("Status");
    });
  });
});
