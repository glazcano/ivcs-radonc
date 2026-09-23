# Segmentation precision — 20260923

IVCS RT supports independent per-structure segmentation resolution and constant screen-width contour outlines. The original DICOM pixels and axial slice references are retained.

## Using the controls

- In the viewer toolbar, select **Thin line** (1 CSS pixel) or **Thick line** (3 CSS pixels). The setting also applies to embedded and detached editing panels. Zoom and anisotropic image spacing do not change the outline thickness. ROI opacity controls the fill; outlines remain visible at zero opacity. The browser remembers the line preference.
- In **Structures → Mask resolution**, empty structures can use 1× or 2× XY. New blank structures and templates default to 2×. Existing sessions without resolution metadata remain 1×.
- **Upgrade to 2×** subdivides existing cells without changing their physical shape or volume. The change is undoable. A nonempty structure cannot be downsampled with this selector. Increasing resolution does not add anatomical information; subsequent edits can place boundaries more finely.
- Editing works in individual axial/coronal/sagittal views, 1+2, 2×2, fusion panels and detached panels. Orthogonal scrolling can address the individual half-pixel rows/columns. Axial slice spacing is unchanged.
- Source-derived operations retain their source resolution. Boolean operations use the higher of the two source resolutions. A new BODY is converted to 2× after native-image detection; this does not claim a more detailed BODY detection algorithm. Imported RTSTRUCT and new temporal union candidates use 2×.

## Geometry and DICOM interoperability

`StructureRoi.maskScale` is optional: absent/1 denotes the native grid; 2 denotes twice the rows and columns, with half the X/Y spacing. Z planes remain unchanged. For factor f, mask centre u maps to native coordinate `(u + 0.5) / f - 0.5`. This preserves voxel outer extents, including structures that touch the image boundary. The geometry origin is shifted along the DICOM row and column direction vectors accordingly.

Margins, boolean operations, interpolation, cleanup, volumes, HU statistics, centroids, temporal unions and 3D surfaces use the segmentation geometry. HU statistics weight native voxel intensities by the occupied subcells; no additional measured image information is implied. The displayed editing plane is interpolated from native image data, never saved as an upsampled image volume.

RTSTRUCT contours are encoded in patient-space millimetres with the original slice SOP references. High-resolution ROIs also include the optional Source Pixel Planes Characteristics Sequence (3006,004A). Boundary extraction retains subpixel geometry and holes. Oversized Contour Data uses standard UN when explicit-VR DS would exceed 65534 bytes, rather than silently simplifying or discarding points. Export preflight reconstructs at the highest selected mask resolution before comparing volumes, Dice and boundary differences.

These encodings follow the [DICOM ROI Contour Module](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.8.6.html). Actual import into the destination TPS, including its treatment of fine contours and UN, still requires a test on that system; local round-trip checks do not establish vendor interoperability. For context, [3D Slicer segmentation geometry](https://slicer.readthedocs.io/en/latest/user_guide/modules/segmenteditor.html) also separates segmentation geometry from source-image resolution.

## Storage and performance

- No upsampled DICOM volume is allocated or written. Only displayed editing planes are interpolated. Moving crosshairs in another direction does not rebuild an unchanged image plane.
- A mask at 2× XY uses four times the mask bytes per allocated slice, not eight times. For 512×512 images this is 1 MiB instead of 256 KiB per mask slice. Image storage itself is unchanged.
- Edits copy only changed axial masks. Unchanged arrays remain shared with undo history. Existing history and bitmap cache budgets still apply.
- Outline paths are cached by immutable mask identity and draft revision. Boundary scans use the occupied bounding box; changing line width or zoom does not reconstruct the underlying mask.
- Worker operations that need geometry receive metadata without either the working HU volume or a retained native oblique source volume.
- The local library retains compressed per-slice mask files and incremental manual saves: unchanged masks reuse their files. The streamed `.ivcs` format preserves typed arrays and resolution metadata in bounded records, avoiding giant JSON pixel arrays.
- Existing 1× cases remain readable. Newly saved 2× cases require a build supporting `maskScale`; older IVCS RT versions do not understand their mask dimensions. RTSTRUCT export remains the standards-based interchange route.
- Patient/session saving remains manual. No autosave was introduced.

## Validation

All fixtures are synthetic; no patient data was used.

- TypeScript checking and production Vite build.
- 110 automated unit/integration tests, including physical extents, volumes and native HU values, all-plane write-back, acquisition support, mixed-resolution operations, 3D surfaces, temporal union, streamed and JSON session round-trips, compressed/incremental library saves, RTSTRUCT holes and subpixel coordinates, and oversized UN Contour Data.
- Browser coverage: `tests/multiplanar-editing-browser.mts` with `IVCS_MASK_SCALE=1` and `2`, and `tests/contour-lines-browser.mts`. These cover drawing, undo, legacy upgrades, fusion, detached windows, cleanup and line width under zoom.
- Measured outline widths on anisotropic pixels at approximately 1.47× and 2.37× viewport zoom: thin = 1 pixel, thick = 3 pixels, on both horizontal and vertical edges.

This change does not create new portable release archives. Existing published archives remain unchanged.
