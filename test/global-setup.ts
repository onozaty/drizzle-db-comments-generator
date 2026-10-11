import { build } from "./helpers/project";

/** Builds the package once per test run, before the tests that run dist/ (see vitest.config.ts). */
export default function setup(): void {
  build();
}
