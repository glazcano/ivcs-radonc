# IVCS RT — 20260915 DICOM fixes

## Backup
Before changes, source.zip and compiled-release.zip were created in backups/20260915-before-dicom-fixes-150254. working-data.zip separately preserves the working library. ZIP CRC checks and SHA-256 hashes are recorded in manifest.json. Backups are local and may contain patient data; they are not release assets.

## Import
One uncompressed monochrome single-frame series still loads directly. Multiple series, compressed series, or a previous lossy-compression flag open a selection dialog. Only chosen series are decoded and archived; choices must belong to one patient. RTSTRUCT, reports and DICOMDIR are not treated as image slices. Unsupported color/multiframe or transfer syntaxes are displayed as unavailable. Corrupt selected image files fail import rather than silently losing slices.

Local WebAssembly decoding supports RLE, JPEG Baseline, JPEG Lossless Process 14 SV1, JPEG-LS, JPEG 2000 and HT-JPEG 2000 transfer syntaxes declared in dicomParser.ts. No external service or API key is used. Compressed originals remain byte-for-byte unchanged in the library. Per-slice source syntax and lossy status survive storage and appear as warnings in TPS export. Lossless does not itself make an image unsuitable for TPS calculation; lossy compression can change values and decoding cannot reverse that loss. TPS acceptance and dose calibration require separate verification.

## Paths
Data now lives at data/s/<24-character study path>/ instead of data/patients/<64>/studies/<64>/. Full public SHA-256 keys and content hashes remain unchanged. A collision check prevents ambiguous shortened directories. Old active and trash entries migrate by same-volume atomic rename on first access; restart completes an interrupted migration without rewriting the manifest. Existing target collisions are rejected rather than overwritten. Temporary filenames no longer append a long UUID to the complete filename. Bulk export directory names are also shorter. Keep the program in a reasonably short writable path; no relative layout can eliminate the OS limit for an arbitrarily long parent folder. Older executables require their original backed-up library layout.

## Display fidelity
The axial view had imageSmoothingEnabled=false. Image and fusion display now use high-quality interpolation; ROI mask rendering retains its own settings. Original rows/columns and pixel arrays are not downsampled or recompressed. The display maps intensities to 8-bit colors after window/level; this does not replace stored image arrays. Library gzip is lossless storage compression, not lossy DICOM image compression. Existing Int16 HU representation and rounding of fractional rescale results are unchanged; this release does not claim arbitrary floating-point quantitative-image support.

## Verification
57 automated tests passed, including exact voxel/reference comparison for RLE, JPEG Lossless, JPEG-LS and JPEG 2000 lossless, lossy provenance, legacy path migration, masks and trash restoration. Browser tests exercised the actual worker/WASM decoder, warning acknowledgment, selected-only ZIP import, and immediate uncompressed import. The included test fixture is one slice from the procedural Luciano Bello phantom, not an acquired patient image.
