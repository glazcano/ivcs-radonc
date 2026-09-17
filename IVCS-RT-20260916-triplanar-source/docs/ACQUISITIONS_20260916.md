# IVCS RT — acquisition and temporal review update, 20260916

This update extends the oblique implementation. It remains entirely local, uses the existing codecs and adds no network service or dependency. Saving contours remains manual. Existing portable release archives are not replaced by this source/build update.

## Import and classification

- Classic single-frame files retain the immediate import path for a single uncompressed volume.
- Temporal position, echo/echo time, diffusion b value/direction, nominal respiratory/cardiac percentage and Enhanced stack identifiers distinguish volumes where those standard attributes are available. Acquisition number/time remain the legacy fallback for repeated positions. Acquisition time alone is not treated as a reliable temporal dimension.
- Constant dimensional metadata does not create a new acquisition key for an ordinary classic volume. Distinct dimensional values split even when their spatial coverage does not overlap.
- Enhanced CT, Enhanced MR and their legacy-converted counterparts read shared and per-frame geometry, rescale, window and dimensional attributes. The import dialog selects volumes within an Enhanced file. Supported compressed multiframe input uses the existing local decoder.
- Original SOP Instance UID plus one-based Referenced Frame Number identify native frames. Working reconstructions have separate deterministic Series/SOP UIDs. Exported derived CT/MR uses single-frame SOP classes and removes Enhanced functional groups. Source references retain frame numbers. Original files are archived unchanged; selecting part of an Enhanced file necessarily retains that entire original file, including its other frames.
- Unsupported or ambiguous dimensions, duplicate positions, inconsistent units, nonparallel planes and malformed geometry are rejected rather than silently collapsed into a volume. This is not a universal implementation of every Enhanced dimension or vendor-private mosaic format.

## Irregular parallel acquisitions

The native sampler brackets each physical point between the actual neighboring parallel planes, samples each plane in its own in-plane origin and interpolates by physical distance. Regular affine stacks retain their established fast sampler.

The smallest positive center separation is the reconstruction's normal-spacing baseline. Intervals larger than `1.5 * baseline + 0.01 mm` are treated conservatively as possible gaps: the intervening region is invalid, with only the bordering acquired planes' limited half-thickness support retained. The header reports irregular spacing and the number of gaps. This rule is a conservative coverage heuristic, not a diagnosis of missing files. No data are invented to repair missing anatomy.

All plane corners participate in the output bounds. Nonparallel acquisitions, duplicate/reversed positions after sorting and inconsistent in-plane dimensions remain errors. The existing 128 Mi-voxel / 4096-per-axis reconstruction limit remains. The original physical geometry is retained for registration. Reconstruction can be cancelled before library registration; the original archive/commit stage is not interrupted midway by this control.

## 4D review

The compact **4D review** button opens a separate dialog:

- Automatically selects labeled phases of the same original series and matching non-temporal dimensions. Separate-series phase sets can be selected manually from images of the same patient/modality; the actual Frame of Reference is checked on load. Selection order defines playback when standard phase labels are absent.
- Phase selector, axial position slider, cine speed, and comparison with the primary image. Images are sampled in the unchanged primary physical coordinate system. No registration is applied to remove respiratory motion.
- Temporal MIP and equally weighted AIP **slice previews**, using only locations covered by every selected phase. These are not generated 3D DICOM datasets and are not offered as dose-calculation exports.
- Opening a phase switches to that study's own contours and save history, retaining window settings and the nearest physical axial position. Unsaved edits use the existing save/discard/cancel guard. Previewing, cine, and scrolling do not save.
- A new ITV candidate can be created from an exactly matching, nonempty ROI name in each selected phase. Current-phase edits can be used in memory; other phases use saved masks. Nearest-neighbor mask sampling preserves phase displacement, creates a separate editable ROI and supports undo. Incompatible coordinates, missing structures, reference gaps and contours extending beyond the reference field are rejected. The result is a review candidate, not deformable propagation or a clinically validated ITV estimator; its voxelization depends on the reference grid.
- Closing the dialog clears its cache; hiding the browser stops playback. At most two phase volumes are cached, with eviction above 256 MiB while retaining at most one oversized current volume. Library opening now loads only the reference image; registration continues to fetch secondary studies on demand. Import still decodes selected volumes before library registration, and compressed Enhanced files are decoded as a whole.

No deformable registration, dose accumulation, phase-based dose calculation or automatic motion correction is introduced.

## Intensity precision and maps

Fractional rescale values and values outside Int16 are stored as Float32 instead of being rounded or wrapped. Float Pixel Data (32-bit) and basic Parametric Map frames are accepted. A single linear Real World Value Mapping with declared units and valid range is supported. Multiple mappings, LUT mappings, a simultaneous nonidentity modality rescale plus real-world map, Float64 input and nonfinite/unmapped values are not interpreted automatically. Units are preserved and shown in the cursor readout; this does not add PET SUV calculation or validate scanner-specific ADC scaling.

MONOCHROME1 is displayed with the correct polarity without inverting measured pixel values. Axial, orthogonal and fusion rendering support fractional intensities, including values outside the old integer LUT range. Portable sessions and local compact storage preserve Float32 values. Native geometry resampling retains Float32 precision when needed.

**Export limitation:** derived DICOM encoding remains signed 16-bit. Export of a reconstructed Float32 map is explicitly refused instead of silently quantizing it. Original files and local contours remain stored. A complete quantitative-map export path, arbitrary VOI LUTs, vendor-private mappings and broader TPS interoperability remain separate work. Existing CT/MR integer reconstructions and their RTSTRUCT/ZIP export are retained.

## Verification

Synthetic tests cover shared/per-frame Enhanced MR geometry and temporal selection, Enhanced CT JPEG-LS decoding, per-frame intensity scaling, original frame references, derived single-frame export, irregular distances and gaps, Float32/units persistence, MIP/AIP coverage and motion-preserving mask union. The prior geometry, codec, library, contour, registration and export tests remain in the suite.

An isolated Edge browser test imports a synthetic Enhanced dataset, selects phases, plays cine, previews MIP/AIP, verifies that no autosave occurred, opens a phase, saves manually and reopens it. No real patient files are used in these tests. Native TPS import and multi-vendor clinical acquisition validation have not been performed for these new paths.

## Reference

[DICOM PS3.3, Common Functional Group Macros](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_c.7.6.16.2.html): shared/per-frame attributes, frame content, temporal dimensions, and real-world value mappings. Spatial reconstruction continues to use the DICOM patient-coordinate geometry described in the oblique implementation document.
