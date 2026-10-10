The libzim overlay is adapted from microsoft/vcpkg at
`e456309491fd875487bf02b8a0dca76c1b1b00cc` (MIT; see LICENSE).
It updates the libzim source to 9.8.2 with its SHA-512 checksum and disables
upstream examples, documentation, and tests. The vcpkg portability/static-link
patches are retained, with the version context updated in cross-builds.diff.
