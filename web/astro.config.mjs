import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  base: "/inval",
  server: { port: 4322, host: true },
});
