# Large-study opening fix — 20260916

## Cause

Import stored each reconstructed study successfully as a single compact JSON object. Opening a study or selecting it for registration returned that same object twice: `selected` and `studies[0]`. JSON serialization does not preserve shared references: it repeats the entire image payload, including the native source volume and reconstruction coverage masks.

The supplied MR acquisitions reconstruct to 534 × 544 × 276 and 246 × 529 × 526 working grids. Estimated compact study JSON sizes are 326 and 280 MiB. The old opening response was approximately 652 and 560 MiB, respectively, beyond V8's approximately 512 MiB maximum string length. Thus a successful import could be followed by `Invalid string length` from response serialization. Increasing the heap size does not remove the maximum string length.

## Change

Updated clients negotiate `application/x-ndjson` for the study and export-read endpoints. The server sends bounded records: study metadata, individual working/native slices, individual ROI masks, and an explicit completion record. Writes honor socket backpressure and stop on disconnection. The client consumes UTF-8 incrementally, decodes pixel arrays per record, and checks ordering/counts/completion before returning a study. `selected` and `studies[0]` share a single decoded volume.

The on-disk layout, original DICOM, intensities, reconstruction resolution, contours and revision histories are unchanged. Already imported studies do not require migration or reimport. Existing small JSON API consumers remain compatible, but the updated application client and server must both be used to benefit from streaming. Updating only the frontend against an old portable server does not fix its duplicate JSON response. Restart the updated application and reload its page after installing updated application files; preserve the existing `data` directory.

This addresses study opening, secondary-image loading for registration, temporal review and export preflight reads. It does not redesign the separate monolithic portable-session JSON export or the import upload format. Very large cases still require enough memory for their original and working voxel arrays, but opening no longer duplicates those arrays or constructs one giant response string.

## Verification

- Synthetic stream tests: typed pixel arrays, native source volume, ROI masks, Unicode split across transport chunks, shared volume identity, rejection of truncated/unordered transfers.
- `tests/large-study-stress.mts`: reproduces the former failure with a synthetic duplicated response beyond V8's string limit, then transfers the study incrementally (341 MiB encoded / 256 MiB pixels).
- Both supplied MR volumes completed an in-memory stream round trip with matching SHA-256 checks over all working/native pixels, coverage masks and image geometry. No real image data were written by this check.
- 78 automated tests passed, TypeScript checking and production compilation passed, and the Edge acquisition workflow confirmed streamed study/export reads, phase selection, manual saving and reopening.
- Supplied clinical ZIPs are used only for local diagnosis. No patient images or identifying metadata are included in test fixtures, this document, or distribution artifacts.
