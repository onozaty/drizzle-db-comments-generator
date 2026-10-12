import { describe, expect, it } from "vitest";
import { diff } from "./diff";
import { type CommentsState, type EnumState, stateKey, type TableState } from "./state";

const state = (...tables: TableState[]): CommentsState => ({
  version: 1,
  tables: Object.fromEntries(tables.map((t) => [stateKey(t.schema, t.table), t])),
  enums: {},
});

const withEnums = (base: CommentsState, ...enums: EnumState[]): CommentsState => ({
  ...base,
  enums: Object.fromEntries(enums.map((e) => [stateKey(e.schema, e.name), e])),
});

describe("diff", () => {
  it("returns all comments when there is no previous state", () => {
    // Arrange
    const next = state({ table: "users", comment: "Users", columns: { id: "User ID", name: null } });

    // Act
    const changes = diff(state(), next);

    // Assert
    expect(changes).toEqual([
      { target: "table", table: "users", comment: "Users" },
      { target: "column", table: "users", column: "id", comment: "User ID" },
    ]);
  });

  it("returns only added and changed comments", () => {
    // Arrange
    const prev = state({ table: "users", comment: "Users", columns: { id: "User ID", name: "Name", email: null } });
    const next = state({
      table: "users",
      comment: "Users",
      columns: { id: "User ID", name: "Full name", email: "Email" },
    });

    // Act
    const changes = diff(prev, next);

    // Assert
    expect(changes).toEqual([
      { target: "column", table: "users", column: "name", comment: "Full name" },
      { target: "column", table: "users", column: "email", comment: "Email" },
    ]);
  });

  it("returns null for removed comments", () => {
    // Arrange
    const prev = state({ table: "users", comment: "Users", columns: { id: "User ID" } });
    const next = state({ table: "users", comment: null, columns: { id: null } });

    // Act
    const changes = diff(prev, next);

    // Assert
    expect(changes).toEqual([
      { target: "table", table: "users", comment: null },
      { target: "column", table: "users", column: "id", comment: null },
    ]);
  });

  it("returns nothing when nothing changed", () => {
    // Arrange
    const prev = state({ table: "users", comment: "Users", columns: { id: "User ID", name: null } });

    // Act
    const changes = diff(prev, structuredClone(prev));

    // Assert
    expect(changes).toEqual([]);
  });

  it("ignores tables dropped since the previous state", () => {
    // Arrange
    const prev = state({ table: "users", comment: "Users", columns: { id: "User ID" } });

    // Act
    const changes = diff(prev, state());

    // Assert
    expect(changes).toEqual([]);
  });

  it("ignores columns dropped since the previous state", () => {
    // Arrange
    const prev = state({ table: "users", comment: "Users", columns: { id: "User ID", name: "Name" } });
    const next = state({ table: "users", comment: "Users", columns: { id: "User ID" } });

    // Act
    const changes = diff(prev, next);

    // Assert
    expect(changes).toEqual([]);
  });

  it("keeps the schema of tables in a schema", () => {
    // Arrange
    const next = state({ schema: "auth", table: "users", comment: "Users", columns: {} });

    // Act
    const changes = diff(state(), next);

    // Assert
    expect(changes).toEqual([{ target: "table", schema: "auth", table: "users", comment: "Users" }]);
  });

  it("returns nothing for a new table without comments", () => {
    // Arrange
    const next = state({ table: "users", comment: null, columns: { id: null } });

    // Act
    const changes = diff(state(), next);

    // Assert
    expect(changes).toEqual([]);
  });

  it("returns nothing for a new column without a comment", () => {
    // Arrange
    const prev = state({ table: "users", comment: "Users", columns: { id: "User ID" } });
    const next = state({ table: "users", comment: "Users", columns: { id: "User ID", name: null } });

    // Act
    const changes = diff(prev, next);

    // Assert
    expect(changes).toEqual([]);
  });

  it("does not take inherited properties as previous comments", () => {
    // Arrange
    const prev: CommentsState = JSON.parse(
      JSON.stringify(state({ table: "toString", comment: null, columns: { constructor: null } })),
    );
    const next = state(
      { table: "toString", comment: null, columns: { constructor: null } },
      { table: "constructor", comment: "Table", columns: { valueOf: "Column" } },
    );

    // Act
    const changes = diff(prev, next);

    // Assert
    expect(changes).toEqual([
      { target: "table", table: "constructor", comment: "Table" },
      { target: "column", table: "constructor", column: "valueOf", comment: "Column" },
    ]);
  });

  describe("enums", () => {
    it("returns added, changed and removed enum comments", () => {
      // Arrange
      const prev = withEnums(
        state(),
        { name: "status", comment: "Status", values: ["A"] },
        { name: "color", comment: "Color", values: ["A"] },
        { name: "size", comment: null, values: ["A"] },
      );
      const next = withEnums(
        state(),
        { name: "status", comment: "User status", values: ["A"] },
        { name: "color", comment: null, values: ["A"] },
        { name: "size", comment: "Size", values: ["A"] },
      );

      // Act
      const changes = diff(prev, next);

      // Assert
      expect(changes).toEqual([
        { target: "enum", name: "status", comment: "User status" },
        { target: "enum", name: "color", comment: null },
        { target: "enum", name: "size", comment: "Size" },
      ]);
    });

    it("ignores enums dropped since the previous state and new enums without comments", () => {
      // Arrange
      const prev = withEnums(state(), { name: "status", comment: "Status", values: ["A"] });
      const next = withEnums(state(), { name: "color", comment: null, values: ["A"] });

      // Act
      const changes = diff(prev, next);

      // Assert
      expect(changes).toEqual([]);
    });

    it.each([
      { name: "removed", values: ["A"] },
      { name: "added", values: ["A", "B", "C"] },
    ])("returns the comment again when values are $name, since drizzle-kit may recreate the type", ({ values }) => {
      // Arrange
      const prev = withEnums(state(), { name: "status", comment: "Status", values: ["A", "B"] });
      const next = withEnums(state(), { name: "status", comment: "Status", values });

      // Act
      const changes = diff(prev, next);

      // Assert
      expect(changes).toEqual([{ target: "enum", name: "status", comment: "Status" }]);
    });

    it("returns nothing when values change on an enum without a comment", () => {
      // Arrange
      const prev = withEnums(state(), { name: "status", comment: null, values: ["A", "B"] });
      const next = withEnums(state(), { name: "status", comment: null, values: ["A"] });

      // Act
      const changes = diff(prev, next);

      // Assert
      expect(changes).toEqual([]);
    });

    it("returns enum comments before table comments, and keeps the schema", () => {
      // Arrange
      const next = withEnums(state({ table: "users", comment: "Users", columns: {} }), {
        schema: "shop",
        name: "status",
        comment: "Status",
        values: ["A"],
      });

      // Act
      const changes = diff(state(), next);

      // Assert
      expect(changes).toEqual([
        { target: "enum", schema: "shop", name: "status", comment: "Status" },
        { target: "table", table: "users", comment: "Users" },
      ]);
    });
  });
});
