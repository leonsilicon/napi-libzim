import { execaSync } from "execa";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { root } from "./package-utils.mjs";
import publisher from "../.github/npm-trusted-publisher.json" with { type: "json" };
const directory = mkdtempSync(resolve(tmpdir(), "napi-libzim-release-"));
try {
  mkdirSync(resolve(directory, ".ci"));
  cpSync(resolve(root, ".ci/publish-release.js"), resolve(directory, ".ci/publish-release.js"));
  cpSync(resolve(root, "package.json"), resolve(directory, "package.json"));
  cpSync(resolve(root, "release"), resolve(directory, "release"), { recursive: true });
  const { version } = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
  // No node_modules in this directory: the release helper must be self-contained.
  execaSync(process.execPath, [".ci/publish-release.js", "--dry-run"], {
    cwd: directory,
    env: { GITHUB_REF_NAME: `v${version}` },
    stdio: "inherit",
  });
  // Exercise OIDC guards and real publish command construction with a fake npm.
  // This phase cannot contact the registry or publish, even when run while logged in.
  const bin = resolve(directory, "fake-bin");
  const log = resolve(directory, "npm-calls.jsonl");
  mkdirSync(bin);
  const stub = `import { appendFileSync } from "node:fs";
if (process.argv[2] === "--version") console.log(process.env.TEST_NPM_VERSION ?? "11.21.0");
else appendFileSync(process.env.TEST_NPM_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
`;
  writeFileSync(resolve(bin, "npm"), `#!/usr/bin/env node\n${stub}`, { mode: 0o755 });
  writeFileSync(resolve(bin, "npm.mjs"), stub);
  writeFileSync(resolve(bin, "npm.cmd"), `@"${process.execPath}" "%~dp0npm.mjs" %*\r\n`);
  const env = {
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    GITHUB_REF_NAME: `v${version}`,
    GITHUB_REPOSITORY: publisher.repository,
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/oidc",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-only-token",
    TEST_NPM_LOG: log,
  };
  const run = (overrides = {}) =>
    execaSync(process.execPath, [".ci/publish-release.js"], {
      cwd: directory,
      env: { ...env, ...overrides },
      reject: false,
    });
  const missingOidc = run({ ACTIONS_ID_TOKEN_REQUEST_URL: "", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" });
  assert.notEqual(missingOidc.exitCode, 0);
  assert.match(missingOidc.stderr, /requires GitHub Actions with id-token: write/);
  const wrongRepo = run({ GITHUB_REPOSITORY: "other/repository" });
  assert.notEqual(wrongRepo.exitCode, 0);
  assert.match(wrongRepo.stderr, /Publishing is restricted/);
  const oldNpm = run({ TEST_NPM_VERSION: "10.9.0" });
  assert.notEqual(oldNpm.exitCode, 0);
  assert.match(oldNpm.stderr, /requires npm >=11.5.1/);
  assert.equal(existsSync(log), false, "Rejected environments must not reach npm publish");
  const published = run();
  assert.equal(published.exitCode, 0, published.stderr);
  const calls = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(
    calls.length,
    readdirSync(resolve(directory, "release")).filter((name) => name.endsWith(".tgz")).length,
  );
  assert(
    calls.at(-1)[1].endsWith(`napi-libzim-${version}.tgz`),
    "Root package must be published last",
  );
  for (const call of calls) {
    assert.equal(call[0], "publish");
    assert.equal(call[call.indexOf("--registry") + 1], publisher.registry);
    assert(call.includes("--provenance"));
    assert(call.includes("--ignore-scripts"));
    assert.equal(call.includes("--dry-run"), false);
  }
  console.log("Bundled release dry run and OIDC publish guards passed");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
