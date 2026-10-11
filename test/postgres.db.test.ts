/**
 * Integration tests with PostgreSQL: runs drizzle-kit generate, the CLI and drizzle-kit migrate in a temporary project,
 * as users do, and checks the comments in the database.
 * Run with `pnpm run test:db`. Each test uses its own database, created on TEST_DATABASE_URL and dropped afterwards.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import { createProject, describeFailure, type Project } from "./helpers/project";

// A dedicated variable instead of DATABASE_URL, so that the tests never touch another database by accident
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://db_user:db_password@localhost:5432/sample";

let project: Project;
let database: string;

const databaseUrl = () => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${database}`;
  return url.toString();
};

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

beforeEach(async () => {
  const name = `drizzle_db_comments_test_${randomBytes(4).toString("hex")}`;
  database = name;
  await admin((client) => client.query(`CREATE DATABASE "${name}"`));
  // Cleans up only what was created, and drops the database even if the setup fails afterwards
  let created: Project | undefined;
  try {
    created = createProject({ name: "project" });
    project = created;
  } catch (e) {
    await admin((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    throw e;
  }
  return async () => {
    try {
      created?.remove();
    } finally {
      await admin((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
    }
  };
});

const writeConfig = (options = "") =>
  project.write(
    "drizzle.config.ts",
    `import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./schema.ts",
  out: "./drizzle",
  dbCredentials: { url: ${JSON.stringify(databaseUrl())} },
  ${options}
});
`,
  );

// The side-effect import adds .comment() even when the named imports are unused and removed by the compiler
const IMPORTS = `import "drizzle-db-comments-generator";
import { pgTableWithComment, withComment } from "drizzle-db-comments-generator";
import { integer, pgEnum, pgSchema, pgTable, serial, text } from "drizzle-orm/pg-core";
`;

/** Changes the schema and applies it to the database in the same way as users: generate, the CLI, then migrate. */
function apply(schema: string, ...cliArgs: string[]): void {
  project.write("schema.ts", IMPORTS + schema);
  for (const [name, result] of [
    ["drizzle-kit generate", () => project.runDrizzleKit("generate")],
    ["CLI", () => project.runCli(...cliArgs)],
    ["drizzle-kit migrate", () => project.runDrizzleKit("migrate")],
  ] as const) {
    const output = result();
    if (output.status !== 0) throw new Error(describeFailure(name, output));
  }
}

/** Comments in the database, keyed by `table` or `table.column` (prefixed with the schema except public). */
async function comments(): Promise<Record<string, string | null>> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ key: string; comment: string | null }>(`
      SELECT
        CASE WHEN n.nspname = 'public' THEN '' ELSE n.nspname || '.' END || c.relname || COALESCE('.' || a.attname, '') AS key,
        CASE WHEN a.attnum IS NULL THEN obj_description(c.oid, 'pg_class') ELSE col_description(c.oid, a.attnum) END AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL (
        SELECT NULL::name AS attname, NULL::int2 AS attnum
        UNION ALL
        SELECT attname, attnum FROM pg_attribute WHERE attrelid = c.oid AND attnum > 0 AND NOT attisdropped
      ) a
      WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'drizzle')
    `);
    return Object.fromEntries(rows.map((row) => [row.key, row.comment]));
  } finally {
    await client.end();
  }
}

