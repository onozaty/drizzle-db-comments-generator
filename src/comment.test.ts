import {
  getTableConfig,
  index,
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  pgTableCreator,
  serial,
  text,
} from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { getColumnComment, getEnumComment, getTableComment, withComment } from "./comment";

describe("withComment", () => {
  describe("tables", () => {
    it.each([
      { name: "pgTable", create: () => pgTable("users", { id: serial("id") }) },
      { name: "pgSchema().table", create: () => pgSchema("auth").table("users", { id: serial("id") }) },
      {
        name: "pgTableCreator()",
        create: () => pgTableCreator((name) => `app_${name}`)("users", { id: serial("id") }),
      },
    ])("keeps the comment of a table created with $name", ({ create }) => {
      // Arrange
      const table = create();

      // Act
      const result = withComment(table, "Users");

      // Assert
      expect(getTableComment(result)).toBe("Users");
    });

    it("returns the same table", () => {
      // Arrange
      const table = pgTable("users", { id: serial("id") }, (t) => [index("users_id_idx").on(t.id)]);

      // Act
      const result = withComment(table, "Users");

      // Assert
      expect(result).toBe(table);
    });

    it("works with a column named 'comment'", () => {
      // Arrange
      const table = pgTable("posts", { comment: withComment(text("comment"), "Body") });

      // Act
      const result = withComment(table, "Posts");

      // Assert
      expect(getTableComment(result)).toBe("Posts");
      expect(getColumnComment(result.comment)).toBe("Body");
    });
  });

  describe("columns", () => {
    it("keeps the comment of a column", () => {
      // Arrange
      const table = pgTable("users", { id: withComment(serial("id").primaryKey(), "User ID") });

      // Act
      const comment = getColumnComment(table.id);

      // Assert
      expect(comment).toBe("User ID");
    });

    it("keeps the comment regardless of its position in the method chain", () => {
      // Arrange
      const table = pgTable("users", {
        before: withComment(text("before"), "Before").notNull(),
        after: withComment(text("after").notNull(), "After"),
      });

      // Act
      const comments = [getColumnComment(table.before), getColumnComment(table.after)];

      // Assert
      expect(comments).toEqual(["Before", "After"]);
      expect([table.before.notNull, table.after.notNull]).toEqual([true, true]);
    });

    it("keeps the comment of columns defined with a callback", () => {
      // Arrange
      const table = pgTable("users", (t) => ({ id: withComment(t.serial().primaryKey(), "User ID") }));

      // Act
      const comment = getColumnComment(table.id);

      // Assert
      expect(comment).toBe("User ID");
    });

    it("does not change the table config", () => {
      // Arrange
      const columns = (commented: boolean) => ({
        id: serial("id").primaryKey(),
        name: commented ? withComment(text("name").notNull().unique(), "Name") : text("name").notNull().unique(),
        age: integer("age").default(0),
      });
      const summarize = (config: ReturnType<typeof getTableConfig>) =>
        config.columns.map((c) => [c.name, c.notNull, c.primary, c.isUnique, c.hasDefault]);

      // Act
      const commented = getTableConfig(withComment(pgTable("users", columns(true)), "Users"));
      const plain = getTableConfig(pgTable("users", columns(false)));

      // Assert
      expect(summarize(commented)).toEqual(summarize(plain));
    });
  });

  describe("enums", () => {
    it.each([
      { name: "pgEnum with values", create: () => pgEnum("status", ["ACTIVE", "INACTIVE"]) },
      { name: "pgEnum with an object", create: () => pgEnum("color", { Red: "red" }) },
      { name: "pgSchema().enum", create: () => pgSchema("shop").enum("status", ["ACTIVE"]) },
    ])("keeps the comment of an enum created with $name, and returns the same enum", ({ create }) => {
      // Arrange
      const enumType = create();

      // Act
      const result = withComment(enumType, "Enum");

      // Assert
      expect(result).toBe(enumType);
      expect(getEnumComment(result)).toBe("Enum");
    });

    it("keeps the enum usable for columns", () => {
      // Arrange
      const status = withComment(pgEnum("status", ["ACTIVE"]), "Status");

      // Act
      const table = pgTable("users", { status: status("status") });

      // Assert
      expect(getTableConfig(table).columns[0]?.getSQLType()).toBe("status");
    });
  });

  it.each([
    { name: "an object", target: {} },
    { name: "null", target: null },
    { name: "a table function", target: pgTable },
    { name: "a column of a created table", target: pgTable("users", { id: serial("id") }).id },
  ])("throws an error for $name", ({ target }) => {
    // Act & Assert
    expect(() => withComment(target as never, "Comment")).toThrow("withComment() takes a table, a column definition");
  });
});

describe("getTableComment / getColumnComment", () => {
  it("returns undefined when no comment is set", () => {
    // Arrange
    const table = pgTable("users", { id: serial("id") });

    // Act
    const comments = [getTableComment(table), getColumnComment(table.id)];

    // Assert
    expect(comments).toEqual([undefined, undefined]);
  });
});
