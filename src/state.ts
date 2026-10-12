import { type Casing, is } from "drizzle-orm";
import { CasingCache } from "drizzle-orm/casing";
import { getTableConfig, isPgEnum, type PgEnum, PgTable } from "drizzle-orm/pg-core";
import { getColumnComment, getEnumComment, getTableComment } from "./comment";
import { GeneratorError } from "./errors";

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

/** Comment and values of an enum type. Enums without comments are kept as `null`, the same as tables. */
export type EnumState = {
  schema?: string;
  name: string;
  comment: string | null;
  /** Kept to detect enums recreated by drizzle-kit, which drops and creates the type to remove values. */
  values: string[];
};

/** Comments of all tables and enums in the schema. Saved as JSON, so the format is versioned. */
export type CommentsState = {
  version: typeof STATE_VERSION;
  /** Keyed by `schema.table`, or `table` for tables without a schema. The key is only used for lookup. */
  tables: Record<string, TableState>;
  /** Keyed by `schema.name`, or `name` for enums without a schema. The key is only used for lookup. */
  enums: Record<string, EnumState>;
};

export type { Casing };

export type BuildStateOptions = {
  /** Converts the names of columns defined without names, the same as drizzle-kit does. */
  casing?: Casing;
  /** Appends `enum: name(value, ...)` to the comments of enum columns. */
  appendEnumValues?: boolean;
};

export function emptyState(): CommentsState {
  // Without a prototype, so that a name like "__proto__" is kept as a normal key
  return { version: STATE_VERSION, tables: Object.create(null), enums: Object.create(null) };
}

/** Key of a table in `CommentsState.tables`, or of an enum in `CommentsState.enums`. */
export function stateKey(schema: string | undefined, name: string): string {
  return schema ? `${schema}.${name}` : name;
}

/** Collects table, column and enum comments from the exports of schema modules. */
export function buildState(modules: Record<string, unknown>[], options: BuildStateOptions = {}): CommentsState {
  const state = emptyState();
  const tableSources = new Map<string, PgTable>();
  const enumSources = new Map<string, PgEnum<[string, ...string[]]>>();
  // Resolves column names the same way as drizzle-orm, which drizzle-kit follows when creating columns
  const casing = new CasingCache(options.casing);
  for (const mod of modules) {
    for (const value of Object.values(mod)) {
      // Only exported enums are collected, since drizzle-kit creates only them
      if (isPgEnum(value)) {
        const key = stateKey(value.schema, value.enumName);
        if (!isNewSource(enumSources, key, value, "enums")) continue;
        state.enums[key] = {
          schema: value.schema,
          name: value.enumName,
          comment: getEnumComment(value) || null,
          values: [...value.enumValues],
        };
        continue;
      }
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      const key = stateKey(config.schema, config.name);
      if (!isNewSource(tableSources, key, value, "tables")) continue;

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
        if (options.appendEnumValues && enumInfo) {
          const line = `enum: ${enumInfo.enumName}(${enumInfo.enumValues.join(", ")})`;
          comment = comment ? `${comment}\n${line}` : line;
        }
        table.columns[casing.getColumnCasing(column)] = comment;
      }
      state.tables[key] = table;
    }
  }
  return state;
}

/**
 * Returns whether the object is seen for the first time under the key.
 * The same object exported more than once is skipped, but different objects with the same name are an error.
 */
function isNewSource<T>(sources: Map<string, T>, key: string, value: T, kind: string): boolean {
  const source = sources.get(key);
  if (source === value) return false;
  if (source) throw new GeneratorError(`Multiple ${kind} map to the same name "${key}"`);
  sources.set(key, value);
  return true;
}
