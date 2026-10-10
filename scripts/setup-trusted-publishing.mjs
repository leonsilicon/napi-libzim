import { parseTriple } from "@napi-rs/cli";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { gte } from "semver";
import { npm, root } from "./package-utils.mjs";
import publisher from "../.github/npm-trusted-publisher.json" with { type: "json" };

const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const packages = [
  manifest.name,
  ...manifest.napi.targets.map(
    (target) => `${manifest.napi.packageName}-${parseTriple(target).platformArchABI}`,
  ),
];
const commands = packages.map((name) => [
  "trust",
  "github",
  name,
  "--repository",
  publisher.repository,
  "--file",
  publisher.workflow,
  "--environment",
  publisher.environment,
  "--allow-publish",
  "--yes",
  "--registry",
  publisher.registry,
]);

if (process.argv.includes("--dry-run")) {
  for (const command of commands) console.log(`npm ${command.join(" ")}`);
} else {
  if (!gte(npm(["--version"], root, true).trim(), "11.15.0"))
    throw new Error("Configuring trusted publishers requires npm >=11.15.0");
  // Check every package before creating any trust relationships. npm requires
  // an initial publication and package write access for this operation.
  const missing = (
    await Promise.all(
      packages.map(async (name) => {
        const response = await fetch(`${publisher.registry}/${name}`);
        if (response.status === 404) return name;
        if (!response.ok) throw new Error(`Cannot check ${name}: HTTP ${response.status}`);
        return undefined;
      }),
    )
  ).filter(Boolean);
  if (missing.length) throw new Error(`Publish the initial release first: ${missing.join(", ")}`);
  const user = npm(["whoami", "--registry", publisher.registry], root, true).trim();
  console.log(`Configuring npm trusted publishers as ${user}`);
  // npm performs interactive 2FA. Its browser prompt can authorize the following
  // requests for five minutes; space requests to avoid registry rate limiting.
  for (const command of commands) {
    npm(command);
    await setTimeout(2000);
  }
}
