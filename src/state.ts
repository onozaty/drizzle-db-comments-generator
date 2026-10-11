import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getColumnComment, getTableComment } from "./comment";

export const STATE_VERSION = 1;

/**
 * Comments of a table and all of its columns.
 * Tables and columns without comments are kept as `null`, so that the state also tells which ones exist.
 */
export type TableState = {
  schema?: string;
  table: string;
  comment: string | null;
  columns: Record<string, string | null>;
};

/** Comments of all tables in the schema. Saved as JSON, so the format is versioned. */
export type CommentsState = {
  version: typeof STATE_VERSION;
  /** Keyed by `schema.table`, or `table` for tables without a schema. The key is only used for lookup. */
  tables: Record<string, TableState>;
};

export type BuildStateOptions = {
  /** Appends `enum: name(value, ...)` to the comments of enum columns. */
  includeEnum?: boolean;
};

export function emptyState(): CommentsState {
  // Without a prototype, so that a table named like "__proto__" is kept as a normal key
  return { version: STATE_VERSION, tables: Object.create(null) };
}

/** Key of a table in `CommentsState.tables`. */
export function stateKey(schema: string | undefined, table: string): string {
  return schema ? `${schema}.${table}` : table;
}

/** Collects table/column comments from the exports of schema modules. */
export function buildState(modules: Record<string, unknown>[], options: BuildStateOptions = {}): CommentsState {
  const state = emptyState();
  const sources = new Map<string, PgTable>();
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      const key = stateKey(config.schema, config.name);
      const source = sources.get(key);
      if (source === value) continue; // The same table exported more than once
      if (source) throw new Error(`Multiple tables map to the same name "${key}"`);
      sources.set(key, value);

      const table: TableState = {
        schema: config.schema,
        table: config.name,
        comment: getTableComment(value) || null,
        // Without a prototype, so that a column named like "__proto__" is kept as a normal key
        columns: Object.create(null),
      };

      for (const column of config.columns) {
        let comment = getColumnComment(column) || null;
        const enumInfo = (column as { enum?: { enumName: string; enumValues: string[] } }).enum;
        if (options.includeEnum && enumInfo) {
          const line = `enum: ${enumInfo.enumName}(${enumInfo.enumValues.join(", ")})`;
          comment = comment ? `${comment}\n${line}` : line;
        }
        table.columns[column.name] = comment;
      }
      state.tables[key] = table;
    }
  }
  return state;
}
