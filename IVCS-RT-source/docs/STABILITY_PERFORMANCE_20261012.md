# Stability and performance — 20261012

## Library consistency and responsiveness

Opening a study now hydrates its state, masks and images inside the same queue used by mutations and revision cleanup. A save cannot delete a revision or mask while that opening needs it. Read failures and cancellation release the queue. Existing atomic manifest commits and stale-write revision checks are retained.

Compression/decompression uses asynchronous zlib, awaited sequentially inside this queue. This bounds codec concurrency for a library and keeps compression work off the main Node event loop. The gzip/JSON file format is unchanged. Baseline ROI lookups use maps rather than a linear search for every mask. Browser encoding uses native typed-array base64 when available, with the previous compatible fallback; typed subarrays retain their exact byte offsets.

The conservative queue means a long opening can delay a save, and a save can delay an opening. JSON parsing/stringification and full image-file allocation remain synchronous/full-volume operations. This change does not introduce a storage migration or a disk-backed image pipeline.

A local synthetic 64 MiB buffer measurement gave:

| Operation | Duration | Maximum 1 ms timer gap |
| --- | ---: | ---: |
| gzip synchronous | 184 ms | 184 ms |
| gzip asynchronous | 201 ms | 2 ms |
| gunzip synchronous | 90 ms | 91 ms |
| gunzip asynchronous | 157 ms | 35 ms |

These measurements demonstrate improved event-loop availability on this machine, not lower total processing time, clinical-study performance or a universal speedup. JSON and final output allocation still have costs.

## 3D surfaces

Geometry dependencies are separated from ROI name, color, opacity, lock state and irrelevant active selection. The view retains one surface per displayed ROI and computes only surfaces whose immutable mask identity or resolution changed. Removed/hidden meshes are disposed; historical surfaces are not cached. Camera fitting, geometry generation and rendering algorithms are unchanged.

Workers are terminated on successful output, reported calculation errors, runtime errors, construction/postMessage errors, cancellation and unmount. Worker errors are visible rather than silently leaving computation active. Mask arrays remain immutable and are never transferred away from the live case.

## History memory

Undo and redo now share a 256 MiB budget for additional backing buffers retained by history, excluding buffers already held by the active case. Each timeline retains at most 50 contiguous newest states. Unique buffers shared between histories count once. Large live masks no longer consume the entire history budget by themselves; removed masks still count when history is their only owner. The active case itself can exceed this budget: it is a history-retention limit, not a whole-application RAM limit.

## Study transfers and cancellation

Every complete record is checked before decoding, including when the entire oversized line arrives in one chunk. Transfers have defaults of 64 MiB per record, 2 GiB of decoded binary arrays and 4 GiB of received data. Headers, typed arrays, positive integer image dimensions, valid-pixel arrays and ROI mask dimensions/references are checked before returning a case. Partial, truncated, malformed or cancelled responses never become the active session.

Library read APIs accept AbortSignal and progress callbacks. Opening from Library shows received MiB with throttled updates and a Cancel button. Cancellation aborts fetch/reader, preserves the current case and permits reopening. Server reads detect disconnected requests and check cancellation at queue entry and between hydration steps; already running zlib work is awaited before releasing the queue. These controls do not add short timeouts to saves.

## Validation

- TypeScript and production build.
- 122 automated tests, including read/cleanup concurrency, cancelled read recovery, native/fallback base64 subarrays, combined history accounting, surface invalidation, oversized complete/fragmented records, aggregate limits, dimensions and stalled-stream cancellation.
- Browser regression: opening a stalled study, cancellation/disconnection, preservation of the active case and reopening.
- 3D browser regression: active-selection surface reuse, injected reported worker error and worker cleanup, rotation/zoom, opacity, idle rendering, layouts and unmount.
- Existing synthetic multiplanar editing at 1× and 2×, atomic undo, fusion, detached panels, cleanup, repeated save/discard shutdown and bilingual compact-workspace checks.

All test data are synthetic. No working patient library or existing release archive was modified. After merging, rebuild and verify the draft release assets before publishing; the existing draft targets the prior main commit.
