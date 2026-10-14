# Viewport annotations — 20261014

## Cause and scope

The editable viewport scales image rows and columns differently to preserve physical spacing. UI annotations were drawn inside that transform with only X zoom compensation. A synthetic coronal plane with 2× masks and 3 mm slice spacing versus 0.375 mm displayed column spacing rendered the intersection marker with approximately 4 px horizontal radius and 32 px vertical radius. The published 20261012-r2 build fails the new regression on this fixture.

Crosshair circles, dashed axes, polygon vertex dots/segments, ruler lines/text and the viewer's VOI border/brackets/tag now use CSS-pixel screen coordinates with their anchors mapped from the existing image transform. The crosshair radius stays 4 CSS pixels and the first polygon vertex radius stays 4.5 CSS pixels under anisotropy, zoom and resizing. Completed ruler measurements now stop following the pointer after release, matching the existing intention to retain the measurement until the next click/clear. Ruler labels stay readable at 11 px; distance calculation still uses original projected-plane spacing. The live pencil preview follows the physical brush radius at the current zoom, matching the screen-space cursor.

Image scaling, source data, masks, plane write-back, measurement coordinates and contour extraction are unchanged. The brush/eraser SVG cursor and already screen-space contour outlines retain their existing behavior. The separate legacy MprOrthogonalView draws its marker after projecting to canvas coordinates, so it does not have this transformed-circle cause. This is a focused review of editing-view overlays, not a claim that every UI artifact has been eliminated.

## Validation

- TypeScript, production build and 123 unit/integration tests.
- Synthetic anisotropic volume: rendered intersection-marker extents are 9–10 bitmap pixels on each axis (subpixel rasterization), with radii about 4 CSS pixels, in individual coronal and sagittal views, 1+2 and 2×2, before/after zoom at device scale factor 2.
- Polygon marker roundness, ruler label aspect/font size, calibrated distance and distance invariance under zoom.
- Existing 2× multiplanar edit/fusion/detached/undo/cleanup browser regression.
- Added browser regression to Windows/macOS/Linux CI. Local UI evidence uses synthetic black-background images so annotation raster pixels can be measured independently of anatomy.

The release packages are unchanged. These fixes require merging and rebuilding a later release.

An additional legacy contour-line raster check produces the same 3 px/2 px red-pixel counts with both the published and patched builds under the local Chromium 151 runtime. Its exact-equality assertion depends on antialiased pixels passing a color threshold; this was not changed or interpreted as an introduced contour-width regression. Cross-platform CI uses its pinned Chromium runtime.
