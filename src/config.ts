import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { globSync } from "tinyglobby";
import { register } from "tsx/cjs/api";
import { GeneratorError } from "./errors";
import type { Casing } from "./state";

// Same candidates and order as drizzle-kit
const DEFAULT_CONFIG_FILES = ["drizzle.config.ts", "drizzle.config.js", "drizzle.config.json"];
const SCHEMA_EXTENSIONS = [".ts", ".js", ".cjs", ".mjs", ".mts", ".cts"];

export type ResolvedConfig = {
  /** Absolute path of the drizzle-kit config file. */
  configPath: string;
  /** Absolute paths of the schema files. */
  schemaFiles: string[];
  /** Absolute path of the migrations folder. */
  outDir: string;
  casing?: Casing;
};

/** Returns the config file to use: the given one, or the first default one that exists. */
export function findConfigFile(configPath: string | undefined, cwd: string): string {
  const candidates = configPath ? [configPath] : DEFAULT_CONFIG_FILES;
  const found = candidates.map((file) => path.resolve(cwd, file)).find((file) => fs.existsSync(file));
  if (!found) {
    throw new GeneratorError(`Config file not found: ${candidates.join(", ")}`);
  }
  return found;
}

/**
 * Reads `schema` and `out` from the drizzle-kit config file.
 * Like drizzle-kit, relative paths are resolved from the current directory, not from the config file.
 */
export function loadConfig(configPath: string | undefined, cwd: string = process.cwd()): ResolvedConfig {
  const file = findConfigFile(configPath, cwd);
  const loaded = loadModule(file);
  // Same as drizzle-kit: `export default` and `module.exports` are both supported
  const config = loaded.default ?? loaded;

  if (typeof config !== "object" || config === null) {
    throw new GeneratorError(`Invalid config file: ${file}`);
  }
  const { dialect, schema, out, casing } = config as Record<string, unknown>;
  if (dialect !== "postgresql") {
    throw new GeneratorError(`Unsupported dialect "${dialect}" in ${file}. Only "postgresql" is supported.`);
  }
  const isStringArray = Array.isArray(schema) && schema.every((s) => typeof s === "string");
  if (typeof schema !== "string" && !isStringArray) {
    throw new GeneratorError(`"schema" must be a string or an array of strings in ${file}`);
  }
  if (out !== undefined && typeof out !== "string") {
    throw new GeneratorError(`"out" must be a string in ${file}`);
  }
  if (casing !== undefined && casing !== "snake_case" && casing !== "camelCase") {
    throw new GeneratorError(`"casing" must be "snake_case" or "camelCase" in ${file}`);
  }

  return {
    configPath: file,
    schemaFiles: resolveSchemaFiles(schema as string | string[], cwd),
    outDir: path.resolve(cwd, out ?? "drizzle"),
    casing,
  };
}

/**
 * Expands the `schema` of the config into files, in the same way as drizzle-kit:
 * globs are expanded, and a directory means the files directly in it.
 */
export function resolveSchemaFiles(schema: string | string[], cwd: string): string[] {
  const patterns = typeof schema === "string" ? [schema] : schema;
  const files = new Set<string>();
  for (const pattern of patterns) {
    for (const matched of globSync(pattern, { cwd, absolute: true, onlyFiles: false, expandDirectories: false })) {
      // lstat like drizzle-kit: symbolic links are not followed into directories
      const entries = fs.lstatSync(matched).isDirectory()
        ? fs.readdirSync(matched).map((name) => path.join(matched, name))
        : [matched];
      for (const entry of entries) {
        if (!fs.lstatSync(entry).isDirectory()) files.add(path.resolve(entry));
      }
    }
  }

  const result = [...files];
  if (result.length === 0) {
    throw new GeneratorError(`No schema files found for ${patterns.map((p) => `'${p}'`).join(", ")}`);
  }
  const unsupported = result.filter((file) => !SCHEMA_EXTENSIONS.some((ext) => file.endsWith(ext)));
  if (unsupported.length > 0) {
    throw new GeneratorError(`Unsupported schema files: ${unsupported.join(", ")}`);
  }
  return result;
}

let registered = false;

/**
 * Loads a config file or a schema module in the same way as drizzle-kit: `require` with the CommonJS loader of tsx.
 * This way, any schema drizzle-kit can load (extensionless imports, tsconfig paths, ...) can be loaded here too,
 * and the schema and this library share the same drizzle-orm (the CommonJS one) in both ES module and CommonJS projects,
 * so that `.comment()` added to its ColumnBuilder works.
 */
export function loadModule(file: string): Record<string, unknown> {
  if (!registered) {
    register();
    registered = true;
  }
  return createRequire(file)(file);
}
