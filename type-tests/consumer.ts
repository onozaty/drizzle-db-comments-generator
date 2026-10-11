/**
 * Type tests of the public API, written the same way as user code.
 * Type-checked against the source (`pnpm run typecheck`) and against the built type declarations
 * with several TypeScript versions (`pnpm run test:types`).
 */
import { type PgTableWithCommentFn, pgTableWithComment, withComment } from "drizzle-db-comments-generator";
import { index, integer, pgEnum, pgSchema, pgTable, pgTableCreator, serial, text } from "drizzle-orm/pg-core";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/** Fails to compile unless the type argument is `true`. */
function assertType<T extends true>(): T | undefined {
  return undefined;
}

const status = pgEnum("status", ["ACTIVE", "INACTIVE"]);

// pgTableWithComment returns the same type as pgTable
const columns = () => ({
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age"),
  status: status("status").notNull(),
});
const plain = pgTable("users", columns());
const commented = pgTableWithComment("users", "Users", columns());
assertType<Equal<typeof commented, typeof plain>>();
assertType<Equal<typeof commented.$inferSelect, typeof plain.$inferSelect>>();
assertType<Equal<typeof commented.$inferInsert, typeof plain.$inferInsert>>();

// The exported function type
assertType<Equal<typeof pgTableWithComment, PgTableWithCommentFn>>();
const authTableFn: PgTableWithCommentFn<"auth"> = withComment(pgSchema("auth").table);

// .comment() takes a string and returns the builder itself, so the column types are kept wherever it is in the method chain
const builder = text("name").notNull();
assertType<Equal<Parameters<typeof builder.comment>, [text: string]>>();
assertType<Equal<ReturnType<typeof builder.comment>, typeof builder>>();
const chained = pgTableWithComment("chained", "Chained", {
  before: text("before").comment("Before").notNull(),
  after: text("after").notNull().comment("After"),
  optional: integer("optional").comment("Optional"),
  status: status("status").comment("Status").notNull(),
});
assertType<
  Equal<
    typeof chained.$inferSelect,
    { before: string; after: string; optional: number | null; status: "ACTIVE" | "INACTIVE" }
  >
>();
const insertable = pgTableWithComment("insertable", "Insertable", {
  id: serial("id").comment("ID").primaryKey(),
  count: integer("count").comment("Count").notNull().default(0),
  tags: text("tags").$type<"a" | "b">().comment("Tags").notNull(),
});
assertType<Equal<typeof insertable.$inferInsert, { id?: number; count?: number; tags: "a" | "b" }>>();

// Columns defined with a callback, and the extra config typed with the columns
const posts = pgTableWithComment(
  "posts",
  "Posts",
  (t) => ({ id: t.serial().primaryKey().comment("Post ID"), title: t.text().notNull().comment("Title") }),
  (table) => [index("posts_title_idx").on(table.title)],
);
assertType<Equal<typeof posts.$inferSelect, { id: number; title: string }>>();

// Columns as an object, with the extra config
const comments = pgTableWithComment(
  "comments",
  "Comments",
  { id: serial("id").primaryKey(), body: text("body").notNull() },
  (table) => [index("comments_body_idx").on(table.body)],
);
assertType<Equal<typeof comments.$inferSelect, { id: number; body: string }>>();

// withComment works with any table function, and keeps its schema
const prefixed = withComment(pgTableCreator((name) => `app_${name}`))("users", "Users", { id: serial("id") });
assertType<Equal<typeof prefixed._.name, "users">>();
const authUsers = authTableFn("users", "Users", { id: serial("id").comment("User ID") });
assertType<Equal<typeof authUsers._.schema, "auth">>();

// Wrong usages are type errors
// @ts-expect-error the table comment must be a string
pgTableWithComment("invalid", 1, { id: serial("id") });
// @ts-expect-error the columns come after the table comment
pgTableWithComment("invalid", { id: serial("id") });
// @ts-expect-error the column comment must be a string
text("invalid").comment(1);
