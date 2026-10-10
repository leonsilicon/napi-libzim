# napi-libzim

A napi-rs wrapper around [libzim](https://github.com/openzim/libzim), with the
JavaScript API of [@openzim/libzim](https://github.com/openzim/node-libzim).
The native addon statically includes libzim 9.8.2, Xapian, ICU, liblzma,
Zstandard, and their dependencies. Installing a published package requires no
Rust/C++ toolchain, libzim installation, library-path configuration, or
install-time download script.

```sh
npm install napi-libzim
```

```js
import { Archive, Creator, StringItem, Query, Searcher } from "napi-libzim";

const creator = new Creator()
  .configIndexing(true, "en")
  .configNbWorkers(2)
  .startZimCreation("example.zim");

await creator.addItem(
  new StringItem(
    "hello",
    "text/html",
    "Hello",
    { FRONT_ARTICLE: 1, COMPRESS: 1 },
    "<h1>Hello</h1><p>Offline knowledge.</p>",
  ),
);
creator.addMetadata("Title", "Example archive");
creator.setMainPath("hello");
await creator.finishZimCreation();

const archive = new Archive("example.zim");
for (const entry of archive.iterByPath()) console.log(entry.path, entry.title);
console.log(archive.mainEntry.getItem(true).data.toString());
const search = new Searcher(archive).search(new Query("knowledge"));
for (const hit of search.getResults(0, 10)) console.log(hit.path, hit.snippet);
```

CommonJS (`require("napi-libzim")`) and TypeScript are also supported. To migrate
from `@openzim/libzim`, change the import specifier. The API includes `Archive`,
`OpenConfig`, `Entry`, `Item`, `Blob`, `Creator`, `StringItem`, `FileItem`,
`StringProvider`, `FileProvider`, `IllustrationInfo`, `IntegrityCheck`,
`Compression`, `Query`, `Searcher`, `SuggestionSearcher`, search results,
iterable entry ranges, and cache controls. Compression and integrity constants
are symbols, matching the original binding. Binary content preserves NUL bytes.

`addItem()` and `finishZimCreation()` return promises and run native writing on
Node's worker pool. Pending writes are ordered; finishing waits for them.
JavaScript content providers and custom index data are copied into owned native
data before use by libzim workers. File items stream directly from disk;
custom JavaScript providers are buffered when passed to the writer.

## Platforms

Node.js 22 or newer. GitHub Actions builds and tests each platform on its native
architecture, then napi-rs creates the matching optional npm package:

| Platform    | Architecture | Platform package              | Minimum build runtime                     |
| ----------- | ------------ | ----------------------------- | ----------------------------------------- |
| macOS       | ARM64        | `napi-libzim-darwin-arm64`    | macOS 11                                  |
| macOS       | x64          | `napi-libzim-darwin-x64`      | macOS 11                                  |
| Linux glibc | x64          | `napi-libzim-linux-x64-gnu`   | glibc 2.35 (Ubuntu 22.04)                 |
| Linux glibc | ARM64        | `napi-libzim-linux-arm64-gnu` | glibc 2.39 (Ubuntu 24.04)                 |
| Windows     | x64          | `napi-libzim-win32-x64-msvc`  | Windows 10 with the standard MSVC runtime |

Linux still uses the host's standard C/C++ runtime; Windows uses the standard
MSVC runtime. libzim and all its non-system dependencies are included. Alpine /
musl, Windows ARM64, 32-bit targets, and browsers are not configured. Keep npm
optional dependencies enabled so the correct platform package is installed.

## Development

Building this repository requires Git, Node.js, Vite+, Rust, and a C++17
compiler. macOS requires Xcode command-line tools; Windows requires Visual
Studio's C++ build tools. Linux also needs `autoconf`, `automake`, `libtool`,
`pkg-config`, and `ninja-build`. CMake/Meson are provisioned by vcpkg as needed.

```sh
vp install
vp run build:deps  # builds the pinned native dependencies; cached after first run
vp run build       # napi-rs addon, generated loader/types, ESM/CommonJS facade
vp check
vp test
vp run test:upstream
cargo fmt --check
```

The first dependency build takes several minutes. All native source downloads
happen during development/CI. `vcpkg-configuration.json` pins the dependency
registry; `native/ports/libzim` pins and verifies libzim 9.8.2's source archive.
No system libzim is used.

## Compatibility and release validation

`tests/upstream` contains every assertion from node-libzim's main test suite
and distribution test at commit `d65b90ffe7c0266b7c6e7677c866001d5dab173a`.
Only import paths are changed. Additional tests exercise binary slices,
concurrent writes, file items, custom providers/index data, geo queries,
multi-archive searches, illustration names, invalid inputs, and lifecycle.

CI runs the upstream suite twice per platform: once against the build and
once against packed npm packages installed in a clean temporary directory with
`--ignore-scripts`. It also audits dynamic linkage to reject external libzim,
compression, or search libraries. Pull requests and main pushes upload the
platform bindings and complete npm tarballs as artifacts.

To publish, set the package/Cargo versions together, configure the repository's
`npm` environment and `NPM_TOKEN` secret (or npm trusted publishing), then push a
matching `v<version>` tag. The workflow waits for all five native builds and
package checks, publishes platform packages first, then publishes the root
package. A normal push to main does not publish to npm. No registry credentials
are needed to build or test.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Each platform package includes
the copyright/license notices of its statically linked dependencies. Native
build recipes and pinned source URLs are available in this repository.
