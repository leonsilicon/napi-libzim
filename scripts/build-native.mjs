import { createBuildCommand, NapiCli } from "@napi-rs/cli";
import { root } from "./package-utils.mjs";
const options = createBuildCommand([
  "--platform",
  "--release",
  "--output-dir",
  "binding",
  "--js",
  "index.cjs",
  "--dts",
  "index.d.cts",
  ...process.argv.slice(2),
]).getOptions();
const { task } = await new NapiCli().build({ ...options, cwd: root });
await task;
