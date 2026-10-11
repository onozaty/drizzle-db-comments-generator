import { getTableConfig, index, integer, pgSchema, pgTable, serial, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { getColumnComment, getTableComment, pgTableWithComment, withComment } from "./comment";

describe("pgTableWithComment", () => {
  it("keeps the table comment", () => {
    // Arrange & Act
    const table = pgTableWithComment("users", "Users", { id: serial("id").primaryKey() });

    // Assert
    expect(getTableComment(table)).toBe("Users");
  });

  it("keeps the table comment when columns are defined with a callback", () => {
    // Arrange & Act
    const table = pgTableWithComment("users", "Users", (t) => ({ id: t.serial("id").primaryKey() }));

    // Assert
    expect(getTableComment(table)).toBe("Users");
  });

  it("keeps column comments when columns are defined with a callback", () => {
    // Arrange & Act
    const table = pgTableWithComment("users", "Users", (t) => ({ id: t.serial("id").primaryKey().comment("User ID") }));

    // Assert
    expect(getColumnComment(table.id)).toBe("User ID");
  });

  it("passes extraConfig through to pgTable", () => {
    // Arrange & Act
    const table = pgTableWithComment("users", "Users", { name: text("name") }, (t) => [
      index("users_name_idx").on(t.name),
    ]);

    // Assert
    expect(getTableConfig(table).indexes.map((i) => i.config.name)).toEqual(["users_name_idx"]);
  });

  it("works with a column named 'comment'", () => {
    // Arrange & Act
    const table = pgTableWithComment("posts", "Posts", { comment: text("comment").comment("Body") });

    // Assert
    expect(getTableComment(table)).toBe("Posts");
    expect(getColumnComment(table.comment)).toBe("Body");
  });

  it("produces the same table config as pgTable", () => {
    // Arrange
    const columns = () => ({
      id: serial("id").primaryKey(),
      name: text("name").notNull().unique(),
      age: integer("age").default(0),
    });

    // Act
    const plain = getTableConfig(pgTable("users", columns()));
    const commented = getTableConfig(pgTableWithComment("users", "Users", columns()));

    // Assert
    const summarize = (config: ReturnType<typeof getTableConfig>) => ({
      name: config.name,
      schema: config.schema,
      columns: config.columns.map((c) => [c.name, c.notNull, c.primary, c.isUnique, c.hasDefault]),
    });
    expect(summarize(commented)).toEqual(summarize(plain));
  });
});

describe("withComment", () => {
  it("keeps the table comment and the schema of pgSchema tables", () => {
    // Arrange
    const authTable = withComment(pgSchema("auth").table);

    // Act
    const table = authTable("users", "Users", { id: serial("id").primaryKey() });

    // Assert
    expect(getTableComment(table)).toBe("Users");
    expect(getTableConfig(table).schema).toBe("auth");
  });
});

describe(".comment()", () => {
  it("keeps the column comment regardless of its position in the method chain", () => {
    // Arrange & Act
    const table = pgTable("users", {
      before: text("before").comment("Before").notNull(),
      after: text("after").notNull().comment("After"),
    });

    // Assert
    expect(getColumnComment(table.before)).toBe("Before");
    expect(getColumnComment(table.after)).toBe("After");
    expect(table.before.notNull).toBe(true);
    expect(table.after.notNull).toBe(true);
  });
});

describe("getTableComment / getColumnComment", () => {
  it("returns undefined when no comment is set", () => {
    // Arrange & Act
    const table = pgTable("users", { id: serial("id") });

    // Assert
    expect(getTableComment(table)).toBeUndefined();
    expect(getColumnComment(table.id)).toBeUndefined();
  });
});
