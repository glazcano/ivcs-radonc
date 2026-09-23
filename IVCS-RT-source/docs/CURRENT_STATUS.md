# IVCS RT — implementation and validation status

This is the authoritative summary of current limitations. Historical change notes describe their original revision only.

## Acquisitions

Regular axial, sagittal, coronal and oblique CT/MR stacks are supported. Parallel irregular stacks are reconstructed with gap reporting. Original files and native geometry are retained for registration/export. Nonparallel stacks are not supported. Enhanced CT/MR and basic Float32 parametric maps are supported within the documented decoder and geometry limits. Temporal acquisitions are separated into phases with cine/MIP/AIP review and an ITV union candidate; there is no deformable motion correction or dose accumulation.

## Registration

Registration is rigid in patient LPS coordinates, with manual triplanar manipulation, anatomical landmarks, local automatic optimization, VOI and explicit linked-series conflict policies. Metric values are optimization measures, not anatomical accuracy. Review anatomy before accepting. Registration now includes per-gesture undo/redo of linked transforms, initial comparison/restoration and triplanar landmark selection. External DICOM REG imports are proposals, with patient/image references and rigid-matrix validation; ambiguous references, scale/reflection and multi-matrix chains are rejected. Transform direction follows [DICOM PS3.3 C.20.2](https://dicom.nema.org/medical/Dicom/2023e/output/chtml/part03/sect_C.20.2.html). No deformable registration is provided.

The automatic method evaluates eight deterministic coarse starts, then refines six rigid parameters. It reports initial/final metric on the same sampling domain, coverage, displacement and angular change. It is still a local optimizer without a Gaussian image pyramid or global-convergence guarantee. A poorer final metric is not substituted for the initial transform. Coverage refers to the chosen sampling domain (VOI or smaller physical acquisition), not whole-body overlap.

Registration layout, divider and zoom-link mode persist as preferences. Linked zoom can use relative magnification or equal physical mm per screen pixel. Pan/zoom are view operations, not modifications of image geometry.

## Contouring and workspace

The 1+2 and 2×2 image panes support the shared contour tools in axial, coronal
and sagittal planes, including registered secondary/fusion displays. Edits are
stored on each ROI's segmentation grid and a stroke across slices is one undo action.
The tools/structures panel and main 1+2 panel can be detached into synchronized
local browser windows. Popup permission is required; closing a popup docks it.

Operations includes physical-radius 3D median, opening/closing, small-component
removal and enclosed-cavity filling, computed in a cancellable worker. Preview
shows voxel additions/removals and volume changes; output defaults to a new ROI.
This is independent binary processing, not joint topology-preserving smoothing.
See [methods and limitations](EDITING_CLEANUP_20260923.md).

New ROIs default to a 2× in-plane segmentation grid; existing native-resolution
ROIs can be upgraded with undo support. Slice spacing remains unchanged. This
improves contour placement precision without adding acquired image detail.
Fine/thick contour outlines maintain their screen width while zooming. Saving,
operations and RTSTRUCT export preserve the segmentation geometry. See
[precision details](SEGMENTATION_PRECISION_20260923.md).

Close application offers save/discard/cancel and gracefully stops the local
server. Save failures keep the application open; other responding workspace
windows must be closed first. Browser-tab closure uses the browser's generic
warning, cannot reliably stop the server, and does not save automatically.
If the browser refuses programmatic tab closure, a stopped-server page remains.
See [shutdown details](APPLICATION_SHUTDOWN_20260923.md).

## Data and performance

Patient/session saving is manual. Preferences may be persisted independently. Contour history shares immutable masks and limits each undo/redo stack to 50 states and 256 MiB of unique buffers; older edits can expire. Image volumes still need to fit in memory. Axial reconstruction is bounded to 4096 per axis and 128 Mi voxels; no silent reduction of source resolution occurs. Preflight estimates include source copies and the working voxel/support arrays, not all browser overhead.

New portable sessions use `.ivcs` bounded binary records with a shared reference volume and a 2 GiB transfer limit. Legacy JSON remains readable up to 128 MiB. Export writes to disk incrementally where File System Access is available; other browsers use a Blob fallback capped at 256 MiB. Opening and saving the library still require the decoded volumes in RAM.

Automatic-registration worker transfer is acknowledged slice by slice without detaching the viewer data. DICOM ZIP output is written sequentially with backpressure when a disk writer is available. Original archives, decoded images and ZIP input files still occupy RAM; this is not an out-of-core pipeline. ZIP payload limits are 1.5 GiB with a disk writer, 256 MiB with Blob output. Decoder/import peaks and large library writes remain practical limits.

## Release and external validation

Public packages must be generated from fresh synthetic staging, never the working patient library. The personal portable command requires `--personal`. Runtime archives are checked against official Node SHA-256 manifests. Source exports use an allowlist and credential scan.

Windows runtime/browser execution, source tests and DICOM round trips can be checked locally. macOS/Linux native execution must be recorded on those platforms; successful archive generation alone is not validation. CI platform checks do not validate signing/notarization or every desktop environment.

Import of RTSTRUCT, original/derived images and Spatial Registration into Elekta Monaco 6 remains an external acceptance step. Local round trips do not establish TPS compatibility, dose-calculation suitability or clinical validation. See [external acceptance protocol](EXTERNAL_ACCEPTANCE.md).
