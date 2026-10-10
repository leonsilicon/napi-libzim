import { execaSync } from "execa";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { npm, root } from "./package-utils.mjs";
import { runUpstreamTests } from "./upstream-tests.mjs";
const suffix = process.argv[2];
const directory = mkdtempSync(resolve(tmpdir(), "napi-libzim-install-"));
try {
  const packed = (cwd) => {
    const result = JSON.parse(
      npm(["pack", "--ignore-scripts", "--json", "--pack-destination", directory], cwd, true),
    );
    return resolve(directory, result[0].filename);
  };
  const platformPackage = packed(resolve(root, "npm", suffix));
  const rootPackage = packed(root);
  writeFileSync(resolve(directory, "package.json"), '{"private":true,"type":"module"}');
  npm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", rootPackage, platformPackage],
    directory,
  );
  const installed = JSON.parse(
    readFileSync(resolve(directory, "node_modules/napi-libzim/package.json"), "utf8"),
  );
  assert.deepEqual(
    installed.dependencies ?? {},
    {},
    "Helper packages must be bundled, not runtime dependencies",
  );
  for (const helper of [
    "p-limit",
    "yocto-queue",
    "execa",
    "semver",
    "@babel/parser",
    "@babel/traverse",
    "diff",
    "magic-string",
    "uint8array-extras",
  ]) {
    assert.equal(
      existsSync(resolve(directory, "node_modules", helper)),
      false,
      `${helper} must not be installed for consumers`,
    );
  }
  const options = {
    cwd: directory,
    stdio: "inherit",
    env: {
      ...process.env,
      LD_LIBRARY_PATH: "",
      DYLD_LIBRARY_PATH: "",
      NAPI_RS_NATIVE_LIBRARY_PATH: "",
    },
  };
  // Verify both package entry points using only the clean npm installation.
  runUpstreamTests(directory, options);
  execaSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { Archive, Creator } from 'napi-libzim'; if (!Archive || !Creator) throw Error('Missing ESM exports')",
    ],
    options,
  );
  execaSync(
    process.execPath,
    [
      "-e",
      "const z = require('napi-libzim'); if (!z.Archive || !z.Creator || 'Blob' in z) throw Error('Invalid CommonJS exports'); const bytes = new z.StringProvider(new Uint8Array([0, 255])).feed(); if (bytes.constructor !== Uint8Array || bytes[0] !== 0 || bytes[1] !== 255) throw Error('Invalid CommonJS bytes')",
    ],
    options,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
