import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { npm, root } from "./package-utils.mjs";
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (process.env.GITHUB_REF_NAME !== `v${manifest.version}`)
  throw new Error("Tag must match package.json version");
const rootTarball = `${manifest.name}-${manifest.version}.tgz`;
const files = readdirSync(resolve(root, "release"));
if (!files.includes(rootTarball)) throw new Error("Missing root package");
const tag = manifest.version.includes("-") ? "next" : "latest";
for (const file of [
  ...files.filter((name) => name !== rootTarball && name.endsWith(".tgz")),
  rootTarball,
]) {
  npm([
    "publish",
    resolve(root, "release", file),
    "--access",
    "public",
    "--provenance",
    "--tag",
    tag,
    "--ignore-scripts",
  ]);
}
