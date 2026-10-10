import { execaSync } from "execa";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { root } from "./package-utils.mjs";
const directory = mkdtempSync(resolve(tmpdir(), "napi-libzim-release-"));
try {
  mkdirSync(resolve(directory, ".ci"));
  cpSync(resolve(root, ".ci/publish-release.js"), resolve(directory, ".ci/publish-release.js"));
  cpSync(resolve(root, "package.json"), resolve(directory, "package.json"));
  cpSync(resolve(root, "release"), resolve(directory, "release"), { recursive: true });
  const { version } = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
  // No node_modules in this directory: the release helper must be self-contained.
  execaSync(process.execPath, [".ci/publish-release.js", "--dry-run"], {
    cwd: directory,
    env: { GITHUB_REF_NAME: `v${version}` },
    stdio: "inherit",
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
