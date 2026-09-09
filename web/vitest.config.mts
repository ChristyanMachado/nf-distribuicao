import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'integration/**'] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
