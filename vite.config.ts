import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  test: { include: ["tests/*.test.ts"] },
  pack: [
    {
      entry: ["src/index.ts"],
      format: ["esm", "cjs"],
      fixedExtension: false,
      deps: {
        neverBundle: [/binding\/index\.cjs$/],
        alwaysBundle: ["p-limit", "yocto-queue", "uint8array-extras"],
        onlyBundle: ["p-limit", "yocto-queue", "uint8array-extras"],
      },
      dts: { tsgo: {} },
      exports: false,
    },
    {
      entry: ["scripts/publish-release.mjs"],
      outDir: ".ci",
      format: "esm",
      fixedExtension: false,
      deps: { alwaysBundle: [/.*/], onlyBundle: false, onlyImport: [] },
      dts: false,
      exports: false,
    },
  ],
  lint: {
    ignorePatterns: [
      "binding/**",
      "tests/upstream/**",
      ".upstream-tests/**",
      ".native/**",
      "dist/**",
      "npm/**",
      "artifacts/**",
      ".ci/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: [
      "binding/**",
      "tests/upstream/**",
      ".upstream-tests/**",
      ".native/**",
      "dist/**",
      "npm/**",
      "artifacts/**",
      ".ci/**",
    ],
  },
});
