import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = resolve(root, "node_modules/@napi-rs/cli/dist/cli.js");
execFileSync(
  process.execPath,
  [
    cli,
    "build",
    "--platform",
    "--release",
    "--output-dir",
    "binding",
    "--js",
    "index.cjs",
    "--dts",
    "index.d.cts",
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      VCPKG_ROOT: resolve(root, ".native/vcpkg"),
      VCPKGRS_TRIPLET:
        process.platform === "win32" ? "x64-windows-static-md" : process.env.VCPKGRS_TRIPLET,
    },
  },
);
