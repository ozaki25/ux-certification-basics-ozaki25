// ============================================================================
// UX検定基礎 — GLOBAL QA E2E suite (routes / dashboard / nav / a11y / mobile /
// dark / data integrity). Owner: senior QA (global health).
//
// HOW TO RUN
//   node tests/qa_global.e2e.mjs                 # all GL- blocks
//   BLOCKS=GL-A node tests/qa_global.e2e.mjs     # one block (use the leading
//                                                  letter; runner keys on the
//                                                  FIRST letter of the name, so
//                                                  block names embed the key as
//                                                  "X. GL-... " — see below)
//
// NOTE on BLOCKS keying: runner.mjs keys a block on the FIRST alpha char of its
//   name. To keep the GL- prefix *and* stay selectable, every block name is
//   "<KEY>. GL-<topic>" (e.g. "A. GL-routes"). Select with BLOCKS=A,B,...
//
// PRECONDITION: preview build served at http://localhost:4173 (do NOT restart).
//
// DESIGN
//   - Raw Playwright (not @playwright/test). One fresh browser per block.
//   - Ground-truth quiz data loaded from docs/quiz/data/*.ts so dashboard /
//     difficulty / count assertions compare against the real source.
//   - Product source is NEVER edited; bugs are reported only.
// ============================================================================

import { readFileSync } from 'fs'
import { block, run } from './runner.mjs'
import {
  newInstrumentedPage,
  summarizeErrors,
  hasErrors,
  url,
  clearStorage,
  waitQuiz,
} from './helpers.mjs'

// ── Ground-truth quiz data ──────────────────────────────────────────────────
function loadChapter(n) {
  let src = readFileSync(new URL(`../docs/quiz/data/chapter${n}.ts`, import.meta.url), 'utf8')
  src = src.replace(/^import .*$/gm, '')
  src = src.replace(/export const chapter\d+\s*:\s*Quiz\[\]\s*=\s*/, 'return ')
  return new Function(src + '\n')()
}
const BY_CHAPTER = {}
let ALL = []
for (let n = 1; n <= 6; n++) {
  BY_CHAPTER[n] = loadChapter(n)
  ALL = ALL.concat(BY_CHAPTER[n])
}
const BY_ID = new Map(ALL.map((q) => [q.id, q]))

function diffCounts(arr) {
  return {
    easy: arr.filter((q) => q.difficulty === 'easy').length,
    normal: arr.filter((q) => q.difficulty === 'normal').length,
    hard: arr.filter((q) => q.difficulty === 'hard').length,
  }
}
const CH_TOTAL = {}
const CH_DIFF = {}
for (let n = 1; n <= 6; n++) {
  CH_TOTAL[n] = BY_CHAPTER[n].length
  CH_DIFF[n] = diffCounts(BY_CHAPTER[n])
}
const TOTAL = ALL.length

const CH_TITLES = {
  1: 'UXインテリジェンスの理念',
  2: 'UX関連基礎知識',
  3: 'UXプロジェクト計画',
  4: 'ユーザー理解',
  5: 'ユーザー要求定義と具現化',
  6: 'UXデザイン評価・運用・組織化',
}

const STORAGE_KEY = 'quiz-answers'

// ── helpers ─────────────────────────────────────────────────────────────────

// Build a localStorage answers map for given quizzes. `mode`:
//   'correct' / 'wrong' or a fn(q,i)->bool. ts increases so continue-banner is
//   deterministic (later entries = more recent).
function buildAnswers(quizzes, mode) {
  const out = {}
  let ts = 1000
  quizzes.forEach((q, i) => {
    let correct
    if (typeof mode === 'function') correct = mode(q, i)
    else correct = mode === 'correct'
    out[q.id] = { correct, ts: ts++, selectedIndex: correct ? q.answer : (q.answer + 1) % 4 }
  })
  return out
}

