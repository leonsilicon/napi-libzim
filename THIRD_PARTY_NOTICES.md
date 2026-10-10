# Third-party software

This package includes statically linked libzim and its dependencies. Source for
this wrapper and its reproducible build recipes is available at
https://github.com/leonsilicon/napi-libzim. The vcpkg baseline in
`vcpkg-configuration.json` pins all dependency source revisions; upstream source
URLs and hashes are in the corresponding vcpkg ports.

- libzim: GPL-2.0-or-later, https://github.com/openzim/libzim
- Xapian: GPL-2.0-or-later, https://xapian.org/
- ICU: Unicode-3.0, https://github.com/unicode-org/icu
- liblzma: 0BSD and other notices in its source, https://github.com/tukaani-project/xz
- Zstandard: BSD-3-Clause OR GPL-2.0-only, https://github.com/facebook/zstd
- zlib: Zlib, https://github.com/madler/zlib
- libuuid (Linux): BSD-3-Clause and other notices, https://github.com/util-linux/util-linux
- napi-rs: MIT, https://github.com/napi-rs/napi-rs
- cxx: MIT OR Apache-2.0, https://github.com/dtolnay/cxx

The complete dependency copyright notices are copied from vcpkg into every
platform package during CI. Upstream compatibility tests in `tests/upstream`
are from openzim/node-libzim, GPL-3.0-or-later; their origin is recorded there.

Bundled JavaScript helpers: p-limit, yocto-queue, and uint8array-extras (MIT,
https://github.com/sindresorhus/p-limit and
https://github.com/sindresorhus/yocto-queue, and
https://github.com/sindresorhus/uint8array-extras). Their complete licenses are included
in `licenses/`. The release-only execa and semver helpers are development
dependencies and are not included in the published library.
