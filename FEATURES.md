# IVCS RT — Feature Overview

IVCS RT is a portable application for local DICOM visualization, radiotherapy contouring and rigid image registration. It runs on your computer without an account, cloud service or personal API key.

## Patient Library

- Organize patients by patient ID and full name.
- Filter patients and studies using flexible text searches.
- Browse studies and identify saved registration groups.
- Manage and delete patients or studies, with recoverable deletion.
- Keep the library and DICOM files together in a portable `data/` folder.
- Save manually, including quick save with **Ctrl+S**.

## DICOM Import and Visualization

- Import individual DICOM files and ZIP archives.
- Select series before loading multi-series acquisitions.
- Decode supported compressed transfer syntaxes and flag lossy images.
- Support validated headerless DICOM datasets.
- Reconstruct oblique and non-axial acquisitions while retaining their original volumes.
- Handle supported irregular parallel acquisitions, Enhanced CT/MR and basic floating-point parametric maps.
- Open large studies through streamed loading.
- View axial, coronal and sagittal planes in single-plane, **2×2** or adjustable **1+2** layouts.
- Configure panels for reference images, registered secondary images, fusion or interactive 3D contours.
- Adjust window/level, zoom, pan and synchronized crosshairs.

## Contouring Tools

- Brush, pencil and polygon tools.
- Contour interpolation between slices.
- Boolean structure operations.
- Symmetric and asymmetric margins.
- Threshold-based connected-region selection.
- Auto BODY generation with preview, review controls and optional couch/noise removal.
- New-volume creation as the default Auto BODY destination.
- Structure visibility, colors, opacity, locking and favorites.
- Undo/redo and keyboard shortcuts.

## 3D Structure Visualization

- Interactive rotation and zoom.
- Structure transparency controlled by ROI opacity.
- Silhouette outlines that retain a volume reference at zero opacity.
- Rendering active only while the 3D view is in use.

## Rigid Image Registration

- Six-parameter rigid registration in DICOM physical coordinates.
- Manual translation and rotation from any orthogonal plane.
- Synchronized triplanar previews in a row or adjustable **1+2** layout.
- Rotation around the shared crosshair.
- Anatomical landmark registration with per-point errors and RMS reporting.
- Experimental local automatic registration with:
  - Classic and smoothed normalized mutual information.
  - Normalized correlation for CT-to-CT alignment.
  - A configurable volume of interest (VOI).
  - Live intermediate previews and cancellation.
  - Explicit proposal acceptance or rejection.
- Fusion display modes: blend, checkerboard, horizontal/vertical curtain and difference.
- Independent secondary-image window/level, palette and opacity.
- Preservation of linked-series relationships identified through DICOM Frame of Reference UIDs and saved registration groups.
- Conflict-resolution controls for competing relationships, fixed references and locked transforms.

## Temporal and 4D Review

- Separate supported temporal acquisitions into selectable volumes.
- Review phases using cine playback and comparison views.
- Generate temporal MIP and AIP previews.
- Open individual phases for contouring.
- Create an ITV union candidate from compatible saved phase contours.

## Export and Interoperability

- Export DICOM RTSTRUCT with contour round-trip checks.
- Export DICOM ZIP bundles containing images and structures.
- Include selected registered secondary series and DICOM Spatial Registration objects in advanced ZIP exports.
- Preserve archived original DICOM files.
- Perform batch TPS exports from the library.
- Export portable JSON sessions and CSV volume reports.

## Portability, Language and Transparency

- Portable packages for Windows x64, macOS Intel/Apple Silicon and Linux x64/ARM64.
- English interface by default, with Spanish included.
- File-based translation catalogs for additional languages.
- MIT license, copyright Gabriel Lazcano.
- Date-based revision identifiers.
- About section with dependencies, references and development attribution.
- Synthetic prostate radiotherapy demonstration case with simulated CT, MRI and example structures.

IVCS RT began in Google AI Studio and was developed through *vibe coding* with assistance from Google AI Studio and Chat GPT 6 Astra.

## Current Limitations

IVCS RT is not clinically validated. Automatic registration requires anatomical review, and exported structures and registrations must be checked in the destination TPS.

Registration is rigid, not deformable. External DICOM REG import is not currently supported. Temporal MIP/AIP are previews rather than exportable derived volumes, and reconstructed floating-point maps have DICOM export restrictions. Advanced registration transfer depends on the destination TPS supporting DICOM REG. Treatment plans and dose are not exported.

The local patient library is not encrypted. Only synthetic data should be included in public repositories, releases, screenshots and issue reports.
