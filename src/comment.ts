/**
 * Defines database comments of tables and columns in Drizzle schemas.
 *
 *   import { withComment } from "@onozaty/drizzle-db-comments-generator";
 *
 *   export const users = withComment(
 *     pgTable("users", {
 *       id: withComment(serial("id").primaryKey(), "User ID"),
 *     }),
 *     "Users",
 *   );
 *
 * Comments are only kept on the table and column objects, and do not affect Drizzle itself
 * (query building or drizzle-kit's diff detection).
 */
import { type Column, ColumnBuilder, type ColumnBuilderBase, is, Table } from "drizzle-orm";

// Symbols so that the keys never collide with columns of tables or with properties drizzle-orm may add to column configs.
// Symbol.for so that the keys match even if this module is loaded more than once (ES modules and CommonJS).
const TableComment = Symbol.for("drizzle-db-comments-generator:TableComment");
const ColumnComment = Symbol.for("drizzle-db-comments-generator:ColumnComment");

/**
 * Sets the database comment of a table or a column definition, and returns it as is.
 * Works with tables of any table function (`pgTable`, `pgSchema("x").table`, `pgTableCreator(...)`)
 * and with any column definition (column builder such as `text("name")`), not with columns of a created table (`users.id`).
 *
 * The comment is written to the given object: a column definition shared by several tables has the same comment in all of them.
 */
export function withComment<T extends Table>(table: T, comment: string): T;
export function withComment<T extends ColumnBuilderBase>(column: T, comment: string): T;
export function withComment(target: unknown, comment: string): unknown {
  if (is(target, Table)) {
    (target as unknown as Record<symbol, unknown>)[TableComment] = comment;
    return target;
  }
  if (is(target, ColumnBuilder)) {
    // drizzle-orm passes the config object of the builder as is to the built column
    (target as unknown as { config: Record<symbol, unknown> }).config[ColumnComment] = comment;
    return target;
  }
  throw new TypeError('withComment() takes a table or a column definition such as text("name")');
}

export function getColumnComment(column: Column): string | undefined {
  return (column as unknown as { config: Record<symbol, string | undefined> }).config[ColumnComment];
}

export function getTableComment(table: Table): string | undefined {
  return (table as unknown as Record<symbol, string | undefined>)[TableComment];
}
