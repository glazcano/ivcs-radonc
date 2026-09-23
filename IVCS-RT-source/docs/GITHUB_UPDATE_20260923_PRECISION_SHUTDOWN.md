# IVCS RT — 20260923 precision and shutdown update

## Commit summary

Add subpixel contouring and safe application shutdown

## Commit description

- Default new structures to 2× in-plane masks and allow undoable upgrades of existing masks.
- Preserve segmentation geometry across editing, operations, manual saving and DICOM RTSTRUCT export.
- Add fine/thick contour outlines with consistent screen width at different zoom levels.
- Add Close application with save/discard/cancel, save-error protection and graceful local-server shutdown.
- Warn on browser-tab closure and prevent shutdown while other responding workspace windows remain open.
- Prepare fresh portable packages and an allowlisted source archive with only the synthetic Luciano Bello CT/MR demonstration case.

## Release notes

This update builds on the earlier 20260923 release. Finer segmentation grids
improve contour placement without changing source image resolution or slice
spacing. Native-resolution structures remain supported alongside finer masks.

Use Close application to save and stop IVCS RT. Closing a browser tab alone does
not save or stop Node. Browsers control the wording of their native close warning
and may prevent automatic tab closure; IVCS RT then displays a stopped-server page.

Windows packages are checked locally. macOS and Linux packages include their
respective runtimes but require native testing. TPS import acceptance remains
pending; local DICOM round trips are not clinical validation.

Back up your library before upgrading. With both copies stopped, migrate the
entire data folder to preserve cases. Public downloads include synthetic data only.
