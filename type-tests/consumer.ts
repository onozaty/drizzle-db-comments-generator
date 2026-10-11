/**
 * Type tests of the public API, written the same way as user code.
 * Type-checked against the source (`pnpm run typecheck`) and against the built type declarations
 * with several TypeScript versions (`pnpm run test:types`).
 */
import { withComment } from "drizzle-db-comments-generator";
import { index, integer, pgEnum, pgSchema, pgTable, pgTableCreator, serial, text } from "drizzle-orm/pg-core";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/** Fails to compile unless the type argument is `true`. */
function assertType<T extends true>(): T | undefined {
  return undefined;
}

const status = pgEnum("status", ["ACTIVE", "INACTIVE"]);

// withComment returns the same type as the table
const columns = () => ({
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age"),
  status: status("status").notNull(),
});
const plain = pgTable("users", columns());
const commented = withComment(pgTable("users", columns()), "Users");
assertType<Equal<typeof commented, typeof plain>>();
assertType<Equal<typeof commented.$inferSelect, typeof plain.$inferSelect>>();
assertType<Equal<typeof commented.$inferInsert, typeof plain.$inferInsert>>();

// withComment returns the same type as the column, so the column types are kept wherever it is in the method chain
const builder = text("name").notNull();
const commentedBuilder = withComment(builder, "Name");
assertType<Equal<typeof commentedBuilder, typeof builder>>();
const chained = withComment(
  pgTable("chained", {
    before: withComment(text("before"), "Before").notNull(),
    after: withComment(text("after").notNull(), "After"),
    optional: withComment(integer("optional"), "Optional"),
    status: withComment(status("status"), "Status").notNull(),
  }),
  "Chained",
);
assertType<
  Equal<
    typeof chained.$inferSelect,
    { before: string; after: string; optional: number | null; status: "ACTIVE" | "INACTIVE" }
  >
>();
const insertable = pgTable("insertable", {
  id: withComment(serial("id"), "ID").primaryKey(),
  count: withComment(integer("count"), "Count").notNull().default(0),
  tags: withComment(text("tags").$type<"a" | "b">(), "Tags").notNull(),
});
assertType<Equal<typeof insertable.$inferInsert, { id?: number; count?: number; tags: "a" | "b" }>>();

// Columns defined with a callback, and the extra config typed with the columns
const posts = withComment(
  pgTable(
    "posts",
    (t) => ({ id: withComment(t.serial().primaryKey(), "Post ID"), title: withComment(t.text().notNull(), "Title") }),
    (table) => [index("posts_title_idx").on(table.title)],
  ),
  "Posts",
);
assertType<Equal<typeof posts.$inferSelect, { id: number; title: string }>>();

// Tables of any table function keep their types
const authUsers = withComment(pgSchema("auth").table("users", { id: serial("id") }), "Users");
assertType<Equal<typeof authUsers._.schema, "auth">>();
const prefixed = withComment(pgTableCreator((name) => `app_${name}`)("users", { id: serial("id") }), "Users");
assertType<Equal<typeof prefixed._.name, "users">>();

// Wrong usages are type errors
// @ts-expect-error the comment must be a string
withComment(pgTable("invalid", { id: serial("id") }), 1);
// @ts-expect-error the comment must be a string
withComment(text("invalid"), 1);
// @ts-expect-error only tables and columns take comments
withComment({ name: "invalid" }, "Comment");
// @ts-expect-error a table function is not a table
withComment(pgTable, "Comment");
// @ts-expect-error a column of a created table is not a column definition
withComment(plain.id, "Comment");
