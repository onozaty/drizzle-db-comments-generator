import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getColumnComment, getTableComment } from "./comment";

export type TableComments = { table?: string; columns: Record<string, string> };

/** Comments of all tables, keyed by the quoted table name (`"schema"."table"` or `"table"`). */
export type CommentsState = Record<string, TableComments>;

export type BuildStateOptions = {
  /** Appends `enum: name(value, ...)` to the comments of enum columns. */
  includeEnum?: boolean;
};

/** Collects table/column comments from the exports of schema modules. */
export function buildState(modules: Record<string, unknown>[], options: BuildStateOptions = {}): CommentsState {
  const state: CommentsState = {};
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      const key = `${config.schema ? `"${config.schema}".` : ""}"${config.name}"`;
      const entry: TableComments = { table: getTableComment(value), columns: {} };

      for (const column of config.columns) {
        let comment = getColumnComment(column);
        const enumInfo = (column as { enum?: { enumName: string; enumValues: string[] } }).enum;
        if (options.includeEnum && enumInfo) {
          const line = `enum: ${enumInfo.enumName}(${enumInfo.enumValues.join(", ")})`;
          comment = comment ? `${comment}\n${line}` : line;
        }
        if (comment) entry.columns[column.name] = comment;
      }
      if (entry.table || Object.keys(entry.columns).length > 0) state[key] = entry;
    }
  }
  return state;
}
