# External acceptance — uncompleted until executed

Record revision, package SHA-256, operating system/architecture, TPS exact build, operator, date and observed result. Do not mark a test passed because its package was generated.

## Native platforms

For Windows x64, macOS arm64/x64 and Linux arm64/x64: extract into a directory containing spaces; start offline; open the synthetic Luciano Bello CT/MR case; inspect three planes and 3D; change a synthetic contour; save explicitly; stop and restart; verify persistence; copy the full folder and reopen; verify only the selected instance stops. Record permissions, browser and macOS quarantine/signing prompts. Test failure to bind an occupied port and a read-only data directory.

## Monaco 6 / destination TPS

Use only the generated synthetic CT/MR and structures for initial testing. Export (1) RTSTRUCT only, (2) DICOM ZIP with originals, (3) advanced ZIP with registered MR and REG, (4) a reconstructed oblique primary plus originals. Include an explicit nonidentity test transform (known translation and rotation) and an identity case.

Import into a dedicated nonclinical test patient. Record which objects are accepted/rejected and full import diagnostics. Confirm PatientID, series, FoR and contour image references, orientation, spacing, slice count, image intensities, contour names/colors/holes and superior/inferior extent. Inspect landmarks in all three planes. For nonidentity REG verify direction with known points, not only visual similarity. Confirm whether the TPS uses REG or ignores it; never assume co-registration survived import. Export back where supported and compare geometry and masks locally.

Record measured discrepancies, pass/fail criteria chosen by your physics team, and sign-off separately. No plan or dose is exported by IVCS RT. Compressed/derived image acceptance is not evidence that an image is suitable for dose calculation.
