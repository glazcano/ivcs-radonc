# Consolidation — 20260922

## Approved backlog

| Items | Implemented / remaining scope |
| --- | --- |
| 1–2 | Current portable/source delivery; current status consolidated; stale irregular-acquisition documentation corrected. |
| 3 | Local DICOM checks and synthetic TPS fixture with known nonidentity rigid CT/MR geometry. Actual Monaco 6 acceptance remains pending. |
| 4 | Native portable smoke command and Windows/macOS/Linux browser CI matrix. Only Windows execution is available locally; other native package/desktop tests remain pending. |
| 5 | Fresh source-based public staging, pinned and verified Node runtimes, synthetic-only packages. Personal-library packaging requires an explicit `--personal` flag. |
| 6–7 | Undo/redo for complete registration gestures and linked-series snapshots; initial comparison and selected-transform restoration. |
| 8 | Triplanar anatomical landmark selection in both images, in physical coordinates. |
| 9 | External rigid DICOM REG import as an explicit proposal, with identity/reference/matrix validation and direction conversion. Multi-matrix chains and ambiguous mappings are rejected. |
| 10 | Affected-series names, fixed/locked status and relationship paths in conflict review. |
| 11–12 | Eight coarse starts before local refinement; same-domain initial/final metric, coverage, physical displacement/rotation and review warnings. A Gaussian pyramid and global optimizer are not implemented. |
| 14 | Persisted registration layout/divider/link preferences; relative or physical linked zoom. |
| 20 | Bounded binary session records (`.ivcs`), reference-volume sharing, streamed read/write, backward-compatible bounded legacy JSON import. |
| 21 | Acknowledged worker slice transfers; sequential ZIP disk output with backpressure and write-failure handling. Decoded images and original ZIP inputs still reside in memory. |
| 22 | Reconstruction dimensions, voxel count and byte estimate before worker allocation; explicit limit rejection. |
| 23 | Existing immutable-mask sharing retained; history now has per-stack byte and count budgets. The earlier review's inference of full mask copies was incorrect. |
| 24 | Browser CI matrix; expanded synthetic checks for streamed session opening, registration history, physical linked zoom, landmarks, fusion, VOI, cancellation and persistence. |

## Validation

Type checking, unit/integration tests and the Windows Edge synthetic browser flow are run locally before packaging. ZIP tests include a deliberately slow writer and a failing writer. REG tests verify nonidentity direction and reject scaling/reflection and wrong patients. Session tests reject incomplete/duplicate records and compare voxel arrays. Reconstruction preflight is checked against actual output allocations.

Generate the destination-TPS fixture with `node --import tsx scripts/registrationQa.ts` after generating the release demo. It produces `validation/TPS-rigid-registration-QA.zip`, with unchanged synthetic MR pixel values, a distinct MR frame of reference, a known offset/rotation, REG and expected LPS landmarks. It records external TPS acceptance as **PENDING**.

See [current limitations](CURRENT_STATUS.md), [public build procedure](RELEASE_BUILD.md) and [external acceptance protocol](EXTERNAL_ACCEPTANCE.md). No patient autosave was added. These changes do not establish clinical validation.
