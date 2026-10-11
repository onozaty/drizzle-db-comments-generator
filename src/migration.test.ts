import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readState, resolveDrizzleKitBin, writeState } from "./migration";
import type { CommentsState } from "./state";

describe("readState", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-"));
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("returns an empty state when there is no state file", () => {
    // Act
    const state = readState(outDir);

    // Assert
    expect(state).toEqual({ version: 1, tables: {} });
  });

  it("reads the saved state file", () => {
    // Arrange
    const saved: CommentsState = {
      version: 1,
      tables: { users: { table: "users", comment: "Users", columns: { id: "User ID" } } },
    };
    fs.writeFileSync(path.join(outDir, "comments-latest.json"), JSON.stringify(saved));

    // Act
    const state = readState(outDir);

    // Assert
    expect(state).toEqual(saved);
  });

  it.each([
    { name: "a state file of an unknown version", content: { version: 2, tables: {} } },
    { name: "a state file without a version", content: { users: { table: "Users", columns: {} } } },
  ])("throws an error for $name", ({ content }) => {
    // Arrange
    fs.writeFileSync(path.join(outDir, "comments-latest.json"), JSON.stringify(content));

    // Act & Assert
    expect(() => readState(outDir)).toThrow(/Unsupported format/);
  });

  it.each([
    { name: "without tables", content: { version: 1 } },
    { name: "with a table without columns", content: { version: 1, tables: { users: { table: "users" } } } },
  ])("throws an error for a state file $name", ({ content }) => {
    // Arrange
    fs.writeFileSync(path.join(outDir, "comments-latest.json"), JSON.stringify(content));

    // Act & Assert
    expect(() => readState(outDir)).toThrow(/Invalid content/);
  });
});

describe("writeState", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-"));
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it("saves the state so that readState reads it back", () => {
    // Arrange
    const state: CommentsState = {
      version: 1,
      tables: { "auth.users": { schema: "auth", table: "users", comment: "Users", columns: { id: null } } },
    };

    // Act
    writeState(outDir, state);

    // Assert
    expect(readState(outDir)).toEqual(state);
  });
});

describe("resolveDrizzleKitBin", () => {
  it("returns the CLI script of the drizzle-kit installed in the project", () => {
    // Act
    const bin = resolveDrizzleKitBin(process.cwd());

    // Assert
    expect(bin).toBe(path.join(fs.realpathSync("node_modules/drizzle-kit"), "bin.cjs"));
  });

  it("throws an error when drizzle-kit is not installed", () => {
    // Arrange
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-db-comments-"));

    // Act & Assert
    try {
      expect(() => resolveDrizzleKitBin(cwd)).toThrow("drizzle-kit is not installed in the project");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
