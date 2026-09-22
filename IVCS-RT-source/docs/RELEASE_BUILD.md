# Rebuilding public packages

Use Node 24 and the pinned pnpm version in package.json. Install with `pnpm install --frozen-lockfile`. Python 3 is used for runtime extraction, audits and archives. No previous release is required.

1. Run `pnpm lint` and `pnpm test`.
2. Move an existing `build/release-common` aside; staging refuses to mix old data.
3. Run `pnpm release:stage`. This builds the web app/server and generates a fresh, verified synthetic demo.
4. Run `python scripts/fetchNodeRuntime.py`. Official Node runtimes are downloaded over HTTPS and checked against the pinned SHA-256 values in `scripts/nodeRuntime.json`.
5. Run `python scripts/buildPublicRelease.py YYYYMMDD` using the same date as the web build. The output is a new `releases/YYYYMMDD-consolidation` directory. Existing output is never overwritten.
6. Run `node tests/portable-native.mjs <matching-platform-folder>` on each target platform. The test copies the package to a temporary path with spaces, checks the bundled runtime/server and synthetic library, and records its exact scope. Desktop/TPS acceptance is separate.
7. Run `python scripts/packageRelease.py YYYYMMDD-consolidation` for privacy checks, file manifests and ZIP/tar.gz archives.
8. Run `python scripts/prepareSource.py IVCS-RT-YYYYMMDD-source` to create an allowlisted source snapshot and audit.

The public builder reads only built code, translations/docs, pinned runtimes and newly generated synthetic staging. `pnpm portable --personal` is a separate local workflow that includes the working library and must not be distributed publicly. Source releases omit working libraries, credentials, caches and binaries.

These builds are reproducible as a process from source and pinned dependencies; they are not byte-for-byte reproducible archives (DICOM instance identifiers and timestamps are generated afresh). The GitHub Actions matrix executes source/browser checks on Windows, Linux and macOS. It does not substitute for testing every packaged architecture, desktop launcher, signing/notarization or a TPS.
