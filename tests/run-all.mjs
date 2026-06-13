// Runs every E2E suite, each in its own process (the bundled @sparticuz/chromium
// needs a fresh browser per block, and isolating suites in separate processes
// keeps it stable). Aggregates exit codes and fails if any suite fails.
//
//   node tests/run-all.mjs                 # all suites (long; ~tens of minutes)
//   node tests/run-all.mjs qa_resume.e2e.mjs  # only the named suite(s)
//   BLOCKS=A-D node tests/run-all.mjs      # chunk: forwarded to each suite
//
// Preview server must be live at :4173 (npm run docs:build && npm run docs:preview).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ALL = [
  'quiz.e2e.mjs',            // main suite (smoke, flow, nav, finish, random, review, etc.)
  'qa_resume.e2e.mjs',       // state persistence / resume
  'qa_scoring.e2e.mjs',      // scoring correctness / choice shuffle / keyboard
  'qa_random_review.e2e.mjs',// random sampling / mock / review
  'qa_global.e2e.mjs',       // routes / dashboard / nav / a11y / mobile / dark / data
]
const suites = process.argv.slice(2).length ? process.argv.slice(2) : ALL

const failed = []
for (const s of suites) {
  process.stdout.write(`\n############################## ${s} ##############################\n`)
  const r = spawnSync(process.execPath, [resolve(here, s)], { stdio: 'inherit', env: process.env })
  if (r.status !== 0) failed.push(s)
}

process.stdout.write(`\n================ E2E ALL: ${suites.length - failed.length}/${suites.length} suites passed ================\n`)
if (failed.length) {
  process.stdout.write(`FAILED suites: ${failed.join(', ')}\n`)
  process.exit(1)
}
