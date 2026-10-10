# Project Environment

Node.js native library; not React Native, native iOS, or native Android. No device QA needed.
Uses pnpm via Vite+ (`vp install`, `vp check`, `vp test`). Native code uses Rust/napi-rs and a C++17 cxx bridge.
`vp run build:deps` builds pinned libzim and dependencies using vcpkg; `vp run build` builds the binding and JS facade.
Upstream tests are retained for reference but disabled in package scripts, CI, and TypeScript checks. Local tests and clean-install packaging checks remain enabled.
