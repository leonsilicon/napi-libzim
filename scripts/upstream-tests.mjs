import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { applyPatch, createTwoFilesPatch, parsePatch } from "diff";
import { execaSync } from "execa";
import MagicString from "magic-string";
import { root } from "./package-utils.mjs";

const upstream = resolve(root, "tests/upstream");
const manifest = JSON.parse(readFileSync(resolve(upstream, "upstream.json"), "utf8"));
const patchFile = resolve(root, "patches.gen", `node-libzim@${manifest.commit}.patch`);

// Like Haniverse's patch generator, select syntax nodes, preserve unrelated
// source, and commit the resulting diff so CI can detect upstream drift.
function patchImports(filename, source, expectedImport) {
  const tree = parse(source, { sourceType: "module", plugins: ["typescript"] });
  const output = new MagicString(source);
  let matches = 0;
  for (const statement of tree.program.body) {
    if (statement.type === "ImportDeclaration" && statement.source.value === expectedImport) {
      output.overwrite(statement.source.start, statement.source.end, '"napi-libzim"');
      matches++;
    }
  }
  assert.equal(matches, 1, `${filename}: expected exactly one upstream module import`);
  return output.toString();
}

export function prepareUpstreamTests(directory, { updatePatch = false } = {}) {
  const files = Object.entries(manifest.files).map(([filename, entry]) => {
    const source = readFileSync(resolve(upstream, filename), "utf8");
    assert.equal(
      createHash("sha256").update(source).digest("hex"),
      entry.sha256,
      `${filename}: pristine upstream source changed; review and update the pinned source`,
    );
    const patched = patchImports(filename, source, entry.import);
    return { filename, source, patched };
  });
  const generated = files
    .map(({ filename, source, patched }) =>
      createTwoFilesPatch(`a/${filename}`, `b/${filename}`, source, patched),
    )
    .join("");
  if (updatePatch) {
    mkdirSync(resolve(root, "patches.gen"), { recursive: true });
    writeFileSync(patchFile, generated);
  }
  const committed = readFileSync(patchFile, "utf8");
  assert.equal(
    committed,
    generated,
    "Upstream patch drifted; run vp run patch:upstream and review",
  );
  const patches = parsePatch(committed);
  assert.equal(patches.length, files.length);
  mkdirSync(directory, { recursive: true });
  return files.map(({ filename, source, patched }, index) => {
    // Apply the reviewable patch with the npm diff library, not a custom parser.
    assert.equal(patches[index].newFileName, `b/${filename}`);
    const applied = applyPatch(source, patches[index], { fuzzFactor: 0 });
    assert.equal(applied, patched, `${filename}: patch failed`);
    const path = resolve(directory, filename);
    writeFileSync(path, applied);
    return path;
  });
}

export function runUpstreamTests(directory, options = {}) {
  const paths = prepareUpstreamTests(resolve(directory, ".upstream-tests"));
  execaSync(process.execPath, ["--test", ...paths], {
    cwd: directory,
    stdio: "inherit",
    ...options,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--update-patch")) {
    prepareUpstreamTests(resolve(root, ".upstream-tests"), { updatePatch: true });
  } else {
    runUpstreamTests(root);
  }
}
