import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  // Run every upstream assertion using ONLY the clean npm installation.
  for (const name of ["zim", "dist"]) {
    let test = readFileSync(resolve(root, "tests/upstream", `${name}.test.ts`), "utf8");
    test = test.replace('"../../dist/index.js"', '"napi-libzim"');
    writeFileSync(resolve(directory, `${name}.test.ts`), test);
  }
  execFileSync(process.execPath, ["--test", "zim.test.ts", "dist.test.ts"], {
    cwd: directory,
    stdio: "inherit",
    env: {
      ...process.env,
      LD_LIBRARY_PATH: "",
      DYLD_LIBRARY_PATH: "",
      NAPI_RS_NATIVE_LIBRARY_PATH: "",
    },
  });
  execFileSync(
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
