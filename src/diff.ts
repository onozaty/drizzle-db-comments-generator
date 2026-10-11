import type { CommentsState } from "./state";

/** A table or column comment to set. `null` removes the comment. */
export type CommentChange = {
  schema?: string;
  table: string;
  /** Omitted for a table comment. */
  column?: string;
  comment: string | null;
};

/**
 * Returns the comments that changed from the previous state, in the order of the tables and columns in the schema.
 * Only tables and columns in the current schema are compared: dropped ones lose their comments with them.
 */
export function diff(prev: CommentsState, next: CommentsState): CommentChange[] {
  const changes: CommentChange[] = [];
  for (const [key, table] of Object.entries(next.tables)) {
    // Object.hasOwn so that names like "constructor" do not pick up inherited properties
    const prevTable = Object.hasOwn(prev.tables, key) ? prev.tables[key] : undefined;
    const target = { schema: table.schema, table: table.table };
    if ((prevTable?.comment ?? null) !== table.comment) {
      changes.push({ ...target, comment: table.comment });
    }
    for (const [column, comment] of Object.entries(table.columns)) {
      const prevComment = prevTable && Object.hasOwn(prevTable.columns, column) ? prevTable.columns[column] : null;
      if ((prevComment ?? null) !== comment) {
        changes.push({ ...target, column, comment });
      }
    }
  }
  return changes;
}
