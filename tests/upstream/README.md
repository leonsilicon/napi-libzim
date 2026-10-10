These are pristine files from openzim/node-libzim's `test` directory at commit
`d65b90ffe7c0266b7c6e7677c866001d5dab173a`, licensed GPL-3.0-or-later.
`upstream.json` records their source revision, SHA-256 hashes, and original imports.

Run `vp run test:upstream` after building. It verifies the source hashes, applies
the reviewed patch, and runs all 26 tests with Node's test runner. CI runs them
on every platform and repeats them against the packed npm installation.

Following [Haniverse's codemod-generated patch approach](https://github.com/ImproveLabs/Haniverse/tree/trunk/packages/dev/improve/haniverse/configs/patching),
`scripts/upstream-tests.mjs` selects the TypeScript module imports using Babel's AST,
preserves all other source with MagicString, and generates a unified diff using
the npm `diff` package. `patches.gen/node-libzim@<commit>.patch` is checked in for
review. CI fails if the upstream source or generated patch drifts.

The patch changes imports to `napi-libzim` and adapts the upstream Blob/Buffer
contract to Uint8Array using `scripts/upstream-uint8array.mjs`:

- Blob construction becomes TextEncoder encoding or an empty Uint8Array.
- Nested byte access becomes direct access; byte counts use `byteLength`.
- Text assertions use TextDecoder, preserving the original UTF-8 BOM behavior.
- The crypto Buffer comparison converts its expected value to Uint8Array;
  Buffer inputs remain covered by the original StringItem test.
- The distribution test checks that the removed Blob export is absent.

All 26 tests still run. Assertions continue to check sizes, exact bytes, text,
embedded/trailing NULs, and all unrelated API behavior. No tests are skipped.
Runtime copies go into ignored `.upstream-tests`
directories, so the same patch works for this repository and clean installs.
The pristine files are excluded from TypeScript checks because their original
imports target upstream's directory layout; generated tests use our actual types.

To change the adaptation, edit the codemod, run `vp run patch:upstream`, review
the generated diff, then run the suite. To update upstream, replace both files
from an explicit upstream commit and update the revision and hashes first.
