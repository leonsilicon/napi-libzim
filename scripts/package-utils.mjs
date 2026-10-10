import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function napi(args) {
  execFileSync(
    process.execPath,
    [resolve(root, "node_modules/@napi-rs/cli/dist/cli.js"), ...args],
    { cwd: root, stdio: "inherit" },
  );
}
export function npm(args, cwd = root, capture = false) {
  const options = {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  };
  if (process.platform === "win32") {
    const cli = resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    if (!existsSync(cli)) throw new Error(`Cannot find npm CLI at ${cli}`);
    return execFileSync(process.execPath, [cli, ...args], options);
  }
  return execFileSync("npm", args, options);
}
