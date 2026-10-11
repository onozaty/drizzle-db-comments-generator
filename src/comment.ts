/**
 * Extensions for defining database table/column comments in Drizzle schemas.
 *
 *   import { pgTableWithComment } from "drizzle-db-comments-generator";
 *
 *   export const users = pgTableWithComment("users", "Users", {
 *     id: serial("id").primaryKey().comment("User ID"),
 *   });
 *
 * Comments are only kept on runtime objects and do not affect Drizzle itself
 * (query building or drizzle-kit's diff detection).
 */
import { type BuildColumns, type BuildExtraConfigColumns, type Column, ColumnBuilder } from "drizzle-orm";
import {
  type PgColumnBuilderBase,
  type PgTable,
  type PgTableExtraConfigValue,
  type PgTableFn,
  type PgTableWithColumns,
  pgTable,
} from "drizzle-orm/pg-core";
import type { PgColumnsBuilders } from "drizzle-orm/pg-core/columns/all";

// Symbol.for so that the key matches even if this module is loaded more than once
const TableComment = Symbol.for("generate-db-comments:TableComment");

// =====================================================================
// Table: pgTableWithComment
// =====================================================================

type ExtraConfig<TName extends string, TColumns extends Record<string, PgColumnBuilderBase>> = (
  self: BuildExtraConfigColumns<TName, TColumns, "pg">,
) => PgTableExtraConfigValue[];

type TableResult<
  TSchema extends string | undefined,
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
> = PgTableWithColumns<{
  name: TName;
  schema: TSchema;
  columns: BuildColumns<TName, TColumns, "pg">;
  dialect: "pg";
}>;

/** Same as `pgTable`, but takes a table comment right after the table name. */
export interface PgTableWithCommentFn<TSchema extends string | undefined = undefined> {
  <TName extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
    name: TName,
    comment: string,
    columns: TColumns,
    extraConfig?: ExtraConfig<TName, TColumns>,
  ): TableResult<TSchema, TName, TColumns>;
  <TName extends string, TColumns extends Record<string, PgColumnBuilderBase>>(
    name: TName,
    comment: string,
    columns: (columnTypes: PgColumnsBuilders) => TColumns,
    extraConfig?: ExtraConfig<TName, TColumns>,
  ): TableResult<TSchema, TName, TColumns>;
}

/**
 * Converts any `PgTableFn` (`pgTable` / `pgSchema("x").table` / `pgTableCreator(...)`)
 * into a version that takes a table comment.
 *
 *   const authTable = withComment(pgSchema("auth").table);
 *   export const users = authTable("users", "Users", { ... });
 */
export function withComment<TSchema extends string | undefined>(
  tableFn: PgTableFn<TSchema>,
): PgTableWithCommentFn<TSchema> {
  // Types are guaranteed by the PgTableWithCommentFn overloads; the implementation just passes arguments through
  const fn = tableFn as (...args: unknown[]) => PgTable;
  return ((name: string, comment: string, columns: unknown, extraConfig?: unknown) => {
    const table = fn(name, columns, extraConfig);
    (table as unknown as Record<symbol, unknown>)[TableComment] = comment;
    return table;
  }) as unknown as PgTableWithCommentFn<TSchema>;
}

/** `pgTable` that takes a table comment right after the table name. */
export const pgTableWithComment = withComment(pgTable);

// =====================================================================
// Column: .comment()
// =====================================================================

declare module "drizzle-orm/column-builder" {
  // Repeats the type parameters of ColumnBuilder so that the declarations merge reliably, even though they are unused here
  interface ColumnBuilder<
    T extends ColumnBuilderBaseConfig<ColumnDataType, string> = ColumnBuilderBaseConfig<ColumnDataType, string>,
    TRuntimeConfig extends object = object,
    TTypeConfig extends object = object,
    TExtraConfig extends ColumnBuilderExtraConfig = ColumnBuilderExtraConfig,
  > {
    /** Sets the database column comment. */
    comment(text: string): this;
  }
}

// Relies on drizzle-orm passing the builder's config object as-is to the built column's config
(
  ColumnBuilder.prototype as unknown as {
    comment: (this: { config: Record<string, unknown> }, text: string) => unknown;
  }
).comment = function (text) {
  this.config.comment = text;
  return this;
};

// =====================================================================
// Accessors
// =====================================================================

export function getColumnComment(column: Column): string | undefined {
  return (column as unknown as { config: { comment?: string } }).config.comment;
}

export function getTableComment(table: PgTable): string | undefined {
  return (table as unknown as Record<symbol, string | undefined>)[TableComment];
}
