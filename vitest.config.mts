import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Next keeps JSX as-is for its own compiler; tests that render a component
  // need it turned into calls.
  oxc: { jsx: { runtime: "automatic" } },
});
