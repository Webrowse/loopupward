import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the logic that is easy to get quietly wrong: which day a
 * routine's tick belongs to, what a streak counts, and what the markdown
 * renderer emits. No DOM environment on purpose — everything under test here
 * is a pure function, and keeping it that way is part of the design.
 */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    environment: "node",
    // Pinned: the export now renders timestamps in the zone a moment happened
    // in, so anything asserting a local time is meaningless without a fixed
    // zone. These tests used to pass only because the author's machine is IST.
    env: { TZ: "Asia/Kolkata" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
