import { gte, prerelease, valid } from "semver";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { npm, root } from "./package-utils.mjs";
import publisher from "../.github/npm-trusted-publisher.json" with { type: "json" };
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (!valid(manifest.version)) throw new Error("Invalid package version");
if (process.env.GITHUB_REF_NAME !== `v${manifest.version}`)
  throw new Error("Tag must match package.json version");
const dryRun = process.argv.includes("--dry-run");
if (!dryRun) {
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    throw new Error("Trusted publishing requires GitHub Actions with id-token: write");
  if (process.env.GITHUB_REPOSITORY !== publisher.repository)
    throw new Error(`Publishing is restricted to ${publisher.repository}`);
  if (!gte(npm(["--version"], root, true).trim(), "11.5.1"))
    throw new Error("Trusted publishing requires npm >=11.5.1");
}
const rootTarball = `${manifest.name}-${manifest.version}.tgz`;
const files = readdirSync(resolve(root, "release"));
if (!files.includes(rootTarball)) throw new Error("Missing root package");
const tag = prerelease(manifest.version) !== null ? "next" : "latest";
for (const file of [
  ...files.filter((name) => name !== rootTarball && name.endsWith(".tgz")),
  rootTarball,
]) {
  npm([
    "publish",
    resolve(root, "release", file),
    "--access",
    "public",
    "--tag",
    tag,
    "--ignore-scripts",
    "--registry",
    publisher.registry,
    ...(dryRun ? ["--dry-run"] : ["--provenance"]),
  ]);
}
