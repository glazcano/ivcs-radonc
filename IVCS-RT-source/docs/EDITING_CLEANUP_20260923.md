# Multiplanar editing, volume cleanup and detachable panels — 20260923

The configurable 1+2 and 2×2 image panes now use the same contouring engine as
the single axial view. Previously only the designated axial reference pane
was editable; orthogonal, secondary and fusion panes were navigation displays.
Axial, coronal and sagittal edits are written back to the reference labelmap,
including when viewing a registered secondary image. The secondary images and
registration transforms are unchanged. A complete stroke spanning axial slices
is one undo transaction. Unsupported resampled voxels remain excluded.

Brush, eraser, pencil, polygon, connected threshold, ruler, windowing, pan and
zoom remain available. Shift-click navigates linked crosshairs. Wheel changes
the plane slice; Ctrl-wheel zooms; Shift-wheel changes brush radius. Polygons
can be accepted/cancelled with local buttons or Enter/Escape. Each pane has
its own zoom; the context toolbar targets the last active image pane.

The tools/structures panel and the main 1+2 pane have Detach/Dock controls.
They are browser popup windows sharing the original React session, rather
than independent copies of the patient. Move them to a second monitor using
the operating system. Closing a popup docks its content. Closing/reloading
the main application closes the popups. Popups require browser permission;
the application shows a message if blocked. Changing layout docks the main
pane. Docking recreates the viewport, resetting its presentation zoom; committed
contours remain in the shared session. No automatic saving is introduced.

## 3D smoothing and cleanup

Operations → 3D smoothing and cleanup acts on the selected structure. Source
masks remain unchanged during preview. The default output is a new structure;
replacement requires choosing it explicitly and cannot overwrite a locked ROI.
Apply requires review acknowledgement and is undoable. An empty result cannot
be accepted. Undoing creation also restores a valid active ROI selection.

Methods:

- **Median:** strict binary majority in a physical spherical neighbourhood.
- **Opening:** erosion followed by dilation; removes narrow protrusions.
- **Closing:** dilation followed by erosion; fills small gaps. Original voxels
  at the acquisition boundary are preserved, maintaining extensivity.
- **Component removal:** remove face-connected (6-neighbour) components below
  a chosen volume in cm³. Zero, the default, preserves disconnected structures.
- **Cavity filling:** fill background not connected to the boundary or invalid
  acquisition support. Background uses 26-connectivity so diagonal channels
  remain open. This deliberately avoids treating a 2D enclosed area as a 3D hole.

Physical radius is in mm, not voxel counts or kernel diameter. Thick-slice
acquisitions can have no neighbours along Z at a small radius. All operations
change segmentation geometry and can remove narrow anatomical structures.
Compare the original/result overlay and before/after volumes before accepting.
This is independent per-structure processing, not multi-label topology-preserving
or joint smoothing. Overlaps with other structures are allowed and unchanged.

The worker processes a padded occupied bounding box, uses typed arrays and is
cancelled by termination. The working box is limited to 64 million voxels and
neighbourhoods to 4096 offsets to bound memory/work. No remote service or extra
runtime dependency is involved. Invalid source voxels are not added.

## Sources and method selection

- [3D Slicer Segment Editor, smoothing and islands](https://slicer.readthedocs.io/en/latest/user_guide/modules/segmenteditor.html#smoothing).
  Describes median, opening, closing and component operations. It also notes
  that Gaussian smoothing can shrink segments; Gaussian and joint smoothing
  were therefore not chosen for this initial conservative toolset.
- Pinter C, Lasso A, Fichtinger G. *Polymorph segmentation representation for
  medical image computing*. Computer Methods and Programs in Biomedicine
  171 (2019), 19–26. [DOI](https://doi.org/10.1016/j.cmpb.2019.02.011).

These are methodological references. This implementation does not invoke or
claim numerical equivalence to Slicer or ITK. Both references are accessible
through the upstream documentation; Slicer is credited in About.

## Verification

`tests/volumeCleanup.test.ts` covers physical anisotropy, component sizes,
connected cavities, unsupported support, monotonic opening/closing, plane
write-back and immutability. `tests/multiplanar-editing-browser.mts` uses a
synthetic case and a temporary local library for real pointer gestures in
both layouts, undo, fusion, popup editing/tool synchronization and cleanup.

Validated on Windows/Edge with synthetic data: 103 unit/integration tests;
TypeScript check; production build; multiplanar editing browser flow (including
polygon completion, clearing the active coronal plane, popup fit and temporary
pan key release); and the existing layout/3D lifecycle browser flow. Native
macOS/Linux popup behavior and physical multi-monitor placement were not tested.
