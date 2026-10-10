import { execaSync } from "execa";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../", import.meta.url));
export function npm(args, cwd = root, capture = false) {
  return execaSync("npm", args, {
    cwd,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  }).stdout;
}
