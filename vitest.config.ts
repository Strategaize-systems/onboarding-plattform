import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/test/**", "src/**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
