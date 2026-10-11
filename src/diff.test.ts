import { describe, expect, it } from "vitest";
import { diff } from "./diff";
import { type CommentsState, stateKey, type TableState } from "./state";

const state = (...tables: TableState[]): CommentsState => ({
  version: 1,
  tables: Object.fromEntries(tables.map((t) => [stateKey(t.schema, t.table), t])),
});

describe("diff", () => {
  it("returns all comments when there is no previous state", () => {
    // Arrange
    const next = state({ table: "users", comment: "Users", columns: { id: "User ID", name: null } });

    // Act
    const changes = diff(state(), next);

    // Assert
    expect(changes).toEqual([
      { table: "users", comment: "Users" },
      { table: "users", column: "id", comment: "User ID" },
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
      { table: "users", column: "name", comment: "Full name" },
      { table: "users", column: "email", comment: "Email" },
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
      { table: "users", comment: null },
      { table: "users", column: "id", comment: null },
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
    expect(changes).toEqual([{ schema: "auth", table: "users", comment: "Users" }]);
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
      { table: "constructor", comment: "Table" },
      { table: "constructor", column: "valueOf", comment: "Column" },
    ]);
  });
});
