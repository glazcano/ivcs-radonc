# IVCS RT — 20260923

## GitHub commit summary

Enable multiplanar contouring, 3D cleanup and detachable panels

## GitHub commit description

Use the shared contouring tools in axial, coronal and sagittal panes in the
1+2 and 2x2 layouts, including registered secondary and fusion displays.
Write edits to the reference volume and undo each complete stroke atomically.
Clear-slice operations now target the active editing plane.

Add physical-radius 3D median, opening and closing, small-component removal
and enclosed-cavity filling under Operations. Run calculations in a cancellable
worker, show added/removed voxels and volume changes, and default to a new ROI
after explicit preview review. Preserve locked structures and invalid image
support. Document the methods and references in the application and source.

Allow the tools/structures panel and the main 1+2 pane to open in synchronized
windows for multi-monitor use. Dock panels when their windows close, wait for
styles before fitting the image, and preserve temporary-tool key handling.

Fix active ROI selection after undoing structure creation so portable session
exports remain valid. Keep patient/session saving manual.

Validation: 103 unit/integration tests, TypeScript check, production build,
Windows/Edge synthetic-case tests for multiplanar editing, polygon completion,
atomic undo, active-plane clearing, detached window synchronization and zoom,
cleanup preview/apply/undo, and existing layout/3D lifecycle tests.

## Release packaging

Date revision: 20260923. MIT license, copyright Gabriel Lazcano.
Public portable packages contain only a freshly generated synthetic Luciano
Bello CT/MR demonstration with contours. Source archives exclude working
patient libraries, credentials, dependencies, builds and prior releases.

Windows x64 is the locally tested platform. macOS and Linux packages require
native execution testing on their respective systems. Browser pop-up permission
is needed for detached panels; physical multi-monitor placement has not been
tested automatically. Existing clinical/TPS acceptance limitations remain as
documented in CURRENT_STATUS.md.
