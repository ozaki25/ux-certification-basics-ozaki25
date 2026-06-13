// Minimal block-based test runner.
//
// ── Block isolation ─────────────────────────────────────────────────────────
// Each "block" gets a FRESH browser (launched then closed in finally) to keep
// the bundled @sparticuz/chromium stable — it crashes after many contexts in
// one process. Inside a block, use `t.check(name, cond, detail)` to record
// cases. Blocks run sequentially; results aggregate into a coverage table at
// the end. Exit code is non-zero if any case FAILed (CI/local can gate on it),
// but blocks are isolated so one failure does not abort the rest.
//
// ── Chunked / partial execution (BLOCKS env var) ────────────────────────────
// Each block name starts with a single letter key (A, B, C … X). Select which
// blocks to run with the BLOCKS environment variable so the suite can be split
// into <10-minute chunks and the whole thing covered across several runs:
//
//   npm run test:e2e                         # all blocks
//   BLOCKS=C,D,O npm run test:e2e            # only blocks C, D, O
//   BLOCKS=A-F npm run test:e2e              # range A..F inclusive
//   BLOCKS=A-D,O,W npm run test:e2e          # mix of ranges and singletons
//   BLOCKS=a,b,c npm run test:e2e            # case-insensitive
//
// Heavy blocks (walk whole chapters / 100-question samples — minutes each):
//   N (re-draw walks 100 Q), F/K/E (walk chapter3), G (walk chapter6, 26 Q),
//   M (random sizes incl. 195 total), W (random-all 195), V (all 6 chapters),
//   A (44 routes), X (12 fresh loads across 6 chapters + 2 random pages).
// Light blocks: B, C, H, L, R, S, T, U, P, Q, O, I, J.
//
// Recommended grouping into ~10-minute chunks (24 blocks A..X):
//   BLOCKS=A-D   (smoke + answer flow + shuffle correctness)        ~ medium
//   BLOCKS=E-H   (navigation + finish + chapter walks)              ~ heavy
//   BLOCKS=I-L   (resume / persistence)                             ~ medium
//   BLOCKS=M-Q   (random + review + top — M/N heavy)                ~ heavy
//   BLOCKS=R-X   (keyboard/robustness/mobile/dark/ssr/random-all/   ~ heavy
//                 shuffle-regression-sweep)
// If a single chunk runs long, split the heavy ones out, e.g.
//   BLOCKS=N         (re-draw alone)
//   BLOCKS=M,W,X     (random-heavy alone)
//   BLOCKS=E,F,G,H   then  BLOCKS=V  separately.
//
// If a selection matches no known block the runner exits non-zero with the list
// of valid keys (guards against typos silently passing).

import { launchBrowser } from './helpers.mjs'

const results = [] // { block, name, ok, detail }

export function makeChecker(blockName) {
  return {
    block: blockName,
    check(name, cond, detail = '') {
      results.push({ block: blockName, name, ok: !!cond, detail: cond ? '' : detail })
      const tag = cond ? 'PASS' : 'FAIL'
      process.stdout.write(`  [${tag}] ${name}${cond ? '' : '  -- ' + detail}\n`)
    },
    info(msg) {
      process.stdout.write(`  · ${msg}\n`)
    },
  }
}

const blocks = []

export function block(name, fn) {
  blocks.push({ name, fn })
}

// Extract the leading token of a block name, up to the first space or dot.
// Handles both single-letter keys ("C. Answer flow" → "C") and multi-char
// prefixes used by the QA suites ("RR-A. Exact totals" → "RR-A").
function blockToken(name) {
  const s = String(name).trim().toUpperCase()
  const i = s.search(/[\s.]/)
  return i === -1 ? s : s.slice(0, i)
}

// Does a block token match any wanted prefix? "RR" matches token "RR-A";
// "RR-A" matches exactly; single letter "A" matches token "A" but not "RR-A".
function tokenMatches(token, want) {
  for (const p of want) {
    if (token === p || token.startsWith(p + '-')) return true
  }
  return false
}

// Parse the BLOCKS env var into a Set of upper-case prefixes. Supports comma
// lists, inclusive single-letter ranges ("A-D,O,W"), and multi-char prefixes
// ("RR", "RR-A", "SC-B"). Returns null when unset/empty → "run everything".
function parseBlockSelection(raw) {
  if (!raw || !raw.trim()) return null
  const want = new Set()
  for (const part of raw.split(',')) {
    const seg = part.trim().toUpperCase()
    if (!seg) continue
    const range = seg.match(/^([A-Z])\s*-\s*([A-Z])$/)
    if (range) {
      let [a, b] = [range[1].charCodeAt(0), range[2].charCodeAt(0)]
      if (a > b) [a, b] = [b, a]
      for (let c = a; c <= b; c++) want.add(String.fromCharCode(c))
    } else {
      // single letter OR a multi-char prefix like RR / RR-A / SC-B
      want.add(seg)
    }
  }
  return want
}

export async function run() {
  const selection = parseBlockSelection(process.env.BLOCKS)
  const allKeys = blocks.map((b) => blockToken(b.name))

  let toRun = blocks
  if (selection) {
    toRun = blocks.filter((b) => tokenMatches(blockToken(b.name), selection))
    if (toRun.length === 0) {
      process.stderr.write(
        `\n[runner] BLOCKS="${process.env.BLOCKS}" matched no blocks.\n` +
          `         Valid block keys: ${allKeys.join(', ')}\n`,
      )
      process.exitCode = 1
      return
    }
    process.stdout.write(
      `\n[runner] Selected blocks (${toRun.length}/${blocks.length}): ` +
        `${toRun.map((b) => blockToken(b.name)).join(', ')}\n`,
    )
  }

  for (const b of toRun) {
    process.stdout.write(`\n=== ${b.name} ===\n`)
    const t = makeChecker(b.name)
    let browser
    try {
      browser = await launchBrowser()
      await b.fn({ t, browser })
    } catch (err) {
      results.push({
        block: b.name,
        name: '(block crashed)',
        ok: false,
        detail: String(err && err.stack ? err.stack : err),
      })
      process.stdout.write(`  [FAIL] (block crashed) -- ${err && err.message}\n`)
    } finally {
      if (browser) {
        try { await browser.close() } catch {}
      }
    }
  }

  // Summary
  const total = results.length
  const failed = results.filter((r) => !r.ok)
  process.stdout.write('\n\n========== SUMMARY ==========\n')
  if (selection) {
    process.stdout.write(`Block selection: BLOCKS=${process.env.BLOCKS} → [${toRun.map((b) => blockToken(b.name)).join(', ')}]\n`)
  }
  process.stdout.write(`Total cases: ${total}\n`)
  process.stdout.write(`Passed: ${total - failed.length}\n`)
  process.stdout.write(`Failed: ${failed.length}\n`)
  if (failed.length) {
    process.stdout.write('\n--- FAILURES ---\n')
    for (const f of failed) {
      process.stdout.write(`  [${f.block}] ${f.name}\n      ${f.detail}\n`)
    }
  }

  // Per-block table
  process.stdout.write('\n--- PER-BLOCK ---\n')
  const byBlock = new Map()
  for (const r of results) {
    if (!byBlock.has(r.block)) byBlock.set(r.block, { pass: 0, fail: 0 })
    const e = byBlock.get(r.block)
    if (r.ok) e.pass++; else e.fail++
  }
  for (const [name, e] of byBlock) {
    process.stdout.write(`  ${e.fail === 0 ? 'OK ' : 'XX '} ${name}: ${e.pass} pass / ${e.fail} fail\n`)
  }

  process.exitCode = failed.length > 0 ? 1 : 0
}
