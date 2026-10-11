import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readState } from "./migration";
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
    expect(state).toEqual({});
  });

  it("reads the saved state file", () => {
    // Arrange
    const saved: CommentsState = { '"users"': { table: "Users", columns: { id: "User ID" } } };
    fs.writeFileSync(path.join(outDir, "comments-latest.json"), JSON.stringify(saved));

    // Act
    const state = readState(outDir);

    // Assert
    expect(state).toEqual(saved);
  });
});
