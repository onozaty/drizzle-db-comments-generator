import { defineConfig } from "tsdown";

const common = { platform: "node", dts: true } as const;

export default defineConfig([
  // The CLI is CommonJS so that it shares the CommonJS drizzle-orm with the schemas it loads, the same as drizzle-kit
  { ...common, entry: { index: "src/index.ts", cli: "src/cli.ts" }, format: "cjs", clean: true },
  // The library is also ES modules: `.comment()` has to be added to the drizzle-orm (ES modules or CommonJS) the project uses
  { ...common, entry: { index: "src/index.ts" }, format: "esm", clean: false },
]);
