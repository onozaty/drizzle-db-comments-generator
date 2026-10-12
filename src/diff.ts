import { isDeepStrictEqual } from "node:util";
import type { CommentsState } from "./state";

/** A comment to set on a table, a column or an enum. `null` removes the comment. */
export type CommentChange =
  | { target: "table"; schema?: string; table: string; comment: string | null }
  | { target: "column"; schema?: string; table: string; column: string; comment: string | null }
  | { target: "enum"; schema?: string; name: string; comment: string | null };

// Object.hasOwn so that names like "constructor" do not pick up inherited properties
const own = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/**
 * Returns the comments that changed from the previous state: enums first, then tables and their columns,
 * in the order in the schema.
 * Only enums, tables and columns in the current schema are compared: dropped ones lose their comments with them.
 * Comments of enums whose values changed are returned again, since drizzle-kit may recreate the type.
 */
export function diff(prev: CommentsState, next: CommentsState): CommentChange[] {
  const changes: CommentChange[] = [];
  for (const [key, enumType] of Object.entries(next.enums)) {
    const prevEnum = own(prev.enums, key);
    // drizzle-kit drops and creates the type to remove values, which drops the comment too.
    // So the comment is set again whenever the values change (setting it again is harmless when values are only added).
    const valuesChanged = prevEnum !== undefined && !isDeepStrictEqual(prevEnum.values, enumType.values);
    if ((prevEnum?.comment ?? null) !== enumType.comment || (valuesChanged && enumType.comment !== null)) {
      changes.push({ target: "enum", schema: enumType.schema, name: enumType.name, comment: enumType.comment });
    }
  }
  for (const [key, table] of Object.entries(next.tables)) {
    const prevTable = own(prev.tables, key);
    const target = { schema: table.schema, table: table.table };
    if ((prevTable?.comment ?? null) !== table.comment) {
      changes.push({ target: "table", ...target, comment: table.comment });
    }
    for (const [column, comment] of Object.entries(table.columns)) {
      if (((prevTable && own(prevTable.columns, column)) ?? null) !== comment) {
        changes.push({ target: "column", ...target, column, comment });
      }
    }
  }
  return changes;
}
