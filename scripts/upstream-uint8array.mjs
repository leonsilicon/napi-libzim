import assert from "node:assert/strict";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import MagicString from "magic-string";

const member = (node, property) =>
  node?.type === "MemberExpression" &&
  !node.computed &&
  node.property.type === "Identifier" &&
  node.property.name === property;

// These are the upstream Blob bindings and Item.data getters. Their byte
// accessors become the value itself; other size/data properties stay intact.
function wrapper(node) {
  if (node.type === "Identifier") return node.name === "blob" || node.name === "feed";
  return member(node, "data") && !wrapper(node.object);
}
const content = (node) => wrapper(node) || (member(node, "data") && wrapper(node.object));

export function patchUint8Array(filename, source) {
  const tree = parse(source, { sourceType: "module", plugins: ["typescript"] });
  const output = new MagicString(source);
  const text = (node) => output.slice(node.start, node.end);
  let removedImports = 0;
  traverse(tree, {
    ImportDeclaration({ node }) {
      if (node.source.value !== "napi-libzim") return;
      const index = node.specifiers.findIndex((specifier) => specifier.local.name === "Blob");
      assert.notEqual(index, -1, `${filename}: upstream Blob import drifted`);
      const specifier = node.specifiers[index];
      const next = node.specifiers[index + 1];
      assert(next, `${filename}: expected a following import specifier`);
      output.remove(specifier.start, next.start);
      removedImports++;
    },
    NewExpression: {
      exit({ node }) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "Blob") return;
        assert(node.arguments.length <= 1, `${filename}: unexpected Blob constructor`);
        output.overwrite(
          node.start,
          node.end,
          node.arguments.length === 0
            ? "new Uint8Array()"
            : `new TextEncoder().encode(${text(node.arguments[0])})`,
        );
      },
    },
    MemberExpression: {
      exit({ node }) {
        if (!wrapper(node.object)) return;
        if (member(node, "data")) output.overwrite(node.start, node.end, text(node.object));
        else if (member(node, "size"))
          output.overwrite(node.start, node.end, `${text(node.object)}.byteLength`);
      },
    },
    CallExpression: {
      exit({ node }) {
        if (member(node.callee, "toString") && content(node.callee.object)) {
          assert.equal(node.arguments.length, 0, `${filename}: unexpected content encoding`);
          // Buffer's UTF-8 decoding preserves a leading BOM. Keep that behavior
          // in these equivalence assertions rather than silently stripping it.
          output.overwrite(
            node.start,
            node.end,
            `new TextDecoder("utf-8", { ignoreBOM: true }).decode(${text(node.callee.object)})`,
          );
        } else if (
          member(node.callee, "deepEqual") &&
          node.arguments[1]?.type === "Identifier" &&
          node.arguments[1].name === "hash"
        ) {
          // crypto.digest() still returns Buffer; compare the same bytes using
          // the new return type without changing the assertion's strictness.
          const hash = node.arguments[1];
          output.overwrite(hash.start, hash.end, "new Uint8Array(hash)");
        } else if (
          node.callee.type === "Identifier" &&
          node.callee.name === "assert" &&
          node.arguments[0]?.type === "Identifier" &&
          node.arguments[0].name === "Blob"
        ) {
          output.prepend('import * as libzim from "napi-libzim";\n');
          output.overwrite(node.start, node.end, 'assert.equal("Blob" in libzim, false)');
        }
      },
    },
    StringLiteral({ node }) {
      if (node.value === "Blob") output.overwrite(node.start, node.end, '"Uint8Array content"');
      else if (node.value === "constructs a blob")
        output.overwrite(node.start, node.end, '"constructs empty bytes"');
    },
  });
  assert.equal(removedImports, 1, `${filename}: expected one Blob import adaptation`);
  return output.toString();
}
