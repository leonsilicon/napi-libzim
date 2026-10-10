# @leonsilicon/napi-libzim

A napi-rs wrapper around [libzim](https://github.com/openzim/libzim), with the
JavaScript API of [@openzim/libzim](https://github.com/openzim/node-libzim),
adapted to use standard `Uint8Array` values for binary content.
The native addon statically includes libzim 9.8.2, Xapian, ICU, liblzma,
Zstandard, and their dependencies. Installing a published package requires no
Rust/C++ toolchain, libzim installation, library-path configuration, or
install-time download script.

```sh
npm install @leonsilicon/napi-libzim
```

```js
import { Archive, Creator, StringItem, Query, Searcher } from "@leonsilicon/napi-libzim";

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
console.log(new TextDecoder().decode(archive.mainEntry.getItem(true).data));
const search = new Searcher(archive).search(new Query("knowledge"));
for (const hit of search.getResults(0, 10)) console.log(hit.path, hit.snippet);
```

`p-limit` handles write scheduling and `uint8array-extras` handles byte-array
validation and concatenation. Both are bundled by Vite+ into both module
formats. Helper packages are development dependencies only; the published
package has no JavaScript runtime dependencies. Build/release scripts use
`execa`, `semver`, and the napi-rs programmatic API. The release script is also
bundled before it is uploaded for publishing.

CommonJS (`require("@leonsilicon/napi-libzim")`) and TypeScript are also supported. To migrate
from `@openzim/libzim`, change the import specifier and adapt binary content
access as shown below. The API includes `Archive`,
`OpenConfig`, `Entry`, `Item`, `Creator`, `StringItem`, `FileItem`,
`StringProvider`, `FileProvider`, `IllustrationInfo`, `IntegrityCheck`,
`Compression`, `Query`, `Searcher`, `SuggestionSearcher`, search results,
iterable entry ranges, and cache controls. Compression and integrity constants
are symbols, matching the original binding. Binary content preserves NUL bytes.

`Item.data`, `Item.getData()`, and content providers' `feed()` return plain
`Uint8Array` values synchronously. There is no custom `Blob` export. Inputs to
`StringItem`, `StringProvider`, `Creator.addMetadata()`, and
`Creator.addIllustration()` accept strings, Uint8Arrays (including Node Buffers),
and ArrayBuffers. Providers still declare their total byte count using `size`;
custom providers return Uint8Array chunks and an empty Uint8Array at EOF.

| Existing node-libzim usage     | napi-libzim usage                     |
| ------------------------------ | ------------------------------------- |
| `item.data.data`               | `item.data`                           |
| `item.data.size`               | `item.data.byteLength`                |
| `item.data.toString()`         | `new TextDecoder().decode(item.data)` |
| `new Blob(text)` in a provider | `new TextEncoder().encode(text)`      |
| `new Blob()` at EOF            | `new Uint8Array()`                    |

Input bytes are copied before queued writes. Reading item data returns owned
bytes; mutating them does not change the archive. Strings are encoded as UTF-8.
For text decoding that preserves a leading UTF-8 BOM like Buffer did, use
`new TextDecoder("utf-8", { ignoreBOM: true })`.

`addItem()` and `finishZimCreation()` return promises and run native writing on
Node's worker pool. Pending writes are ordered; finishing waits for them.
JavaScript content providers and custom index data are copied into owned native
data before use by libzim workers. File items stream directly from disk;
custom JavaScript providers are buffered when passed to the writer.

## Platforms

Node.js 22 or newer. GitHub Actions builds and tests each platform on its native
architecture, then napi-rs creates the matching optional npm package:

| Platform    | Architecture | Platform package                           | Minimum build runtime                     |
| ----------- | ------------ | ------------------------------------------ | ----------------------------------------- |
| macOS       | ARM64        | `@leonsilicon/napi-libzim-darwin-arm64`    | macOS 11                                  |
| macOS       | x64          | `@leonsilicon/napi-libzim-darwin-x64`      | macOS 11                                  |
| Linux glibc | x64          | `@leonsilicon/napi-libzim-linux-x64-gnu`   | glibc 2.35 (Ubuntu 22.04)                 |
| Linux glibc | ARM64        | `@leonsilicon/napi-libzim-linux-arm64-gnu` | glibc 2.39 (Ubuntu 24.04)                 |
| Windows     | x64          | `@leonsilicon/napi-libzim-win32-x64-msvc`  | Windows 10 with the standard MSVC runtime |

Linux still uses the host's standard C/C++ runtime; Windows uses the standard
MSVC runtime. libzim and all its non-system dependencies are included. Alpine /
musl, Windows ARM64, 32-bit targets, and browsers are not configured. Keep npm
optional dependencies enabled so the correct platform package is installed.

## Development

Building this repository requires Git, Node.js, Vite+, Rust, and a C++17
compiler. macOS requires Xcode command-line tools and Homebrew `autoconf`, `automake`,
`libtool`, `pkg-config`, and `ninja`; Windows requires Visual
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

## Tests and release validation

`tests/upstream` contains every assertion from node-libzim's main test suite
and distribution test at commit `d65b90ffe7c0266b7c6e7677c866001d5dab173a`.
The files remain pristine. `vp run test:upstream` verifies their hashes and
applies a reviewed import and Uint8Array adaptation patch before running every test. A TypeScript AST
codemod generates the committed diff in `patches.gen`; regenerate it with
`vp run patch:upstream`. See [the patching workflow](tests/upstream/README.md).
The local tests exercise binary slices,
concurrent writes, file items, custom providers/index data, geo queries,
multi-archive searches, illustration names, invalid inputs, and lifecycle.

CI runs the local and upstream tests, then repeats the upstream suite and
verifies ESM/CommonJS loading from packed npm packages installed in a clean
temporary directory with `--ignore-scripts`.
It checks that JavaScript helpers are bundled and audits dynamic linkage to reject external libzim,
compression, or search libraries. Pull requests and main pushes upload the
platform bindings and complete npm tarballs as artifacts.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
with GitHub's OIDC identity. The `publish` job grants `id-token: write`, uses
npm 11.21.0 on a GitHub-hosted runner, and publishes verified tarballs without
installing project dependencies. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` is used.
The GitHub `npm` environment permits release tags matching `v*`.

For the one-time npm setup, each of the six packages must already exist in the
registry. Publish the initial verified release using an npm account with package
write access, then log in with `npm login` and run:

```sh
vp run setup:trusted-publishing --dry-run  # inspect the six configurations
vp run setup:trusted-publishing            # npm will request account 2FA
```

The command derives the five platform package names from napi-rs's target
configuration and registers these exact settings for every package:

| Setting           | Value               |
| ----------------- | ------------------- |
| GitHub owner      | `leonsilicon`       |
| Repository        | `napi-libzim`       |
| Workflow filename | `ci.yml`            |
| Environment       | `npm`               |
| Permission        | Allow `npm publish` |

The values are recorded in `.github/npm-trusted-publisher.json`. Setup requires
npm >=11.15.0 and 2FA; configuring GitHub alone does not activate npm trust.
New trusted-publisher configurations need a successful OIDC publish within two
days or npm expires them. See [npm's setup requirements](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
and [configuration expiry](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry).

After npm setup, set the package/Cargo versions together and push a matching
`v<version>` tag. The workflow waits for all five native builds and
package checks, publishes platform packages first, then publishes the root
package with provenance. A normal push to main does not publish to npm. No registry credentials
are needed to build or test.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Each platform package includes
the copyright/license notices of its statically linked dependencies. Native
build recipes and pinned source URLs are available in this repository.
