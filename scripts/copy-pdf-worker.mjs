// Copies what PDF.js needs at run time into public/pdfjs/, so the review screen
// loads it from the app's own address: the worker, the decoders for scanned
// images (wasm/ — without them fax-style and JBIG2 scans render blank), colour
// profiles, character maps and standard fonts. Runs before `dev` and `build`;
// the copy is not committed.
import { cpSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('pdfjs-dist/package.json'))
const target = 'public/pdfjs'

mkdirSync(target, { recursive: true })
cpSync(join(root, 'build', 'pdf.worker.min.mjs'), join(target, 'pdf.worker.min.mjs'))
for (const folder of ['wasm', 'iccs', 'cmaps', 'standard_fonts']) {
  cpSync(join(root, folder), join(target, folder), { recursive: true })
}
