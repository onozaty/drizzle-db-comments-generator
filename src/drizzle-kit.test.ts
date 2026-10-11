/**
 * Checks that the tables and columns in the state are named the same as the ones drizzle-kit creates,
 * so that comments are never set on names that do not exist in the database.
 */
import { generateDrizzleJson } from "drizzle-kit/api";
import { integer, pgEnum, pgSchema, pgTable, pgTableCreator, serial, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { withComment } from "./comment";
import { buildState, type Casing } from "./state";

const status = pgEnum("status", ["ACTIVE", "INACTIVE"]);

const schema = {
  status,
  // Columns with and without names, in camelCase and snake_case
  userAccounts: withComment(
    pgTable("userAccounts", {
      accountId: withComment(serial().primaryKey(), "Account ID"),
      fullName: withComment(text("full_name"), "Full name"),
      displayName: text("displayName"),
      loginCount: integer().notNull().default(0),
      accountStatus: status(),
    }),
    "User accounts",
  ),
  posts: pgTable("posts", (t) => ({ postId: t.serial().primaryKey(), title_text: t.text() })),
  // Names with acronyms and digits, which are easy to convert differently
  profiles: pgTable("profiles", { userID: integer(), HTMLContent: text(), address2Line: text() }),
  // Table names with a prefix
  prefixedUsers: pgTableCreator((name) => `app_${name}`)("users", { createdBy: text() }),
  sessions: pgSchema("auth").table("sessions", { sessionId: text().primaryKey(), userAgent: text("user_agent") }),
};

/** Tables and their columns, as `schema.table` (or `table`) and column names. */
type Names = Record<string, string[]>;

/** The part of a table in the drizzle-kit snapshot used here (the snapshot types are not resolved to concrete types). */
type SnapshotTable = { schema: string; name: string; columns: Record<string, unknown> };

const namesOfDrizzleKit = (casing: Casing | undefined): Names => {
  const tables = generateDrizzleJson(schema, undefined, undefined, casing).tables as Record<string, SnapshotTable>;
  return Object.fromEntries(
    Object.values(tables).map((t) => [t.schema ? `${t.schema}.${t.name}` : t.name, Object.keys(t.columns)]),
  );
};

const namesOfState = (casing: Casing | undefined): Names =>
  Object.fromEntries(
    Object.values(buildState([schema], { casing }).tables).map((t) => [
      t.schema ? `${t.schema}.${t.table}` : t.table,
      Object.keys(t.columns),
    ]),
  );

describe("compatibility with drizzle-kit", () => {
  it.each([{ casing: undefined }, { casing: "snake_case" as const }, { casing: "camelCase" as const }])(
    "names tables and columns the same as drizzle-kit with casing $casing",
    ({ casing }) => {
      // Act
      const state = namesOfState(casing);

      // Assert
      expect(state).toEqual(namesOfDrizzleKit(casing));
    },
  );
});
