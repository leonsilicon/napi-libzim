import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  test: { include: ["tests/*.test.ts"] },
  pack: {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    fixedExtension: false,
    deps: { neverBundle: [/binding\/index\.cjs$/] },
    dts: {
      tsgo: {},
    },
    exports: false,
  },
  lint: {
    ignorePatterns: [
      "binding/**",
      "tests/upstream/**",
      ".native/**",
      "dist/**",
      "npm/**",
      "artifacts/**",
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
      ".native/**",
      "dist/**",
      "npm/**",
      "artifacts/**",
    ],
  },
});
