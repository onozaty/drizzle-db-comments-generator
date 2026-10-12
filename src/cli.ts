#!/usr/bin/env node
/**
 * Entry point of the CLI. The processing is in run.ts, so that it can be tested in process.
 *
 * Usage:
 *   drizzle-db-comments-generator [--config <file>] [--name <name>] [--append-enum-values] [--dry-run]
 */
import { run } from "./run";

process.exitCode = run(process.argv.slice(2));
