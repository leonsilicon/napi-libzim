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

The patch only changes imports to `napi-libzim`; no tests or assertions are
removed, skipped, or weakened. Runtime copies go into ignored `.upstream-tests`
directories, so the same patch works for this repository and clean installs.
The pristine files are excluded from TypeScript checks because their original
imports target upstream's directory layout; generated tests use our actual types.

To change the adaptation, edit the codemod, run `vp run patch:upstream`, review
the generated diff, then run the suite. To update upstream, replace both files
from an explicit upstream commit and update the revision and hashes first.
