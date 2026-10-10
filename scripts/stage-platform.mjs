import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./package-utils.mjs";
import { NapiCli } from "@napi-rs/cli";
const suffix = process.argv[2];
const triplets = {
  "darwin-arm64": "arm64-osx",
  "darwin-x64": "x64-osx",
  "linux-x64-gnu": "x64-linux",
  "linux-arm64-gnu": "arm64-linux",
  "win32-x64-msvc": "x64-windows-static-md",
};
if (!triplets[suffix]) throw new Error(`Unknown target ${suffix}`);
await new NapiCli().createNpmDirs({ cwd: root });
const target = resolve(root, "npm", suffix);
cpSync(
  resolve(root, "binding", `napi-libzim.${suffix}.node`),
  resolve(target, `napi-libzim.${suffix}.node`),
);
const source = resolve(root, ".native/vcpkg/installed", triplets[suffix], "share");
const licenses = resolve(root, "platform-licenses");
mkdirSync(licenses, { recursive: true });
for (const port of readdirSync(source)) {
  try {
    cpSync(resolve(source, port, "copyright"), resolve(licenses, `${port}.txt`));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
for (const filename of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  cpSync(resolve(root, filename), resolve(licenses, filename));
cpSync(licenses, resolve(target, "licenses"), { recursive: true });
const manifestPath = resolve(target, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.files = [...manifest.files, "licenses"];
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
