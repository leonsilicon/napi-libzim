import { execaSync } from "execa";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { npm, root } from "./package-utils.mjs";
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
  for (const helper of ["p-limit", "yocto-queue", "execa", "semver"]) {
    assert.equal(
      existsSync(resolve(directory, "node_modules", helper)),
      false,
      `${helper} must not be installed for consumers`,
    );
  }
  // Run every upstream assertion using ONLY the clean npm installation.
  for (const name of ["zim", "dist"]) {
    let test = readFileSync(resolve(root, "tests/upstream", `${name}.test.ts`), "utf8");
    test = test.replace('"../../dist/index.js"', '"napi-libzim"');
    writeFileSync(resolve(directory, `${name}.test.ts`), test);
  }
  execaSync(process.execPath, ["--test", "zim.test.ts", "dist.test.ts"], {
    cwd: directory,
    stdio: "inherit",
    env: {
      ...process.env,
      LD_LIBRARY_PATH: "",
      DYLD_LIBRARY_PATH: "",
      NAPI_RS_NATIVE_LIBRARY_PATH: "",
    },
  });
  execaSync(
    process.execPath,
    [
      "-e",
      "const z = require('napi-libzim'); if (!z.Archive || !z.Creator) throw Error('Missing CommonJS exports')",
    ],
    { cwd: directory, stdio: "inherit" },
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
