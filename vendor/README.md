# Browser document libraries

Pinned dependencies are recorded in `tests/package.json` and `tests/package-lock.json`.
These browser distributions are copied without modification from npm packages:

| File | Package | Version | License |
| --- | --- | --- | --- |
| jszip.min.js | jszip | 3.10.2 | MIT / GPLv3; used under MIT |
| docx-preview.min.js | docx-preview | 0.4.1 | Apache-2.0 |
| pdf-lib.min.js | pdf-lib | 1.17.1 | MIT |
| pdf.mjs | pdfjs-dist, build/pdf.min.mjs | 6.3.289 | Apache-2.0 |
| pdf.worker.mjs | pdfjs-dist, build/pdf.worker.min.mjs | 6.3.289 | Apache-2.0 |

Corresponding license files are included here. Serve `.mjs` as JavaScript and allow same-origin module workers. No document contents are sent to a conversion service. The PDF renderer disables eval and WebAssembly; Word preview uses a sandboxed frame with scripts and network access disabled.

Reinstall with `npm ci --prefix tests`, then copy the listed distribution files from `tests/node_modules`. The PDF.js worker and main module must always use the same version. Run `npm test --prefix tests` and visually verify Word/PDF samples after updates.
