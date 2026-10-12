/** Shows the table/column/enum comments stored in the database. */
import pg from "pg";
import { databaseUrl } from "./drizzle.config.ts";

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  // attnum 0 stands for the table itself, so that the table comment comes before its column comments
  const { rows } = await client.query<{ table: string; column: string; comment: string | null }>(`
    SELECT
      CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END AS "table",
      COALESCE(a.attname, '') AS "column",
      CASE WHEN a.attnum IS NULL THEN obj_description(c.oid, 'pg_class') ELSE col_description(c.oid, a.attnum) END AS "comment"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL (
      SELECT NULL::name AS attname, NULL::int2 AS attnum
      UNION ALL
      SELECT attname, attnum FROM pg_attribute WHERE attrelid = c.oid AND attnum > 0 AND NOT attisdropped
    ) a
    WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
    ORDER BY 1, COALESCE(a.attnum, 0)
  `);
  console.table(rows);

  const { rows: enums } = await client.query<{ enum: string; comment: string | null }>(`
    SELECT
      CASE WHEN n.nspname = 'public' THEN t.typname ELSE n.nspname || '.' || t.typname END AS "enum",
      obj_description(t.oid, 'pg_type') AS "comment"
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typtype = 'e'
    ORDER BY 1
  `);
  console.table(enums);
} finally {
  await client.end();
}
