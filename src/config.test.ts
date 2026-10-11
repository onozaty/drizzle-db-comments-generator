import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findConfigFile, loadConfig, resolveSchemaFiles } from "./config";

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-"));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

const writeFiles = (...files: string[]) => {
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), "");
  }
};

const writeJsonConfig = (config: unknown, file = "drizzle.config.json") =>
  fs.writeFileSync(path.join(cwd, file), JSON.stringify(config));

describe("findConfigFile", () => {
  it.each([
    {
      name: "prefers drizzle.config.ts",
      files: ["drizzle.config.ts", "drizzle.config.js"],
      expected: "drizzle.config.ts",
    },
    {
      name: "falls back to drizzle.config.js",
      files: ["drizzle.config.js", "drizzle.config.json"],
      expected: "drizzle.config.js",
    },
    { name: "falls back to drizzle.config.json", files: ["drizzle.config.json"], expected: "drizzle.config.json" },
  ])("$name when no config is given", ({ files, expected }) => {
    // Arrange
    writeFiles(...files);

    // Act
    const found = findConfigFile(undefined, cwd);

    // Assert
    expect(found).toBe(path.join(cwd, expected));
  });

  it("uses the given config file relative to the current directory", () => {
    // Arrange
    writeFiles("drizzle.config.ts", "config/custom.config.ts");

    // Act
    const found = findConfigFile("config/custom.config.ts", cwd);

    // Assert
    expect(found).toBe(path.join(cwd, "config/custom.config.ts"));
  });

  it.each([
    { name: "the given config file does not exist", configPath: "missing.config.ts" },
    { name: "no default config file exists", configPath: undefined },
  ])("throws an error when $name", ({ configPath }) => {
    // Act & Assert
    expect(() => findConfigFile(configPath, cwd)).toThrow(/Config file not found/);
  });
});

describe("loadConfig", () => {
  it("resolves schema files and the migrations folder from the current directory", () => {
    // Arrange
    writeFiles("src/db/schema.ts");
    fs.mkdirSync(path.join(cwd, "config"));
    writeJsonConfig(
      { dialect: "postgresql", schema: "./src/db/schema.ts", out: "./migrations" },
      "config/drizzle.json",
    );

    // Act
    const config = loadConfig("config/drizzle.json", cwd);

    // Assert
    expect(config).toEqual({
      configPath: path.join(cwd, "config/drizzle.json"),
      schemaFiles: [path.join(cwd, "src/db/schema.ts")],
      outDir: path.join(cwd, "migrations"),
    });
  });

  it("uses drizzle as the migrations folder when out is omitted", () => {
    // Arrange
    writeFiles("schema.ts");
    writeJsonConfig({ dialect: "postgresql", schema: "schema.ts" });

    // Act
    const config = loadConfig(undefined, cwd);

    // Assert
    expect(config.outDir).toBe(path.join(cwd, "drizzle"));
  });

  it.each([
    {
      name: "the dialect is not postgresql",
      config: { dialect: "mysql", schema: "schema.ts" },
      error: /Unsupported dialect "mysql"/,
    },
    { name: "schema is missing", config: { dialect: "postgresql" }, error: /"schema" must be/ },
    { name: "schema is not a string", config: { dialect: "postgresql", schema: [1] }, error: /"schema" must be/ },
    {
      name: "out is not a string",
      config: { dialect: "postgresql", schema: "schema.ts", out: 1 },
      error: /"out" must be/,
    },
  ])("throws an error when $name", ({ config, error }) => {
    // Arrange
    writeFiles("schema.ts");
    writeJsonConfig(config);

    // Act & Assert
    expect(() => loadConfig(undefined, cwd)).toThrow(error);
  });
});

describe("resolveSchemaFiles", () => {
  it("resolves a file", () => {
    // Arrange
    writeFiles("src/schema.ts");

    // Act
    const files = resolveSchemaFiles("./src/schema.ts", cwd);

    // Assert
    expect(files).toEqual([path.join(cwd, "src/schema.ts")]);
  });

  it("resolves a directory to the files directly in it", () => {
    // Arrange
    writeFiles("src/schema/users.ts", "src/schema/posts.ts", "src/schema/nested/ignored.ts");

    // Act
    const files = resolveSchemaFiles("./src/schema", cwd);

    // Assert
    expect(files.sort()).toEqual([path.join(cwd, "src/schema/posts.ts"), path.join(cwd, "src/schema/users.ts")]);
  });

  it("resolves globs", () => {
    // Arrange
    writeFiles("src/users/schema.ts", "src/posts/schema.ts", "src/posts/other.ts");

    // Act
    const files = resolveSchemaFiles("./src/**/schema.ts", cwd);

    // Assert
    expect(files.sort()).toEqual([path.join(cwd, "src/posts/schema.ts"), path.join(cwd, "src/users/schema.ts")]);
  });

  it("resolves an array of paths without duplicates", () => {
    // Arrange
    writeFiles("users.ts", "posts.ts");

    // Act
    const files = resolveSchemaFiles(["users.ts", "posts.ts", "*.ts"], cwd);

    // Assert
    expect(files.sort()).toEqual([path.join(cwd, "posts.ts"), path.join(cwd, "users.ts")]);
  });

  it("throws an error when no files are found", () => {
    // Act & Assert
    expect(() => resolveSchemaFiles(["missing.ts", "src/*.ts"], cwd)).toThrow(
      "No schema files found for 'missing.ts', 'src/*.ts'",
    );
  });

  it("throws an error for files that are not scripts", () => {
    // Arrange
    writeFiles("schema/users.ts", "schema/README.md");

    // Act & Assert
    expect(() => resolveSchemaFiles("schema", cwd)).toThrow(/Unsupported schema files: .*README\.md/);
  });
});
