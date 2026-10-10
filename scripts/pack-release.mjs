import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { npm, root } from "./package-utils.mjs";
const destination = resolve(root, "release");
mkdirSync(destination, { recursive: true });
for (const suffix of readdirSync(resolve(root, "npm")))
  npm(
    ["pack", "--ignore-scripts", "--pack-destination", destination],
    resolve(root, "npm", suffix),
  );
npm(["pack", "--ignore-scripts", "--pack-destination", destination]);