describe("comments in PostgreSQL", () => {
  it("sets table and column comments", async () => {
    // Arrange
    writeConfig();
    const schema = `
export const status = pgEnum("status", ["ACTIVE", "INACTIVE"]);
export const users = pgTableWithComment("users", "Users", {
  id: serial("id").primaryKey().comment("User ID"),
  bio: text("bio").comment("Line 1\\nLine 2 with 'quotes'"),
  status: status("status").comment("Status"),
  age: integer("age"),
});
export const auth = pgSchema("auth");
export const sessions = withComment(auth.table)("sessions", "Sessions", {
  token: text("token").comment("Token"),
});
`;

    // Act
    apply(schema, "--enum");

    // Assert
    expect(await comments()).toEqual({
      users: "Users",
      "users.id": "User ID",
      "users.bio": "Line 1\nLine 2 with 'quotes'",
      "users.status": "Status\nenum: status(ACTIVE, INACTIVE)",
      "users.age": null,
      "auth.sessions": "Sessions",
      "auth.sessions.token": "Token",
    });
  });

  it("applies changed and removed comments, including all comments of a table", async () => {
    // Arrange
    writeConfig();
    apply(`
export const users = pgTableWithComment("users", "Users", {
  id: serial("id").primaryKey().comment("User ID"),
  name: text("name").comment("Name"),
});
export const posts = pgTableWithComment("posts", "Posts", { id: serial("id").primaryKey().comment("Post ID") });
`);

    // Act
    apply(`
export const users = pgTableWithComment("users", "User accounts", {
  id: serial("id").primaryKey().comment("User ID"),
  name: text("name"),
});
export const posts = pgTable("posts", { id: serial("id").primaryKey() });
`);

    // Assert
    expect(await comments()).toEqual({
      users: "User accounts",
      "users.id": "User ID",
      "users.name": null,
      posts: null,
      "posts.id": null,
    });
  });

  it("drops a commented column, and sets the comment again when it is added back", async () => {
    // Arrange
    writeConfig();
    const withName = `
export const users = pgTable("users", { id: serial("id").primaryKey(), name: text("name").comment("Name") });
`;
    apply(withName);
    apply(`
export const users = pgTable("users", { id: serial("id").primaryKey() });
`);

    // Act
    apply(withName);

    // Assert
    expect(await comments()).toEqual({ users: null, "users.id": null, "users.name": "Name" });
  });

  it("sets comments on columns named by the casing in the config", async () => {
    // Arrange
    writeConfig(`casing: "snake_case",`);
    const schema = `
export const userAccounts = pgTableWithComment("user_accounts", "User accounts", {
  accountId: serial().primaryKey().comment("Account ID"),
  displayName: text().comment("Display name"),
});
`;

    // Act
    apply(schema);

    // Assert
    expect(await comments()).toEqual({
      user_accounts: "User accounts",
      "user_accounts.account_id": "Account ID",
      "user_accounts.display_name": "Display name",
    });
  });

  it("quotes names with uppercase letters and spaces", async () => {
    // Arrange
    writeConfig();
    const schema = `
export const sales = pgSchema("Sales");
export const orders = withComment(sales.table)("Order Items", "Order items", {
  itemId: serial("ItemId").primaryKey().comment("Item ID"),
  unitPrice: integer("Unit Price").comment("Unit price"),
});
`;

    // Act
    apply(schema);

    // Assert
    expect(await comments()).toEqual({
      "Sales.Order Items": "Order items",
      "Sales.Order Items.ItemId": "Item ID",
      "Sales.Order Items.Unit Price": "Unit price",
    });
  });

  it("drops a commented table", async () => {
    // Arrange
    writeConfig();
    apply(`
export const users = pgTableWithComment("users", "Users", { id: serial("id").primaryKey().comment("User ID") });
export const posts = pgTableWithComment("posts", "Posts", { id: serial("id").primaryKey().comment("Post ID") });
`);

    // Act
    apply(`
export const users = pgTableWithComment("users", "Users", { id: serial("id").primaryKey().comment("User ID") });
`);

    // Assert
    expect(await comments()).toEqual({ users: "Users", "users.id": "User ID" });
  });

  it("updates comments with enum values when values are added", async () => {
    // Arrange
    writeConfig();
    const schema = (values: string) => `
export const status = pgEnum("status", [${values}]);
export const users = pgTable("users", { status: status("status").comment("Status") });
`;
    apply(schema(`"ACTIVE"`), "--enum");

    // Act
    apply(schema(`"ACTIVE", "INACTIVE"`), "--enum");

    // Assert
    expect(await comments()).toEqual({ users: null, "users.status": "Status\nenum: status(ACTIVE, INACTIVE)" });
  });

  it("changes and removes comments of tables in a schema", async () => {
    // Arrange
    writeConfig();
    apply(`
export const auth = pgSchema("auth");
export const sessions = withComment(auth.table)("sessions", "Sessions", {
  token: text("token").comment("Token"),
  userAgent: text("user_agent").comment("User agent"),
});
`);

    // Act
    apply(`
export const auth = pgSchema("auth");
export const sessions = withComment(auth.table)("sessions", "Login sessions", {
  token: text("token"),
  userAgent: text("user_agent").comment("User agent"),
});
`);

    // Assert
    expect(await comments()).toEqual({
      "auth.sessions": "Login sessions",
      "auth.sessions.token": null,
      "auth.sessions.user_agent": "User agent",
    });
  });
});
