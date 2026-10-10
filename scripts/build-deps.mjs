import { execaSync } from "execa";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const vcpkgRoot = resolve(root, ".native/vcpkg");
const revision = "e456309491fd875487bf02b8a0dca76c1b1b00cc";
const triplets = {
  "darwin-arm64": "arm64-osx",
  "darwin-x64": "x64-osx",
  "linux-arm64": "arm64-linux",
  "linux-x64": "x64-linux",
  "win32-x64": "x64-windows-static-md",
};
const triplet = triplets[`${process.platform}-${process.arch}`];
if (!triplet) throw new Error(`Unsupported build host: ${process.platform}-${process.arch}`);
const run = (cmd, args, cwd = root) =>
  execaSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, VCPKG_ROOT: vcpkgRoot },
  });
mkdirSync(resolve(root, ".native"), { recursive: true });
if (!existsSync(resolve(vcpkgRoot, ".git"))) {
  run("git", ["init", vcpkgRoot]);
  run("git", ["remote", "add", "origin", "https://github.com/microsoft/vcpkg.git"], vcpkgRoot);
}
let currentRevision;
try {
  currentRevision = execaSync("git", ["rev-parse", "HEAD"], {
    cwd: vcpkgRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).stdout.trim();
} catch {
  currentRevision = "";
}
if (currentRevision !== revision) {
  run("git", ["fetch", "--depth=1", "origin", revision], vcpkgRoot);
  run("git", ["checkout", "--detach", revision], vcpkgRoot);
}
if (process.platform === "win32") {
  run("cmd.exe", ["/c", "bootstrap-vcpkg.bat", "-disableMetrics"], vcpkgRoot);
} else {
  run("sh", ["bootstrap-vcpkg.sh", "-disableMetrics"], vcpkgRoot);
}
run(resolve(vcpkgRoot, process.platform === "win32" ? "vcpkg.exe" : "vcpkg"), [
  "install",
  `--triplet=${triplet}`,
  `--x-install-root=${resolve(root, ".native/vcpkg/installed")}`,
]);
