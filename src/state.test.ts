import { pgEnum, pgSchema, pgTable, serial, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { withComment } from "./comment";
import { buildState } from "./state";

describe("buildState", () => {
  it("collects table and column comments", () => {
    // Arrange
    const users = withComment(
      pgTable("users", {
        id: withComment(serial("id").primaryKey(), "User ID"),
      }),
      "Users",
    );

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state).toEqual({
      version: 1,
      tables: { users: { schema: undefined, table: "users", comment: "Users", columns: { id: "User ID" } } },
      enums: {},
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
    const users = withComment(pgTable("users", { id: withComment(serial("id"), "") }), "");

    // Act
    const state = buildState([{ users }]);

    // Assert
    expect(state.tables.users).toMatchObject({ comment: null, columns: { id: null } });
  });

  it("keys tables in a schema by schema.table and keeps the schema", () => {
    // Arrange
    const users = withComment(pgSchema("auth").table("users", { id: serial("id") }), "Users");

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
    const table = pgTable("__proto__", {
      constructor: text("constructor"),
      proto: withComment(text("__proto__"), "Proto"),
    });

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

  describe("enums", () => {
    it("collects exported enums with or without comments", () => {
      // Arrange
      const status = withComment(pgEnum("status", ["ACTIVE"]), "Status");
      const color = pgEnum("color", { Red: "red" });

      // Act
      const state = buildState([{ status, color }]);

      // Assert
      expect(state.enums).toEqual({
        status: { schema: undefined, name: "status", comment: "Status", values: ["ACTIVE"] },
        color: { schema: undefined, name: "color", comment: null, values: ["red"] },
      });
    });

    it("keys enums in a schema by schema.name and keeps the schema", () => {
      // Arrange
      const status = withComment(pgSchema("shop").enum("status", ["ACTIVE"]), "Status");

      // Act
      const state = buildState([{ status }]);

      // Assert
      expect(state.enums["shop.status"]).toEqual({
        schema: "shop",
        name: "status",
        comment: "Status",
        values: ["ACTIVE"],
      });
    });

    it("does not collect enums that are not exported", () => {
      // Arrange
      const status = withComment(pgEnum("status", ["ACTIVE"]), "Status");
      const users = pgTable("users", { status: status("status") });

      // Act
      const state = buildState([{ users }]);

      // Assert
      expect(state.enums).toEqual({});
    });

    it("throws an error when different enums map to the same key", () => {
      // Arrange
      const first = pgEnum("status", ["A"]);
      const second = pgEnum("status", ["B"]);

      // Act & Assert
      expect(() => buildState([{ first }, { second }])).toThrow(`Multiple enums map to the same name "status"`);
    });
  });

  describe("casing", () => {
    const users = pgTable("users", { userId: serial().primaryKey(), fullName: text("full_name") });

    it.each([
      { casing: undefined, expected: ["userId", "full_name"] },
      { casing: "snake_case" as const, expected: ["user_id", "full_name"] },
      { casing: "camelCase" as const, expected: ["userId", "full_name"] },
    ])("names columns without names by casing $casing", ({ casing, expected }) => {
      // Act
      const state = buildState([{ users }], { casing });

      // Assert
      expect(Object.keys(state.tables.users?.columns ?? {})).toEqual(expected);
    });
  });

  describe("appendEnumValues", () => {
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
      const users = pgTable("users", { status: comment ? withComment(column, comment) : column });

      // Act
      const state = buildState([{ users }], { appendEnumValues: true });

      // Assert
      expect(state.tables.users?.columns.status).toBe(expected);
    });

    it("does not append the enum values when disabled", () => {
      // Arrange
      const users = pgTable("users", { status: withComment(status("status"), "Status") });

      // Act
      const state = buildState([{ users }]);

      // Assert
      expect(state.tables.users?.columns.status).toBe("Status");
    });
  });
});
