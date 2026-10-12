# Stability baseline — 2026-10-12

Starting revision: `b84a9aa61a3b48a7ef41ad35f9b1f9d842cb2689` on `main`.

## Changes

- Add a repository-root GitHub Actions workflow. The existing workflow under
  `IVCS-RT-source/.github/` is packaged for standalone source exports and is not
  discovered by GitHub Actions in this repository layout.
- Set the repository workflow's command directory, dependency-cache path and
  evidence path to `IVCS-RT-source`.
- Include the existing multiplanar editing tests at native and 2× mask resolution,
  and the save/discard application-exit test, in both workflows.
- Correct the registration browser test's outdated cancellation button label.
  Hold the first registration worker's final result in the test harness so the
  cancellation check remains deterministic on fast machines. Real computation
  and progress messages still run; the following registration completes normally.
- Make the application-exit browser test honor `IVCS_BROWSER_CHANNEL`, including
  Chromium selected by CI on Windows.
- Document the source directory and the two workflow roles in the root README.

## Local verification

Verified on Linux with Node.js 24.19.0 and pnpm 11.25.0 using the unchanged
lockfile. Dependency installation disabled lifecycle scripts. The documented
pnpm version and workflow version remain 11.19.0.

- TypeScript check: passed.
- Production build: passed. Existing codec `eval` and large-chunk warnings remain.
- Synthetic release-library generation and DICOM round trips: passed.
- Unit/integration suite: 112 passed, zero failed or skipped.
- Multiplanar browser editing: passed at both native and 2× mask resolution,
  including atomic undo, fusion, detached panels and cleanup preview/apply/undo.
- Application exit: save and discard passed, including cancel, save failure,
  other-window protection and local-server shutdown.
- Registration browser workflow: passed after the test fixes, including physical
  drags, linked transforms, VOI, cancellation, proposals and group persistence.
- Workflow YAML parsing, source/cache/artifact paths and standalone command parity:
  passed. `git diff --check`: passed.

Browser checks used bundled Playwright 1.62.1 and system Chromium
154.0.8037.97 through a temporary launcher adapter outside the repository.
CI continues to install Playwright 1.55.1 and its Chromium. That exact browser
combination and the Windows/macOS matrix have not been executed in this session.
All data used for these checks was synthetic. Changes are local and have not
been committed or pushed; GitHub Actions execution remains pending publication.

## Next stability work

Run the corrected workflow on GitHub, inspect the platform results, and then
extend coverage using the existing DICOM import/export and library browser tests.
Native portable startup and persistence checks remain separate acceptance work.
Destination-TPS acceptance remains pending as documented in
[EXTERNAL_ACCEPTANCE.md](EXTERNAL_ACCEPTANCE.md).

## GitHub CI follow-up

The fixes were published in draft PR #1 on branch `codex/stability-ci-20261012`.
The initial CI run passed the 112 source tests, TypeScript and production build
on all three platforms. Registration and both editing resolutions also passed
on Linux and macOS, but the exit browser test hung when Playwright intercepted
the failing save after a dismissed `beforeunload` dialog.

Reproduced locally with pinned Playwright 1.55.1 and Chromium 140.0.7339.186.
Replacing interception with a real HTTP 500 from the isolated synthetic test
server made save/discard checks pass with that browser. The test asserts that
the failed save was received once, the server remains running, and the retry
preserves or discards edits as selected. Failure diagnostics now include the
visible page text and a screenshot. Cross-platform verification of this fix is
pending the follow-up CI run.
