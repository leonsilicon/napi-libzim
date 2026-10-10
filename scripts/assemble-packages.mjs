import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./package-utils.mjs";
import { NapiCli } from "@napi-rs/cli";
import { execaSync } from "execa";
const napi = new NapiCli();
const artifacts = resolve(root, "artifacts");
const source = resolve(artifacts, "native-darwin-arm64", "binding");
// The Rust declarations and platform loader are the same on every target.
for (const name of ["index.cjs", "index.d.cts"]) {
  const expected = readFileSync(resolve(source, name));
  for (const artifact of readdirSync(artifacts).filter((name) => name.startsWith("native-"))) {
    if (!expected.equals(readFileSync(resolve(artifacts, artifact, "binding", name))))
      throw new Error(`${name} differs across targets (${artifact})`);
  }
  cpSync(resolve(source, name), resolve(root, "binding", name));
}
await napi.createNpmDirs({ cwd: root });
await napi.artifacts({ cwd: root, outputDir: "artifacts", npmDir: "npm" });
for (const suffix of readdirSync(resolve(root, "npm"))) {
  const target = resolve(root, "npm", suffix);
  cpSync(resolve(artifacts, `native-${suffix}`, "platform-licenses"), resolve(target, "licenses"), {
    recursive: true,
  });
  const manifestPath = resolve(target, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.files = [...new Set([...manifest.files, "licenses"])];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
execaSync("vp", ["run", "build:js"], { cwd: root, stdio: "inherit" });
await napi.prePublish({
  cwd: root,
  skipOptionalPublish: true,
  ghRelease: false,
  rootPublisher: "npm",
});
