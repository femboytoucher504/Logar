import { defineConfig } from "rollup";
import esbuild from "rollup-plugin-esbuild";

export default defineConfig({
  input: "index.ts",
  output: {
    file: "dist/index.js",
    format: "cjs",
    strict: false,
  },
  plugins: [
    esbuild({
      minify: true,
      target: "es2020",
    }),
  ],
});

