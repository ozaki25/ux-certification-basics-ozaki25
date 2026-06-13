// Shared E2E helpers for the UX検定基礎 drill suite.
//
// ── Browser launch ────────────────────────────────────────────────────────
// 依存は `playwright-core`（インストール時にブラウザを外部DLしない）+
// `@sparticuz/chromium`（npmパッケージにchromiumバイナリを同梱）。この2つだけで
// `npm ci` 後すぐ `npm run test:e2e` が動き、ドキュメントCIにブラウザDLの負荷を
// 持ち込まない。resolveExecutablePath は、システムにPlaywrightブラウザがあれば
// それを優先し、無ければ同梱chromium（/tmp/chromium に展開）にフォールバックする。
//
// playwright-core は CJS なので default を import して `.chromium` を読む
// （named import 不可）。@playwright/test ランナーはブラウザDL前提のため使わない。
//
// 同梱chromiumは1プロセスで newContext() を多数作るとクラッシュするため、
// runner は *テストブロックごとに fresh browser を launch→finallyでclose* する。
// helpers 側はグローバルなブラウザ状態を持たない。

import pwpkg from '../node_modules/playwright-core/index.js'
const chromium = pwpkg.chromium

const BASE = process.env.E2E_BASE || 'http://localhost:4173'

async function resolveExecutablePath() {
  // 1) Prefer a normally-installed Playwright browser if present.
  try {
    const p = chromium.executablePath()
    if (p) {
      const { existsSync } = await import('fs')
      if (existsSync(p)) return { executablePath: p, extraArgs: [] }
    }
  } catch {
    /* not installed — fall through to sparticuz */
  }
  // 2) Fall back to the bundled @sparticuz/chromium.
  const sparticuz = (await import('../node_modules/@sparticuz/chromium/build/index.js')).default
  const execPath = await sparticuz.executablePath()
  return { executablePath: execPath, extraArgs: sparticuz.args }
}

export async function launchBrowser() {
  const { executablePath, extraArgs } = await resolveExecutablePath()
  return chromium.launch({
    executablePath,
    args: [...extraArgs, '--no-sandbox'],
    headless: true,
  })
}

// Create a page that records console errors, page errors and bad network
// responses. The benign Vercel analytics 404s are filtered out (they only exist
// on Vercel prod; theme code is try/catch wrapped).
const BENIGN_404 = [
  '/_vercel/insights/script.js',
  '/_vercel/speed-insights/script.js',
]

function isBenign(url) {
  return BENIGN_404.some((b) => url.includes(b))
}

export async function newInstrumentedPage(browser, { viewport } = {}) {
  const context = await browser.newContext(
    viewport ? { viewport } : undefined,
  )
  const page = await context.newPage()
  const errors = {
    pageErrors: [],      // uncaught JS exceptions
    consoleErrors: [],   // console.error / console.warning (hydration etc.)
    badResponses: [],    // non-benign 4xx/5xx
    failedRequests: [],  // network failures (non-benign)
  }
  page.on('pageerror', (err) => {
    errors.pageErrors.push(String(err && err.message ? err.message : err))
  })
  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()
    const loc = msg.location && msg.location()
    const locUrl = loc && loc.url ? loc.url : ''
    if (type === 'error') {
      // "Failed to load resource: ... 404" surfaces as a console error whose
      // *text* has no URL; the URL lives in msg.location(). The only 404s on a
      // correctly-served preview build are the benign Vercel analytics scripts,
      // so filter resource-load errors by their location URL.
      if (/Failed to load resource/i.test(text)) {
        if (isBenign(locUrl)) return
        // Any other resource 404/5xx is a real issue; the `response` listener
        // already captures it with the URL, so don't double-count here.
        return
      }
      if (isBenign(text) || isBenign(locUrl)) return
      errors.consoleErrors.push(text + (locUrl ? ` @ ${locUrl}` : ''))
    } else if (type === 'warning') {
      // Surface Vue hydration mismatch warnings as real issues.
      if (/hydrat/i.test(text) || /mismatch/i.test(text)) {
        errors.consoleErrors.push('[warning] ' + text)
      }
    }
  })
  page.on('response', (resp) => {
    const status = resp.status()
    const url = resp.url()
    if (status >= 400 && !isBenign(url)) {
      errors.badResponses.push(`${status} ${url}`)
    }
  })
  page.on('requestfailed', (req) => {
    const url = req.url()
    if (!isBenign(url)) errors.failedRequests.push(`${req.failure()?.errorText} ${url}`)
  })
  return { page, context, errors }
}

function isBenignText(text) {
  return BENIGN_404.some((b) => text.includes(b))
}

export function summarizeErrors(errors) {
  const parts = []
  if (errors.pageErrors.length) parts.push(`pageErrors=${JSON.stringify(errors.pageErrors)}`)
  if (errors.consoleErrors.length) parts.push(`consoleErrors=${JSON.stringify(errors.consoleErrors)}`)
  if (errors.badResponses.length) parts.push(`badResponses=${JSON.stringify(errors.badResponses)}`)
  if (errors.failedRequests.length) parts.push(`failedRequests=${JSON.stringify(errors.failedRequests)}`)
  return parts.join(' | ')
}

export function hasErrors(errors) {
  return (
    errors.pageErrors.length > 0 ||
    errors.consoleErrors.length > 0 ||
    errors.badResponses.length > 0 ||
    errors.failedRequests.length > 0
  )
}

export const BASE_URL = BASE

export function url(path) {
  return BASE + path
}

// Clear all client-side state on the current origin.
export async function clearStorage(page) {
  await page.evaluate(() => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}
  })
}

// Wait for the quiz card to be ready (or finish screen).
export async function waitQuiz(page) {
  await page.waitForSelector('.quiz-card, .quiz-finish', { timeout: 15000 })
}
