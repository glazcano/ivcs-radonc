# IVCS RT

Local DICOM viewing and radiotherapy contouring software. MIT licensed, copyright Gabriel Lazcano. The interface defaults to English and also includes Spanish.

IVCS RT began in Google AI Studio and was developed through "vibe coding" with help from Google AI Studio and Chat GPT 6 Astra. The in-app About section lists dependencies, references and attribution. Revisions are identified by a build-date code (YYYYMMDD), not a semantic application version.

## Features

- Local patient library, flexible patient/series filtering and manual saving.
- Axial contouring, multiplanar views, adjustable 1+2 and 2x2 layouts, and interactive 3D surfaces with transparency and silhouettes.
- Brush, pencil, polygon, interpolation, Boolean operations, margins and Auto Body.
- Rigid 3D registration: manual, anatomical landmarks and experimental local automatic alignment.
- DICOM import, including supported compressed transfer syntaxes and validated headerless Implicit VR Little Endian datasets.
- RTSTRUCT export with contour round-trip checks; DICOM ZIP with originals; advanced ZIP with selected registered series and DICOM REG.

The server binds to `127.0.0.1`. No account, cloud service or personal API key is required. Patient data stays in the local `data/` folder; it is not encrypted. Dependencies are installed from the internet during development setup, not during normal local use.

## Development

Use Node.js 24 and pnpm 11.19.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. For a production build:

```sh
pnpm lint
pnpm build
pnpm start
```

`pnpm start` also defaults to port 3000; stop the development server first. Set the `PORT` environment variable to override the production port. The example environment file contains no secret; the server reads process environment variables directly.

## Tests and synthetic data

The only committed DICOM fixture is `tests/fixtures/synthetic-ct.dcm`, generated from the fictional Luciano Bello demo. No real patient images, patient databases, screenshots or compiled releases belong in this repository.

Before running the complete test suite in a fresh checkout, generate the synthetic test library:

```sh
node --import tsx scripts/releaseDemo.ts
pnpm test
```

The generator writes only to `build/release-common/` and refuses to overwrite an existing nonempty demo library. Run it once per fresh checkout. It is required by the DICOM bundle integration tests. An empty local library can use the application's synthetic demo; to test exports with archived originals, import the generated `build/release-common/demo/Luciano_Bello_SYNTHETIC_DICOM.zip`.

Browser tests are optional and require Playwright and Microsoft Edge. Install Playwright with `pnpm add --save-dev playwright` in a local development checkout, or set `IVCS_PLAYWRIGHT_MODULE` to an existing Playwright module path. Build first, then run, for example:

```sh
node tests/dicom-bundle-browser.mjs
node tests/view-layout-browser.mjs
```

These tests use a temporary copy of the generated synthetic library. Some older browser/release tests require their documented fixture paths or a running local server; they are not part of `pnpm test`.

## Patient data and distribution

Save manually before exiting. Close the local service before copying a portable folder with its `data/` directory. Do not run multiple instances against the same library.

`pnpm portable` is the existing Windows-only local packaging helper. Run `pnpm build` first. It uses the installed Node executable and copies the local `data/` directory when the destination does not already have one: use a clean checkout with no patient data when making a public package. Platform release scripts that reuse `releases/20260909` require those previously prepared runtime folders and are not a complete cross-platform build pipeline from source alone.

The `.gitignore` excludes local data, binaries, archives, screenshots, credentials and build output. These exclusions do not anonymize files deliberately added elsewhere. Use only synthetic examples in issues and pull requests.

## Interoperability and limitations

This project is not clinically validated. Verify contours, registration and exported DICOM in the destination TPS before clinical use. DICOM REG support is required to recover the advanced ZIP's registration; local tests do not establish compatibility with Monaco 6 or any other TPS. No plan or dose is exported. Compressed images are not certified for dose calculation.

The current volume tools require a regular axial grid. Oblique or irregular image geometry may be rejected; generic volume resampling is not implemented. Original pixels and identifiers are retained in ZIP exports.

- [DICOM ZIP and REG export](docs/DICOM_ZIP_20260915.md)
- [Layouts and 3D rendering](docs/VIEWS_3D_20260915.md)
- [DICOM import details](docs/DICOM_FIXES_20260915.md)
- [Registration](docs/REGISTRO_3D.md)
- [Auto Body](docs/AUTO_BODY.md)
- [TPS validation protocol](docs/MONACO_6.md)
- [Translation format](translations/README.md)

## License

[MIT License](LICENSE), copyright Gabriel Lazcano. Third-party libraries retain their own licenses; the build generates `third-party-notices.txt`, also accessible through About. Some unused dependencies inherited from the original prototype remain declared, including the Google SDK; the application does not invoke that SDK or require its credentials.