// Seed localStorage on the origin then reload so the Vue app reads it onMounted.
async function seedAnswers(page, answersObj) {
  // must be on the origin first
  await page.goto(url('/quiz/'), { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([key, val]) => {
      localStorage.setItem(key, JSON.stringify(val))
    },
    [STORAGE_KEY, answersObj],
  )
}

async function gotoClean(page, path) {
  await page.goto(url(path), { waitUntil: 'networkidle' })
}

function errDetail(label, errors) {
  return `${label}: ${summarizeErrors(errors)}`
}

// All routes per spec.
const ROUTES = [
  '/',
  '/quiz/',
  ...[1, 2, 3, 4, 5, 6].map((n) => `/quiz/chapter${n}/`),
  '/quiz/random-5/',
  '/quiz/random-10/',
  '/quiz/random-100/',
  '/quiz/random/',
  '/quiz/review/',
  ...Array.from({ length: 31 }, (_, i) => `/lessons/lesson${String(i + 1).padStart(2, '0')}/`),
]

// ════════════════════════════════════════════════════════════════════════════
// A. GL-routes — every route loads clean (200, no JS/console/4xx/hydration)
// ════════════════════════════════════════════════════════════════════════════
block('A. GL-routes all-clean', async ({ t, browser }) => {
  // Reuse ONE instrumented page across all routes — the bundled chromium
  // crashes after many newContext() calls in one process (see runner.mjs).
  // Track per-route error counts by snapshotting lengths before each navigation
  // so a new error on route N is attributed to route N (diff judgment).
  const { page, context, errors } = await newInstrumentedPage(browser)
  function snapshot() {
    return {
      pe: errors.pageErrors.length,
      ce: errors.consoleErrors.length,
      br: errors.badResponses.length,
      fr: errors.failedRequests.length,
    }
  }
  function deltaSince(s) {
    const parts = []
    if (errors.pageErrors.length > s.pe) parts.push(`pageErrors=${JSON.stringify(errors.pageErrors.slice(s.pe))}`)
    if (errors.consoleErrors.length > s.ce) parts.push(`consoleErrors=${JSON.stringify(errors.consoleErrors.slice(s.ce))}`)
    if (errors.badResponses.length > s.br) parts.push(`badResponses=${JSON.stringify(errors.badResponses.slice(s.br))}`)
    if (errors.failedRequests.length > s.fr) parts.push(`failedRequests=${JSON.stringify(errors.failedRequests.slice(s.fr))}`)
    return parts.join(' | ')
  }
  try {
    for (const path of ROUTES) {
      const before = snapshot()
      let status = 0
      try {
        const resp = await page.goto(url(path), { waitUntil: 'networkidle' })
        status = resp ? resp.status() : 0
        if (path.startsWith('/quiz/') && path !== '/quiz/') {
          await page.waitForSelector('.quiz-card, .quiz-finish, .review-empty, .quiz-page', { timeout: 15000 }).catch(() => {})
        }
      } catch (e) {
        t.check(`${path} loaded`, false, String(e && e.message))
        continue
      }
      t.check(`${path} → 200`, status === 200, `status=${status}`)
      const d = deltaSince(before)
      t.check(`${path} no NEW errors`, d === '', `${path} ${d}`)
    }
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// B. GL-404 — unknown path serves the 404 page (clean) and is not a 200 ghost
// ════════════════════════════════════════════════════════════════════════════
block('B. GL-404 unknown path', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    const resp = await page.goto(url('/this/does/not/exist-xyz/'), { waitUntil: 'networkidle' })
    const status = resp ? resp.status() : 0
    t.check('unknown path returns 404 status', status === 404, `status=${status}`)
    const bodyText = (await page.textContent('body')) || ''
    const looks404 = /404|PAGE NOT FOUND|not be found|見つかりません/i.test(bodyText)
    t.check('unknown path shows 404 content', looks404, bodyText.slice(0, 120))
    // The benign-filter should leave only the page's own 404 doc response; the
    // page itself must not throw JS exceptions.
    t.check('404 page no JS exceptions', errors.pageErrors.length === 0, JSON.stringify(errors.pageErrors))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// C. GL-dashboard-empty — top dashboard in the unanswered state
// ════════════════════════════════════════════════════════════════════════════
block('C. GL-dashboard empty state', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    await page.goto(url('/quiz/'), { waitUntil: 'domcontentloaded' })
    await clearStorage(page)
    await gotoClean(page, '/quiz/')
    await page.waitForSelector('.quiz-top-summary', { timeout: 15000 })

    const answered = (await page.textContent('.summary-item .summary-value')) || ''
    t.check('answered shows 0 / TOTAL', answered.replace(/\s/g, '') === `0/${TOTAL}`, `got="${answered.trim()}" expected 0 / ${TOTAL}`)

    // rate is third summary-item
    const rate = (await page.$$eval('.summary-item .summary-value', (els) => els.map((e) => e.textContent.trim())))
    t.check('rate is 0%', rate.some((r) => r.replace(/\s/g, '') === '0%'), JSON.stringify(rate))

    const hasContinue = await page.$('.continue-banner')
    t.check('no continue-banner when empty', hasContinue === null, 'continue-banner present')

    const hasReviewBanner = await page.$('.review-banner')
    t.check('no review-banner when empty', hasReviewBanner === null, 'review-banner present')

    // review CTA in disabled form
    const reviewDisabled = await page.$('.btn-review-disabled')
    t.check('review CTA disabled when empty', reviewDisabled !== null, 'expected btn-review-disabled')

    // reset button hidden when nothing answered
    const resetBtn = await page.$('.btn-reset-progress')
    t.check('reset hidden when empty', resetBtn === null, 'reset button present unexpectedly')

    // streak feature removed
    const streak = await page.$('.summary-item-streak')
    t.check('no streak summary item', streak === null, 'streak item present')
    const bodyText = (await page.textContent('.quiz-top')) || ''
    t.check('no "連続学習" text', !bodyText.includes('連続学習'), 'found 連続学習')

    t.check('empty dashboard no errors', !hasErrors(errors), errDetail('dashboard-empty', errors))
  } catch (e) {
    t.check('dashboard empty block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// D. GL-dashboard-answered — partial answers: totals, rate, chapter progress,
//    continue-banner points at most-recent chapter, review CTA when wrong>0
// ════════════════════════════════════════════════════════════════════════════
block('D. GL-dashboard answered state', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    // Answer chapter1 first 5 (3 correct, 2 wrong), then chapter4 first 3 all
    // correct LATER (higher ts) → continue-banner should point at chapter4.
    const ch1 = BY_CHAPTER[1].slice(0, 5)
    const ch4 = BY_CHAPTER[4].slice(0, 3)
    const answers = {}
    let ts = 1000
    ch1.forEach((q, i) => {
      const correct = i < 3
      answers[q.id] = { correct, ts: ts++, selectedIndex: correct ? q.answer : (q.answer + 1) % 4 }
    })
    ch4.forEach((q) => {
      answers[q.id] = { correct: true, ts: ts++, selectedIndex: q.answer }
    })
    const totalAnswered = ch1.length + ch4.length // 8
    const totalCorrect = 3 + 3 // 6
    const expectedRate = Math.round((totalCorrect / totalAnswered) * 100)

    await seedAnswers(page, answers)
    await gotoClean(page, '/quiz/')
    await page.waitForSelector('.quiz-top-summary', { timeout: 15000 })

    const summaryVals = await page.$$eval('.summary-item .summary-value', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()))
    t.check('answered = 8 / TOTAL', summaryVals[0].replace(/\s/g, '') === `${totalAnswered}/${TOTAL}`, JSON.stringify(summaryVals))
    t.check('rate matches', summaryVals.some((v) => v.replace(/\s/g, '') === `${expectedRate}%`), `expected ${expectedRate}% in ${JSON.stringify(summaryVals)}`)

    // continue-banner present and points to chapter4
    const banner = await page.$('.continue-banner')
    t.check('continue-banner present', banner !== null, 'missing continue-banner')
    if (banner) {
      const href = await banner.getAttribute('href')
      t.check('continue-banner → chapter4 (most recent)', href === '/quiz/chapter4/', `href=${href}`)
      const title = (await page.textContent('.continue-banner-title')) || ''
      t.check('continue-banner title = ch4 title', title.trim() === CH_TITLES[4], `title="${title.trim()}"`)
    }

    // review banner + CTA present (2 wrong)
    const reviewBanner = await page.$('.review-banner')
    t.check('review-banner present (wrong>0)', reviewBanner !== null, 'missing review-banner')
    const reviewBannerText = (await page.textContent('.review-banner-text')) || ''
    t.check('review-banner count = 2', /2\s*問/.test(reviewBannerText), `text="${reviewBannerText.trim()}"`)
    const reviewCta = await page.$('.btn-review:not(.btn-review-disabled)')
    t.check('review CTA enabled', reviewCta !== null, 'enabled review CTA missing')

    // chapter cards: ch1 progress 5/32, ch4 progress 3/26, others 0
    const cards = await page.$$eval('.chapter-card', (els) =>
      els.map((el) => ({
        href: el.getAttribute('href'),
        stats: (el.querySelector('.chapter-stats')?.textContent || '').replace(/\s+/g, ' ').trim(),
        wrong: el.querySelector('.chapter-wrong')?.textContent?.trim() || null,
      })),
    )
    const card1 = cards.find((c) => c.href === '/quiz/chapter1/')
    const card4 = cards.find((c) => c.href === '/quiz/chapter4/')
    const card2 = cards.find((c) => c.href === '/quiz/chapter2/')
    t.check('ch1 card shows 5 / 32', card1 && card1.stats.includes(`5 / ${CH_TOTAL[1]}`), JSON.stringify(card1))
    t.check('ch1 card shows 要復習 2', card1 && /要復習\s*2/.test(card1.wrong || ''), JSON.stringify(card1))
    t.check('ch4 card shows 3 / 26', card4 && card4.stats.includes(`3 / ${CH_TOTAL[4]}`), JSON.stringify(card4))
    t.check('ch2 card shows 0 / 60', card2 && card2.stats.includes(`0 / ${CH_TOTAL[2]}`), JSON.stringify(card2))

    // reset button now visible
    t.check('reset button visible when answered', (await page.$('.btn-reset-progress')) !== null, 'reset missing')

    t.check('answered dashboard no errors', !hasErrors(errors), errDetail('dashboard-answered', errors))
  } catch (e) {
    t.check('dashboard answered block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// E. GL-data-integrity — chapter cards' counts & difficulty match source data
// ════════════════════════════════════════════════════════════════════════════
block('E. GL-data integrity counts', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    await gotoClean(page, '/quiz/')
    await page.waitForSelector('.chapter-card', { timeout: 15000 })

    const cards = await page.$$eval('.chapter-card', (els) =>
      els.map((el) => ({
        href: el.getAttribute('href'),
        stats: (el.querySelector('.chapter-stats')?.textContent || '').replace(/\s+/g, ' ').trim(),
        easy: el.querySelector('.diff-easy')?.textContent?.replace(/\D/g, '') || '',
        normal: el.querySelector('.diff-normal')?.textContent?.replace(/\D/g, '') || '',
        hard: el.querySelector('.diff-hard')?.textContent?.replace(/\D/g, '') || '',
      })),
    )
    t.check('6 chapter cards', cards.length === 6, `got ${cards.length}`)

    let sumTotal = 0
    for (let n = 1; n <= 6; n++) {
      const card = cards.find((c) => c.href === `/quiz/chapter${n}/`)
      if (!card) {
        t.check(`ch${n} card present`, false, 'missing')
        continue
      }
      t.check(`ch${n} total = ${CH_TOTAL[n]}`, card.stats.includes(`/ ${CH_TOTAL[n]}`), `stats="${card.stats}"`)
      t.check(
        `ch${n} difficulty easy/normal/hard`,
        Number(card.easy) === CH_DIFF[n].easy &&
          Number(card.normal) === CH_DIFF[n].normal &&
          Number(card.hard) === CH_DIFF[n].hard,
        `got e${card.easy}/n${card.normal}/h${card.hard} expected e${CH_DIFF[n].easy}/n${CH_DIFF[n].normal}/h${CH_DIFF[n].hard}`,
      )
      // per-chapter difficulty sum == total
      t.check(
        `ch${n} difficulty sums to total`,
        Number(card.easy) + Number(card.normal) + Number(card.hard) === CH_TOTAL[n],
        `e+n+h=${Number(card.easy) + Number(card.normal) + Number(card.hard)} vs ${CH_TOTAL[n]}`,
      )
      sumTotal += CH_TOTAL[n]
    }
    t.check('chapter totals sum to 195', sumTotal === 195 && TOTAL === 195, `sum=${sumTotal} TOTAL=${TOTAL}`)

    // The "全 N 問から" random button reflects TOTAL.
    const allBtn = (await page.textContent('.quiz-top-actions .btn-action:last-child')) || ''
    t.check('random-all button shows 195', allBtn.includes('195'), `btn="${allBtn.trim()}"`)

    t.check('data-integrity no errors', !hasErrors(errors), errDetail('data-integrity', errors))
  } catch (e) {
    t.check('data integrity block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// F. GL-nav-boundaries — chapter drill prev/next boundaries
// ════════════════════════════════════════════════════════════════════════════
block('F. GL-nav boundaries', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    await page.goto(url('/quiz/chapter3/'), { waitUntil: 'domcontentloaded' })
    await clearStorage(page)
    // clear session too so no resume
    await page.evaluate(() => sessionStorage.clear())
    await gotoClean(page, '/quiz/chapter3/')
    await waitQuiz(page)

    // Q1: no prev button
    t.check('Q1 has no btn-prev', (await page.$('.btn-prev')) === null, 'btn-prev present on Q1')

    // next disabled before answering
    const nextDisabledBefore = await page.$eval('.btn-next', (b) => b.disabled)
    t.check('next disabled before answering', nextDisabledBefore === true, 'next not disabled')

    // answer Q1 (click first choice), next becomes enabled
    await page.$$('.quiz-choices button').then((b) => b[0].click())
    await page.waitForSelector('.quiz-result', { timeout: 5000 })
    const nextEnabled = await page.$eval('.btn-next', (b) => b.disabled)
    t.check('next enabled after answering', nextEnabled === false, 'next still disabled')

    // go to Q2 → prev appears
    await page.click('.btn-next')
    await page.waitForSelector('.btn-prev', { timeout: 5000 })
    t.check('Q2 has btn-prev', (await page.$('.btn-prev')) !== null, 'btn-prev missing on Q2')

    // prev back to Q1, then forward again (round-trip)
    await page.click('.btn-prev')
    await page.waitForFunction(() => document.querySelector('.quiz-num')?.textContent?.trim().startsWith('1 /'), { timeout: 5000 })
    t.check('prev returns to Q1', true, '')

    // Walk to last question; on last, next label = 結果を見る
    const total = CH_TOTAL[3]
    // answer Q1 again is already answered; navigate forward answering each
    // restart from index 0: ensure each answered then advance
    for (let i = 0; i < total; i++) {
      // ensure current answered
      const isAnswered = await page.$('.quiz-result')
      if (!isAnswered) {
        await page.$$('.quiz-choices button').then((b) => b[0].click())
        await page.waitForSelector('.quiz-result', { timeout: 5000 })
      }
      const label = (await page.textContent('.btn-next')) || ''
      if (i === total - 1) {
        t.check('last question next label = 結果を見る', label.trim() === '結果を見る', `label="${label.trim()}"`)
      }
      await page.click('.btn-next')
      if (i < total - 1) {
        await page.waitForFunction(
          (n) => document.querySelector('.quiz-num')?.textContent?.includes(`${n} /`),
          i + 2,
          { timeout: 5000 },
        ).catch(() => {})
      }
    }
    await page.waitForSelector('.quiz-finish', { timeout: 5000 })
    t.check('reaching end shows finish screen', (await page.$('.quiz-finish')) !== null, 'no finish screen')

    t.check('nav boundaries no errors', !hasErrors(errors), errDetail('nav-boundaries', errors))
  } catch (e) {
    t.check('nav boundaries block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// G. GL-mobile — mobile viewport renders without JS errors / horizontal overflow
// ════════════════════════════════════════════════════════════════════════════
block('G. GL-mobile viewport', async ({ t, browser }) => {
  // ONE mobile context reused across pages (bundled chromium crashes if a block
  // opens/closes many contexts). Per-page error attribution via delta snapshot.
  const viewport = { width: 375, height: 667 }
  const pages = ['/quiz/', '/quiz/chapter1/', '/quiz/random-5/', '/quiz/review/', '/lessons/lesson06/']
  const { page, context, errors } = await newInstrumentedPage(browser, { viewport })
  let baseline = { pe: 0, ce: 0, br: 0, fr: 0 }
  function newErr() {
    const has =
      errors.pageErrors.length > baseline.pe ||
      errors.consoleErrors.length > baseline.ce ||
      errors.badResponses.length > baseline.br ||
      errors.failedRequests.length > baseline.fr
    baseline = { pe: errors.pageErrors.length, ce: errors.consoleErrors.length, br: errors.badResponses.length, fr: errors.failedRequests.length }
    return has
  }
  try {
    for (const path of pages) {
      try {
        await page.goto(url(path), { waitUntil: 'networkidle' })
        if (path.startsWith('/quiz/') && path !== '/quiz/') {
          await page.waitForSelector('.quiz-card, .quiz-finish, .review-empty, .quiz-page', { timeout: 15000 }).catch(() => {})
        }
        const widths = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
        }))
        const overflow = widths.scrollW - widths.innerW
        t.check(`${path} no horizontal overflow`, overflow <= 5, `scrollW=${widths.scrollW} innerW=${widths.innerW} overflow=${overflow}`)
        t.check(`${path} mobile no NEW errors`, !newErr(), errDetail(`mobile ${path}`, errors))
      } catch (e) {
        t.check(`${path} mobile render`, false, String(e && e.message))
      }
    }
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// H. GL-dark — dark mode does not break main pages / drills
// ════════════════════════════════════════════════════════════════════════════
block('H. GL-dark mode', async ({ t, browser }) => {
  const pages = [
    { path: '/quiz/', sel: '.quiz-top-summary' },
    { path: '/quiz/chapter1/', sel: '.quiz-card' },
    { path: '/quiz/random-10/', sel: '.quiz-card' },
    { path: '/lessons/lesson01/', sel: 'main' },
  ]
  // ONE context reused. Set dark mode once via localStorage on the origin.
  const { page, context, errors } = await newInstrumentedPage(browser)
  let baseline = { pe: 0, ce: 0, br: 0, fr: 0 }
  function newErr() {
    const has =
      errors.pageErrors.length > baseline.pe ||
      errors.consoleErrors.length > baseline.ce ||
      errors.badResponses.length > baseline.br ||
      errors.failedRequests.length > baseline.fr
    baseline = { pe: errors.pageErrors.length, ce: errors.consoleErrors.length, br: errors.badResponses.length, fr: errors.failedRequests.length }
    return has
  }
  try {
    await page.goto(url('/quiz/'), { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.setItem('vitepress-theme-appearance', 'dark'))
    newErr() // reset baseline after setup nav
    for (const { path, sel } of pages) {
      try {
        await page.goto(url(path), { waitUntil: 'networkidle' })
        await page.waitForSelector(sel, { timeout: 15000 })
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        t.check(`${path} html.dark applied`, isDark, 'dark class not applied')
        const visible = await page.$eval(sel, (el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        t.check(`${path} main element visible in dark`, visible, `${sel} not visible`)
        t.check(`${path} dark no NEW errors`, !newErr(), errDetail(`dark ${path}`, errors))
      } catch (e) {
        t.check(`${path} dark render`, false, String(e && e.message))
      }
    }
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// I. GL-a11y — accessibility spot checks on a drill card
// ════════════════════════════════════════════════════════════════════════════
block('I. GL-a11y spot checks', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    await gotoClean(page, '/quiz/chapter1/')
    await waitQuiz(page)

    // choices are <button> inside ol.quiz-choices with aria-label
    const choicesAria = await page.$eval('.quiz-choices', (el) => el.getAttribute('aria-label'))
    t.check('.quiz-choices has aria-label', !!choicesAria, `aria-label="${choicesAria}"`)

    const allButtons = await page.$$eval('.quiz-choices li > button', (btns) => ({
      count: btns.length,
      allButton: btns.every((b) => b.tagName === 'BUTTON'),
      allTyped: btns.every((b) => b.getAttribute('type') === 'button'),
    }))
    t.check('4 choice buttons', allButtons.count === 4, `count=${allButtons.count}`)
    t.check('choices are <button>', allButtons.allButton, 'non-button choice')
    t.check('choice buttons have type=button', allButtons.allTyped, 'missing type=button')

    // progressbar role with aria-* on the drill progress
    const pb = await page.$eval('[role="progressbar"]', (el) => ({
      min: el.getAttribute('aria-valuemin'),
      now: el.getAttribute('aria-valuenow'),
      max: el.getAttribute('aria-valuemax'),
    }))
    t.check('progressbar has aria-valuemin/now/max', pb.min != null && pb.now != null && pb.max != null, JSON.stringify(pb))
    t.check('progressbar max = chapter total', Number(pb.max) === CH_TOTAL[1], `max=${pb.max} expected ${CH_TOTAL[1]}`)

    // next/prev buttons typed
    const nextType = await page.$eval('.btn-next', (b) => b.getAttribute('type'))
    t.check('btn-next has type=button', nextType === 'button', `type=${nextType}`)

    t.check('a11y spot checks no errors', !hasErrors(errors), errDetail('a11y', errors))
  } catch (e) {
    t.check('a11y block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// J. GL-a11y-images — lesson images carry meaningful alt (no empty/"図" alt)
// ════════════════════════════════════════════════════════════════════════════
block('J. GL-a11y lesson images', async ({ t, browser }) => {
  // Check a sample of lessons known to use SVG diagrams + a sweep for empty alt.
  const sample = ['/lessons/lesson06/', '/lessons/lesson07/', '/lessons/lesson14/', '/lessons/lesson01/']
  let totalImgs = 0
  let badAlt = []
  // ONE context reused across lessons.
  const { page, context, errors } = await newInstrumentedPage(browser)
  let baseline = { pe: 0, ce: 0, br: 0, fr: 0 }
  function newErr() {
    const has =
      errors.pageErrors.length > baseline.pe ||
      errors.consoleErrors.length > baseline.ce ||
      errors.badResponses.length > baseline.br ||
      errors.failedRequests.length > baseline.fr
    baseline = { pe: errors.pageErrors.length, ce: errors.consoleErrors.length, br: errors.badResponses.length, fr: errors.failedRequests.length }
    return has
  }
  try {
    for (const path of sample) {
      try {
        await page.goto(url(path), { waitUntil: 'networkidle' })
        const imgs = await page.$$eval('main img', (els) =>
          els.map((e) => ({ src: e.getAttribute('src') || '', alt: e.getAttribute('alt') })),
        )
        for (const im of imgs) {
          totalImgs++
          const alt = (im.alt || '').trim()
          if (!alt || alt === '図' || alt === 'image' || alt === 'img') {
            badAlt.push(`${path} ${im.src} alt="${im.alt}"`)
          }
        }
        t.check(`${path} no NEW errors`, !newErr(), errDetail(path, errors))
      } catch (e) {
        t.check(`${path} image scan`, false, String(e && e.message))
      }
    }
    // Mermaid diagrams should render to inline <svg> (not raw ```mermaid``` text
    // or an error). lesson07 uses Mermaid; verify the page produced an <svg>.
    try {
      await page.goto(url('/lessons/lesson07/'), { waitUntil: 'networkidle' })
      await page.waitForSelector('main svg, .mermaid svg', { timeout: 15000 }).catch(() => {})
      const svgCount = await page.$$eval('main svg', (els) => els.length)
      t.check('lesson07 Mermaid rendered to <svg>', svgCount > 0, `svg count=${svgCount}`)
      const bodyText = (await page.textContent('main')) || ''
      t.check('lesson07 no raw mermaid syntax leaked', !/graph (TD|LR)\b/.test(bodyText) || svgCount > 0, 'raw mermaid source visible')
    } catch (e) {
      t.check('lesson07 mermaid render', false, String(e && e.message))
    }
  } finally {
    await context.close()
  }
  t.check(`lesson <img> alt all meaningful (${totalImgs} imgs; SVG diagrams are inline Mermaid)`, badAlt.length === 0, badAlt.join(' | '))
})

// ════════════════════════════════════════════════════════════════════════════
// K. GL-reset — progress reset from top clears all state
// ════════════════════════════════════════════════════════════════════════════
block('K. GL-reset progress', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    // seed some answers (incl. wrong → review banner)
    const seed = buildAnswers(BY_CHAPTER[1].slice(0, 4), (q, i) => i % 2 === 0)
    await seedAnswers(page, seed)
    await gotoClean(page, '/quiz/')
    await page.waitForSelector('.quiz-top-summary', { timeout: 15000 })

    // sanity: there is progress + reset button
    const beforeReset = await page.$('.btn-reset-progress')
    t.check('reset button present before reset', beforeReset !== null, 'no reset button to click')

    // auto-accept the confirm() dialog
    page.on('dialog', (d) => d.accept())
    await page.click('.btn-reset-progress')

    // after reset, summary returns to 0 / TOTAL and banners gone
    await page.waitForFunction(
      (total) => {
        const v = document.querySelector('.summary-item .summary-value')?.textContent?.replace(/\s/g, '')
        return v === `0/${total}`
      },
      TOTAL,
      { timeout: 5000 },
    )
    t.check('answered reset to 0 / TOTAL', true, '')
    t.check('continue-banner gone after reset', (await page.$('.continue-banner')) === null, 'banner remains')
    t.check('review-banner gone after reset', (await page.$('.review-banner')) === null, 'review banner remains')
    t.check('reset button hidden after reset', (await page.$('.btn-reset-progress')) === null, 'reset button remains')

    // localStorage key actually cleared
    const ls = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)
    t.check('localStorage answers cleared', ls === null, `ls=${ls}`)

    t.check('reset no errors', !hasErrors(errors), errDetail('reset', errors))
  } catch (e) {
    t.check('reset block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// L. GL-review-populated — review page lists exactly the wrong-answered quizzes
// ════════════════════════════════════════════════════════════════════════════
block('L. GL-review populated', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    // 3 wrong across chapters, 2 correct (should NOT appear)
    const wrongIds = [BY_CHAPTER[1][0].id, BY_CHAPTER[2][1].id, BY_CHAPTER[5][0].id]
    const correctIds = [BY_CHAPTER[1][1].id, BY_CHAPTER[3][0].id]
    const answers = {}
    let ts = 1000
    for (const id of wrongIds) answers[id] = { correct: false, ts: ts++, selectedIndex: (BY_ID.get(id).answer + 1) % 4 }
    for (const id of correctIds) answers[id] = { correct: true, ts: ts++, selectedIndex: BY_ID.get(id).answer }

    await seedAnswers(page, answers)
    await gotoClean(page, '/quiz/review/')
    await page.waitForSelector('.quiz-card, .review-empty', { timeout: 15000 })

    const isEmpty = await page.$('.review-empty')
    t.check('review not empty (3 wrong)', isEmpty === null, 'review shows empty unexpectedly')

    // total count in the progress text should be 3
    const progressText = (await page.textContent('.quiz-progress-text')) || ''
    t.check('review total = 3', /\/\s*3\s*問/.test(progressText), `progress="${progressText.trim()}"`)

    // NOTE: QuizReview passes a dynamic `:title="...（N 問）"` to QuizPage, but
    // QuizPage never RENDERS the title prop (declared, unused). The visible page
    // heading is the static markdown H1 "間違えた問題を復習" and the count only
    // surfaces in the progress text (asserted above). So assert the static H1.
    const h1 = (await page.textContent('h1')) || ''
    t.check('review page H1 present', /間違えた問題を復習/.test(h1), `h1="${h1.trim()}"`)

    t.check('review populated no errors', !hasErrors(errors), errDetail('review-populated', errors))
  } catch (e) {
    t.check('review populated block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// M. GL-review-empty — review page empty state when no wrong answers
// ════════════════════════════════════════════════════════════════════════════
block('M. GL-review empty', async ({ t, browser }) => {
  const { page, context, errors } = await newInstrumentedPage(browser)
  try {
    // all-correct answers → no wrong → empty review
    const answers = buildAnswers(BY_CHAPTER[1].slice(0, 3), 'correct')
    await seedAnswers(page, answers)
    await gotoClean(page, '/quiz/review/')
    await page.waitForSelector('.review-empty, .quiz-card', { timeout: 15000 })
    t.check('review empty when no wrong', (await page.$('.review-empty')) !== null, 'expected empty review')
    const emptyText = (await page.textContent('.review-empty')) || ''
    t.check('review empty has guidance text', /復習する問題はありません/.test(emptyText), `text="${emptyText.slice(0, 60)}"`)
    t.check('review empty no errors', !hasErrors(errors), errDetail('review-empty', errors))
  } catch (e) {
    t.check('review empty block', false, String(e && e.message))
  } finally {
    await context.close()
  }
})

run()
