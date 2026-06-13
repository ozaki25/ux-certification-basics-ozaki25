// Minimal block-based test runner.
//
// Each "block" gets a FRESH browser (launched then closed in finally) to keep the
// bundled @sparticuz/chromium stable — it crashes after many contexts in one
// process. Inside a block, use `t.check(name, cond, detail)` to record cases.
//
// Blocks run sequentially. Results aggregate into a coverage table printed at the
// end. Exit code is non-zero if any case FAILed (so CI/local can gate on it),
// but blocks are isolated so one failure does not abort the rest.

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

export async function run() {
  for (const b of blocks) {
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
