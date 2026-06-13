// ============================================================================
// UX検定基礎 — Playwright E2E suite (drill / quiz focused, exhaustive).
//
// HOW TO RUN
//   npm run test:e2e         (requires `npm run docs:preview` serving :4173)
//
// BROWSER
//   Normal env:  npx playwright install chromium  (auto-detected)
//   This sandbox: @sparticuz/chromium bundled binary (auto fallback). See
//   helpers.mjs for the launch recipe and rationale.
//
// DESIGN
//   - Raw Playwright API, not @playwright/test (runner assumes browser download).
//   - One fresh browser per block (runner.mjs) → bundled chromium stays stable.
//   - Ground-truth answers are loaded from docs/quiz/data/*.ts at startup so we
//     can deterministically click the correct / a wrong choice regardless of the
//     per-card display shuffle (we match by choice TEXT, not position).
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

// ── Load ground-truth quiz data (TS object literals → eval) ─────────────────
function loadAllQuizzes() {
  let all = []
  for (let n = 1; n <= 6; n++) {
    let src = readFileSync(new URL(`../docs/quiz/data/chapter${n}.ts`, import.meta.url), 'utf8')
    src = src.replace(/^import .*$/gm, '')
    src = src.replace(/export const chapter\d+\s*:\s*Quiz\[\]\s*=\s*/, 'return ')
    const arr = new Function(src + '\n')()
    all = all.concat(arr)
  }
  return all
}
const ALL = loadAllQuizzes()
const BY_ID = new Map(ALL.map((q) => [q.id, q]))
const BY_CHAPTER = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
function chapterOf(lesson) {
  const n = parseInt(lesson.replace('lesson', ''), 10)
  if (n <= 5) return 1
  if (n <= 15) return 2
  if (n <= 17) return 3
  if (n <= 21) return 4
  if (n <= 27) return 5
  return 6
}
for (const q of ALL) BY_CHAPTER[chapterOf(q.lesson)].push(q)

const CH_COUNTS = { 1: 32, 2: 60, 3: 13, 4: 26, 5: 38, 6: 26 }
const TOTAL = 195

// ── DOM interaction helpers ─────────────────────────────────────────────────

// Normalize displayed choice text (strip A/B/C/D label + the "正解" check badge).
async function readChoices(page) {
  return page.$$eval('.quiz-choices button', (btns) =>
    btns.map((b) => {
      const t = b.querySelector('.choice-text')
      return t ? t.textContent.trim() : b.textContent.trim()
    }),
  )
}

// The component renders `code` spans for backtick text; normalize by comparing
// against the quiz choice text with backticks removed.
function normalize(s) {
  return s.replace(/`/g, '').replace(/\s+/g, ' ').trim()
}

// Click the choice whose text matches the correct answer for the given quiz id.
async function clickCorrect(page, quizId) {
  const q = BY_ID.get(quizId)
  const want = normalize(q.choices[q.answer])
  const choices = (await readChoices(page)).map(normalize)
  const idx = choices.findIndex((c) => c === want)
  if (idx < 0) throw new Error(`correct choice not found for ${quizId}: want="${want}" got=${JSON.stringify(choices)}`)
  await page.$$('.quiz-choices button').then((b) => b[idx].click())
  return idx
}

async function clickWrong(page, quizId) {
  const q = BY_ID.get(quizId)
  const want = normalize(q.choices[q.answer])
  const choices = (await readChoices(page)).map(normalize)
  const idx = choices.findIndex((c) => c !== want)
  if (idx < 0) throw new Error(`wrong choice not found for ${quizId}`)
  await page.$$('.quiz-choices button').then((b) => b[idx].click())
  return idx
}

// Read the per-button class list keyed by DISPLAY index (after answering).
// Used to assert the green/red highlight lands on the exact position clicked,
// which is the precise regression the SSR/CSR shuffle bug produced.
async function readChoiceClasses(page) {
  return page.$$eval('.quiz-choices button', (btns) => btns.map((b) => b.className))
}

// Read the current quiz id by matching the displayed question text.
async function currentQuizId(page) {
  const qtext = normalize(await page.textContent('.quiz-question'))
  const found = ALL.find((q) => normalize(q.question) === qtext)
  return found ? found.id : null
}

async function gotoQuiz(page, path) {
  await page.goto(url(path), { waitUntil: 'networkidle' })
  await waitQuiz(page)
}

// Press a choice key (e.g. "1" or "a") robustly. The keydown handler is attached
// in QuizCard's onMounted, so on a freshly-loaded page the very first keypress
// can race hydration. Retry until the result appears (or fail clearly).
async function pressChoiceKeyUntilAnswered(page, key, tries = 5) {
  for (let i = 0; i < tries; i++) {
    await page.keyboard.press(key)
    try {
      await page.waitForSelector('.quiz-result', { timeout: 1500 })
      return true
    } catch {
      // if already answered (guard), .quiz-result is present — re-check
      if (await page.$('.quiz-result')) return true
    }
  }
  return false
}

// ============================================================================
// BLOCK A — All pages load: 200, no JS errors, no bad 4xx/5xx, no hydration warn
// ============================================================================
block('A. Page smoke (all routes load cleanly)', async ({ t, browser }) => {
  const paths = [
    '/', '/quiz/',
    '/quiz/chapter1/', '/quiz/chapter2/', '/quiz/chapter3/',
    '/quiz/chapter4/', '/quiz/chapter5/', '/quiz/chapter6/',
    '/quiz/random-5/', '/quiz/random-10/', '/quiz/random-100/', '/quiz/random/',
    '/quiz/review/',
  ]
  for (let i = 1; i <= 31; i++) {
    paths.push(`/lessons/lesson${String(i).padStart(2, '0')}/`)
  }
  // ALL pages — including random/shuffle — must now hydrate cleanly. The earlier
  // "benign random hydration mismatch" was in fact a SYMPTOM of the shuffle bug:
  // setup() sampled/shuffled, diverging SSR from the first client render, and the
  // resulting hydration mismatch went hand-in-hand with the wrong-choice-as-correct
  // highlight defect. QuizPage now defers sampling/shuffle to onMounted (the same
  // pattern QuizCard uses for its choice shuffle), so SSR == initial client render
  // and there is no hydration mismatch anywhere. We therefore assert ZERO
  // hydration/console errors on every route; a reappearing mismatch is a real
  // regression of that fix. (Vercel analytics 404s are still filtered in helpers.)
  // Reuse ONE context for the read-only smoke sweep to limit context churn.
  const { page, errors } = await newInstrumentedPage(browser)
  for (const p of paths) {
    const before = {
      pe: errors.pageErrors.length,
      ce: errors.consoleErrors.length,
      br: errors.badResponses.length,
    }
    const resp = await page.goto(url(p), { waitUntil: 'networkidle' })
    t.check(`GET ${p} → 200`, resp && resp.status() === 200, `status=${resp && resp.status()}`)
    // settle a tick for hydration (per-card onMounted shuffle runs post-hydration)
    await page.waitForTimeout(250)
    const newPe = errors.pageErrors.slice(before.pe)
    const newCe = errors.consoleErrors.slice(before.ce)
    const newBr = errors.badResponses.slice(before.br)
    const clean = newPe.length === 0 && newCe.length === 0 && newBr.length === 0
    t.check(`${p} no JS/console/network errors (incl. clean hydration)`, clean,
      `pageErrors=${JSON.stringify(newPe)} consoleErrors=${JSON.stringify(newCe)} badResponses=${JSON.stringify(newBr)}`)
  }
})

// ============================================================================
// BLOCK B — 404 handling for unknown path
// ============================================================================
block('B. 404 page for unknown path', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  const resp = await page.goto(url('/no-such-page-xyz/'), { waitUntil: 'networkidle' })
  t.check('unknown path → HTTP 404', resp && resp.status() === 404, `status=${resp && resp.status()}`)
  const body = await page.textContent('body')
  t.check('404 page shows NotFound content', /404|PAGE NOT FOUND/i.test(body), body.slice(0, 80))
  t.check('404 page no JS exceptions', errors.pageErrors.length === 0, summarizeErrors(errors))
})

// ============================================================================
// BLOCK C — Answer flow: result, badge, disabled, next-gating
// ============================================================================
block('C. Answer flow basics (chapter1)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')

  // next disabled before answering
  const nextDisabledBefore = await page.getAttribute('.btn-next', 'disabled')
  t.check('btn-next disabled before answering', nextDisabledBefore !== null)

  // prev hidden on first question
  const prevCount = await page.$$eval('.btn-prev', (e) => e.length)
  t.check('btn-prev hidden on Q1', prevCount === 0)

  const qid = await currentQuizId(page)
  await clickCorrect(page, qid)

  await page.waitForSelector('.quiz-result')
  t.check('quiz-result appears after answering', true)

  const badge = await page.getAttribute('.result-badge', 'data-correct')
  t.check('correct answer → badge data-correct=true', badge === 'true', `badge=${badge}`)

  const allDisabled = await page.$$eval('.quiz-choices button', (b) => b.every((x) => x.disabled))
  t.check('choices disabled after answering', allDisabled)

  const nextDisabledAfter = await page.getAttribute('.btn-next', 'disabled')
  t.check('btn-next enabled after answering', nextDisabledAfter === null)

  // explanation present
  const expl = await page.$('.quiz-explanation')
  t.check('explanation shown', expl !== null)
})

// ============================================================================
// BLOCK D — Correctness independent of shuffle (multiple questions, both paths)
// ============================================================================
block('D. Correctness vs display shuffle', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')

  // Answer first 6 questions: alternate correct / wrong, verify badge each time.
  for (let i = 0; i < 6; i++) {
    const qid = await currentQuizId(page)
    const expectCorrect = i % 2 === 0
    const clickedIdx = expectCorrect ? await clickCorrect(page, qid) : await clickWrong(page, qid)
    await page.waitForSelector('.result-badge')
    const badge = await page.getAttribute('.result-badge', 'data-correct')
    t.check(`Q${i + 1} (${qid}) badge=${expectCorrect}`, badge === String(expectCorrect), `got ${badge}`)
    // the .choice.correct must always equal the data answer text
    const correctText = await page.$eval('.choice.correct .choice-text', (e) => e.textContent.trim())
    const want = BY_ID.get(qid).choices[BY_ID.get(qid).answer]
    t.check(`Q${i + 1} highlighted-correct matches data`, normalize(correctText) === normalize(want),
      `hl="${correctText}" want="${want}"`)
    // Regression guard for the SSR/CSR shuffle bug: the class on the EXACT button
    // we clicked must agree with whether that choice was the correct one.
    const classes = await readChoiceClasses(page)
    const clickedClass = classes[clickedIdx]
    if (expectCorrect) {
      t.check(`Q${i + 1} clicked-correct button highlighted .correct`,
        /\bcorrect\b/.test(clickedClass) && !/\bwrong\b/.test(clickedClass),
        `clicked idx=${clickedIdx} class="${clickedClass}"`)
    } else {
      t.check(`Q${i + 1} clicked-wrong button highlighted .wrong`,
        /\bwrong\b/.test(clickedClass), `clicked idx=${clickedIdx} class="${clickedClass}"`)
      // and exactly one OTHER button carries .correct
      const correctButtons = classes.filter((c) => /\bcorrect\b/.test(c)).length
      t.check(`Q${i + 1} exactly one .correct button`, correctButtons === 1, `count=${correctButtons}`)
    }
    if (i < 5) await page.click('.btn-next')
    await page.waitForSelector('.quiz-card')
  }
})

// ============================================================================
// BLOCK E — Navigation boundaries: prev/next round trip, final → results
// ============================================================================
block('E. Navigation boundaries (chapter3, 13 Q)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter3/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter3/')

  const count = CH_COUNTS[3]
  t.check('chapter3 total = 13', (await page.textContent('.quiz-num')).includes(`/ ${count}`),
    await page.textContent('.quiz-num'))

  // Answer Q1, go next, then prev — answer state should persist
  let qid = await currentQuizId(page)
  await clickCorrect(page, qid)
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-card')
  const numAfterNext = await page.textContent('.quiz-num')
  t.check('next advances to 2/13', numAfterNext.startsWith('2 /'), numAfterNext)

  // prev appears now
  t.check('btn-prev visible on Q2', (await page.$('.btn-prev')) !== null)
  await page.click('.btn-prev')
  await page.waitForSelector('.quiz-card')
  t.check('prev returns to 1/13', (await page.textContent('.quiz-num')).startsWith('1 /'))
  // Q1 still shows result (answer persisted in view)
  t.check('Q1 answer persisted after prev', (await page.$('.quiz-result')) !== null)

  // Walk to the end answering everything
  // (currently on Q1 answered) advance through all
  for (let i = 1; i <= count; i++) {
    qid = await currentQuizId(page)
    if (!(await page.$('.quiz-result'))) {
      await clickCorrect(page, qid)
      await page.waitForSelector('.quiz-result')
    }
    const label = await page.textContent('.btn-next')
    if (i === count) {
      t.check('last question btn-next says 結果を見る', label.includes('結果を見る'), label)
    }
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card, .quiz-finish')
  }
  t.check('reached finish screen', (await page.$('.quiz-finish')) !== null)
})

// ============================================================================
// BLOCK F — Full chapter completion → finish score integrity & buttons
// ============================================================================
block('F. Finish screen integrity (chapter3)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter3/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter3/')

  const count = CH_COUNTS[3]
  // Answer with a known pattern: first 2 wrong, rest correct → wrong=2, correct=count-2
  let wrong = 0
  for (let i = 0; i < count; i++) {
    const qid = await currentQuizId(page)
    if (i < 2) { await clickWrong(page, qid); wrong++ } else { await clickCorrect(page, qid) }
    await page.waitForSelector('.quiz-result')
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card, .quiz-finish')
  }
  await page.waitForSelector('.quiz-finish')
  const score = await page.textContent('.finish-score')
  const expectCorrect = count - wrong
  t.check('finish-score correct count matches', score.includes(`${expectCorrect} / ${count}`), score.trim())

  const wrongRows = await page.$$eval('.finish-row[data-correct="false"]', (e) => e.length)
  t.check('wrong list count = 2', wrongRows === wrong, `rows=${wrongRows}`)

  // correct rows are inside a collapsible <details>; open it and count
  const detailsToggle = await page.$('.finish-section-collapsible summary')
  if (detailsToggle) await detailsToggle.click()
  const correctRows = await page.$$eval('.finish-row[data-correct="true"]', (e) => e.length)
  t.check('correct list count = count-2', correctRows === expectCorrect, `rows=${correctRows}`)

  // Buttons: review CTA shown (wrong>0), restart "同じ問題でもう一度", next-chapter to ch4
  t.check('review CTA shown (wrong>0)', (await page.$('.btn-review-cta')) !== null)
  const restartLabel = await page.textContent('.btn-restart:not(.btn-review-cta):not(.btn-next-chapter)')
  t.check('chapter restart label = 同じ問題でもう一度', restartLabel.includes('同じ問題でもう一度'), restartLabel.trim())
  const nextChap = await page.$('.btn-next-chapter')
  t.check('next-chapter button shown (ch3→ch4)', nextChap !== null)
  if (nextChap) {
    const href = await nextChap.getAttribute('href')
    t.check('next-chapter href = /quiz/chapter4/', href === '/quiz/chapter4/', href)
  }
})

// ============================================================================
// BLOCK G — chapter6 (last chapter) has NO next-chapter button
// ============================================================================
block('G. Last chapter has no next-chapter button', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter6/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter6/')
  const count = CH_COUNTS[6]
  for (let i = 0; i < count; i++) {
    const qid = await currentQuizId(page)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card, .quiz-finish')
  }
  await page.waitForSelector('.quiz-finish')
  t.check('all-correct finish: no wrong list', (await page.$('.finish-row[data-correct="false"]')) === null)
  t.check('all-correct finish: no review CTA', (await page.$('.btn-review-cta')) === null)
  t.check('chapter6: no next-chapter button', (await page.$('.btn-next-chapter')) === null)
  const score = await page.textContent('.finish-score')
  t.check('chapter6 perfect score', score.includes(`${count} / ${count}`), score.trim())
  const rate = await page.textContent('.finish-rate')
  t.check('chapter6 rate 100%', rate.includes('100%'), rate.trim())
})

// ============================================================================
// BLOCK H — "もう一度解く" (reset within a card): re-answer updates record
// ============================================================================
block('H. Reset within card (もう一度解く)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')

  const qid = await currentQuizId(page)
  await clickWrong(page, qid)
  await page.waitForSelector('.result-badge')
  t.check('first answer wrong', (await page.getAttribute('.result-badge', 'data-correct')) === 'false')

  // localStorage records wrong
  let rec = await page.evaluate((id) => JSON.parse(localStorage.getItem('quiz-answers') || '{}')[id], qid)
  t.check('localStorage records wrong', rec && rec.correct === false, JSON.stringify(rec))

  await page.click('.btn-reset')
  await page.waitForSelector('.quiz-choices button:not([disabled])')
  t.check('reset clears result', (await page.$('.quiz-result')) === null)
  t.check('reset removes localStorage entry', await page.evaluate((id) =>
    JSON.parse(localStorage.getItem('quiz-answers') || '{}')[id] === undefined, qid))

  // re-answer correctly
  await clickCorrect(page, qid)
  await page.waitForSelector('.result-badge')
  t.check('re-answer correct', (await page.getAttribute('.result-badge', 'data-correct')) === 'true')
  rec = await page.evaluate((id) => JSON.parse(localStorage.getItem('quiz-answers') || '{}')[id], qid)
  t.check('localStorage updated to correct', rec && rec.correct === true, JSON.stringify(rec))
})

// ============================================================================
// BLOCK I — Same-session resume (leave → return restores index & answers)
// ============================================================================
block('I. Same-session resume (view position restore)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter2/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter2/')

  // answer 3 questions, advance to Q4 (index 3)
  for (let i = 0; i < 3; i++) {
    const qid = await currentQuizId(page)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card')
  }
  const numBefore = await page.textContent('.quiz-num')
  t.check('advanced to 4/60', numBefore.startsWith('4 /'), numBefore)

  // navigate away to a lesson then back via reload (same tab → sessionStorage kept)
  await page.goto(url('/lessons/lesson06/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/chapter2/')
  const numAfter = await page.textContent('.quiz-num')
  t.check('same-session restores view at 4/60', numAfter.startsWith('4 /'), numAfter)
  // no resume toast in same-session restore path
  t.check('no resume toast on same-session restore', (await page.$('.quiz-resume-toast')) === null)
  // earlier answers preserved: progress shows 3 answered
  const prog = await page.textContent('.quiz-progress-text')
  t.check('progress shows 3 answered', prog.includes('3 / 60'), prog.trim())
})

// ============================================================================
// BLOCK J — New-session resume toast (sessionStorage cleared, localStorage kept)
// ============================================================================
block('J. New-session resume toast', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter4/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter4/')

  // Answer first 3 (indices 0,1,2), leaving Q4 as first unanswered.
  for (let i = 0; i < 3; i++) {
    const qid = await currentQuizId(page)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    if (i < 2) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  // Simulate NEW session: clear sessionStorage only, keep localStorage answers
  await page.evaluate(() => sessionStorage.clear())
  await gotoQuiz(page, '/quiz/chapter4/')

  const toast = await page.$('.quiz-resume-toast-text')
  t.check('resume toast shown', toast !== null)
  if (toast) {
    const txt = await toast.textContent()
    t.check('toast says 4 問目', txt.includes('4 問目'), txt.trim())
  }
  const num = await page.textContent('.quiz-num')
  t.check('resumed at Q4 (first unanswered)', num.startsWith('4 /'), num)

  // "1問目から始める" resets
  await page.click('.quiz-resume-toast-restart')
  await page.waitForSelector('.quiz-card')
  t.check('restart → back to Q1', (await page.textContent('.quiz-num')).startsWith('1 /'))
  t.check('restart clears prior answers (progress 0)', (await page.textContent('.quiz-progress-text')).includes('0 / 26'))
  t.check('toast dismissed after restart', (await page.$('.quiz-resume-toast')) === null)
})

// ============================================================================
// BLOCK K — New-session: all answered → straight to finish screen
// ============================================================================
block('K. New-session all-answered → finish', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter3/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter3/')
  const count = CH_COUNTS[3]
  for (let i = 0; i < count; i++) {
    const qid = await currentQuizId(page)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    if (i < count - 1) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  // new session
  await page.evaluate(() => sessionStorage.clear())
  await gotoQuiz(page, '/quiz/chapter3/')
  t.check('all-answered new session → finish screen immediately', (await page.$('.quiz-finish')) !== null)
})

// ============================================================================
// BLOCK L — localStorage persistence across reload
// ============================================================================
block('L. Persistence across reload', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')

  const qid = await currentQuizId(page)
  await clickCorrect(page, qid)
  await page.waitForSelector('.result-badge')

  // reload (same session) → the answer must persist in localStorage and the
  // progress count must be maintained. (After reload the view advances to the
  // first unanswered question — Q2 — which is correct product behaviour; the
  // spec only requires persistence + progress, not that the view stays on Q1.)
  await page.reload({ waitUntil: 'networkidle' })
  await waitQuiz(page)
  const lsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('quiz-answers') || '{}'))
  t.check('localStorage answer persists after reload', lsAfter[qid] && lsAfter[qid].correct === true,
    JSON.stringify(lsAfter))
  const prog = await page.textContent('.quiz-progress-text')
  t.check('progress preserved (1 answered)', prog.includes('1 / 32'), prog.trim())

  // And navigating back to Q1 must still show the restored answer/result.
  const prevBtn = await page.$('.btn-prev')
  if (prevBtn) {
    await prevBtn.click()
    await page.waitForSelector('.quiz-card')
  }
  t.check('restored answer visible when navigating to the answered question',
    (await page.$('.quiz-result')) !== null && (await page.textContent('.quiz-num')).startsWith('1 /'),
    await page.textContent('.quiz-num'))
})

// ============================================================================
// BLOCK M — Random sample sizes & session stability / re-draw
// ============================================================================
block('M. Random sample sizes + stability', async ({ t, browser }) => {
  const cases = [
    ['/quiz/random-5/', 5],
    ['/quiz/random-10/', 10],
    ['/quiz/random-100/', 100],
    ['/quiz/random/', 195],
  ]
  const { page } = await newInstrumentedPage(browser)
  for (const [path, n] of cases) {
    await gotoQuiz(page, path)
    await clearStorage(page)
    await gotoQuiz(page, path)
    const num = await page.textContent('.quiz-num')
    t.check(`${path} total = ${n}`, num.includes(`/ ${n}`), num)

    // stability: reload yields same first question id
    const firstId = await currentQuizId(page)
    await page.reload({ waitUntil: 'networkidle' })
    await waitQuiz(page)
    const firstId2 = await currentQuizId(page)
    t.check(`${path} session-stable across reload`, firstId === firstId2, `${firstId} vs ${firstId2}`)
  }
})

// ============================================================================
// BLOCK N — Random re-draw via "別の N 問でもう一度"
// ============================================================================
block('N. Random re-draw on restart', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/random-100/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/random-100/')

  // capture the set of ids by walking? too slow. Capture first id + sample-key value.
  const before = await page.evaluate(() => sessionStorage.getItem('quiz-sample-n100'))
  // answer all 100 quickly to reach finish, then restart with re-draw
  for (let i = 0; i < 100; i++) {
    const qid = await currentQuizId(page)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    if (i < 99) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  await page.click('.btn-next') // 結果を見る
  await page.waitForSelector('.quiz-finish')
  const restartBtn = await page.$('.btn-restart:not(.btn-review-cta)')
  const label = await restartBtn.textContent()
  t.check('random restart label = 別の 100 問でもう一度', label.includes('別の 100 問'), label.trim())
  await restartBtn.click()
  await page.waitForSelector('.quiz-card')
  const after = await page.evaluate(() => sessionStorage.getItem('quiz-sample-n100'))
  t.check('re-draw changes sample set', before !== after, 'sample unchanged after re-draw')
  t.check('re-draw resets to Q1', (await page.textContent('.quiz-num')).startsWith('1 /'))
})

// ============================================================================
// BLOCK O — Review page: empty state, then populated with wrong answers
// ============================================================================
block('O. Review page (empty + populated + drop-on-correct)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  // empty state
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await clearStorage(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.review-empty, .quiz-card', { timeout: 10000 })
  t.check('review empty state when no wrong answers', (await page.$('.review-empty')) !== null)

  // create 2 wrong answers in chapter1
  await gotoQuiz(page, '/quiz/chapter1/')
  const wrongIds = []
  for (let i = 0; i < 2; i++) {
    const qid = await currentQuizId(page)
    wrongIds.push(qid)
    await clickWrong(page, qid)
    await page.waitForSelector('.quiz-result')
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card')
  }
  // answer one correctly (should NOT appear in review)
  const correctQid = await currentQuizId(page)
  await clickCorrect(page, correctQid)
  await page.waitForSelector('.quiz-result')

  // visit review
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-card, .review-empty', { timeout: 10000 })
  t.check('review populated (not empty)', (await page.$('.review-empty')) === null)
  const reviewTotal = await page.textContent('.quiz-num')
  t.check('review has exactly 2 questions', reviewTotal.includes('/ 2'), reviewTotal)

  // review hides the review CTA (hideReviewCta). Answer both correctly → finish.
  for (let i = 0; i < 2; i++) {
    const qid = await currentQuizId(page)
    t.check(`review Q${i + 1} is a previously-wrong id`, wrongIds.includes(qid), `${qid} not in ${wrongIds}`)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    if (i < 1) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-finish')
  t.check('review finish: no review-cta (hideReviewCta)', (await page.$('.btn-review-cta')) === null)

  // now both wrong answers became correct in localStorage → review should be empty
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.review-empty, .quiz-card', { timeout: 10000 })
  t.check('review empty after correcting all wrongs', (await page.$('.review-empty')) !== null)
})

// ============================================================================
// BLOCK P — Quiz top dashboard (progress, chapter cards, links)
// ============================================================================
block('P. Quiz top dashboard', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  // seed: answer some ch1 to populate stats
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')
  // 2 correct, 1 wrong
  for (let i = 0; i < 3; i++) {
    const qid = await currentQuizId(page)
    if (i < 2) await clickCorrect(page, qid); else await clickWrong(page, qid)
    await page.waitForSelector('.quiz-result')
    if (i < 2) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }

  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-top')

  const answered = await page.textContent('.quiz-top-summary .summary-item:first-child .summary-value')
  t.check('top: answered 3 / 195', answered.replace(/\s/g, '') === '3/195', answered.trim())

  // total questions shown = 195 (random全 button)
  const randAll = await page.textContent('.quiz-top-actions a:last-child')
  t.check('top: random-all shows 195', randAll.includes('195'), randAll.trim())

  // 6 chapter cards
  const cards = await page.$$eval('.chapter-card', (e) => e.length)
  t.check('top: 6 chapter cards', cards === 6, `cards=${cards}`)

  // chapter card hrefs
  const hrefs = await page.$$eval('.chapter-card', (e) => e.map((a) => a.getAttribute('href')))
  t.check('top: chapter card links correct', JSON.stringify(hrefs) ===
    JSON.stringify(['/quiz/chapter1/', '/quiz/chapter2/', '/quiz/chapter3/', '/quiz/chapter4/', '/quiz/chapter5/', '/quiz/chapter6/']),
    JSON.stringify(hrefs))

  // review banner shown (1 wrong)
  t.check('top: review banner shown (wrong>0)', (await page.$('.review-banner')) !== null)

  // continue banner → chapter1 (partial progress)
  const cont = await page.$('.continue-banner')
  t.check('top: continue banner present', cont !== null)
  if (cont) t.check('top: continue → chapter1', (await cont.getAttribute('href')) === '/quiz/chapter1/')

  // chapter1 card shows 3/32
  const ch1stats = await page.textContent('.chapter-card:first-child .chapter-stats')
  t.check('top: ch1 shows 3 / 32', ch1stats.includes('3 / 32'), ch1stats.trim())

  // difficulty chips total per chapter1 = 32
  const chips = await page.$$eval('.chapter-card:first-child .diff-chip', (e) => e.map((x) => x.textContent))
  const sum = chips.reduce((a, c) => a + parseInt(c.replace(/\D/g, ''), 10), 0)
  t.check('top: ch1 difficulty chips sum to 32', sum === 32, JSON.stringify(chips))
})

// ============================================================================
// BLOCK Q — Reset progress button clears everything
// ============================================================================
block('Q. Reset progress from top', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')
  const qid = await currentQuizId(page)
  await clickCorrect(page, qid)
  await page.waitForSelector('.quiz-result')

  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-top')
  // auto-accept confirm()
  page.on('dialog', (d) => d.accept())
  const resetBtn = await page.$('.btn-reset-progress')
  t.check('reset button present when answered>0', resetBtn !== null)
  await resetBtn.click()
  await page.waitForTimeout(300)
  const answered = await page.textContent('.quiz-top-summary .summary-item:first-child .summary-value')
  t.check('after reset answered = 0 / 195', answered.replace(/\s/g, '') === '0/195', answered.trim())
  const ls = await page.evaluate(() => localStorage.getItem('quiz-answers'))
  t.check('localStorage answers cleared', ls === null, `ls=${ls}`)
})

// ============================================================================
// BLOCK R — Keyboard selection (1-4 and A-D)
// ============================================================================
block('R. Keyboard selection', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')

  // press "1" → selects display index 0 (retry to absorb hydration race)
  const answered1 = await pressChoiceKeyUntilAnswered(page, '1')
  t.check('number key 1 answers the question', answered1 && (await page.$('.quiz-result')) !== null)
  // the selected (display index 0) should be either correct or wrong but consistent
  const badge1 = await page.getAttribute('.result-badge', 'data-correct')
  const firstChoice = (await readChoices(page))[0]
  const qid = await currentQuizId(page)
  const isCorrect = normalize(firstChoice) === normalize(BY_ID.get(qid).choices[BY_ID.get(qid).answer])
  t.check('number key result matches first choice correctness', badge1 === String(isCorrect),
    `badge=${badge1} expected=${isCorrect}`)

  // next question via letter key
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-card')
  const answeredA = await pressChoiceKeyUntilAnswered(page, 'a')
  t.check('letter key A answers the question', answeredA && (await page.$('.quiz-result')) !== null)
  // letter A must select display index 0 → its button highlighted correct/wrong
  const classesA = await readChoiceClasses(page)
  t.check('letter A selects display index 0',
    /\bcorrect\b|\bwrong\b/.test(classesA[0]), `class0="${classesA[0]}"`)

  // after answered, pressing another key must NOT change the answer (guard)
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-card')
  const answered2 = await pressChoiceKeyUntilAnswered(page, '2')
  t.check('number key 2 answers the question', answered2)
  // snapshot which display index is selected (the .wrong or .correct that the user picked)
  const classesBefore = await readChoiceClasses(page)
  const badgeBefore = await page.getAttribute('.result-badge', 'data-correct')
  await page.keyboard.press('3') // should be ignored (answered guard)
  await page.waitForTimeout(150)
  const classesAfter = await readChoiceClasses(page)
  const badgeAfter = await page.getAttribute('.result-badge', 'data-correct')
  const answeredCount = await page.$$eval('.quiz-choices button', (b) => b.filter((x) => x.disabled).length)
  t.check('second keypress ignored after answered (still all disabled)', answeredCount === 4)
  t.check('second keypress does not change highlight',
    JSON.stringify(classesBefore) === JSON.stringify(classesAfter),
    `before=${JSON.stringify(classesBefore)} after=${JSON.stringify(classesAfter)}`)
  t.check('second keypress does not change correctness badge', badgeBefore === badgeAfter,
    `before=${badgeBefore} after=${badgeAfter}`)
})

// ============================================================================
// BLOCK S — Robustness: no double-answer, rapid clicks, next can't skip
// ============================================================================
block('S. Robustness (double-click / next-gating)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')

  // try clicking btn-next while disabled (force) — should not advance
  await page.$eval('.btn-next', (b) => b.click()) // disabled buttons: click is a no-op
  await page.waitForTimeout(100)
  t.check('disabled next does not advance (still 1/..)', (await page.textContent('.quiz-num')).startsWith('1 /'))
  t.check('disabled next does not create result', (await page.$('.quiz-result')) === null)

  // rapid double click on a choice → only one answer recorded, correctness stable
  const btns = await page.$$('.quiz-choices button')
  const qid = await currentQuizId(page)
  const want = normalize(BY_ID.get(qid).choices[BY_ID.get(qid).answer])
  const texts = (await readChoices(page)).map(normalize)
  const correctIdx = texts.findIndex((x) => x === want)
  const wrongIdx = texts.findIndex((x) => x !== want)
  await btns[correctIdx].click()
  // immediately try clicking a wrong one (should be disabled / ignored)
  await btns[wrongIdx].click().catch(() => {})
  await page.waitForSelector('.result-badge')
  const badge = await page.getAttribute('.result-badge', 'data-correct')
  t.check('first (correct) click wins, second ignored', badge === 'true', `badge=${badge}`)
  const rec = await page.evaluate((id) => JSON.parse(localStorage.getItem('quiz-answers'))[id], qid)
  t.check('localStorage stores single correct answer', rec && rec.correct === true, JSON.stringify(rec))
})

// ============================================================================
// BLOCK T — Mobile viewport renders main pages cleanly
// ============================================================================
block('T. Mobile viewport (375x667)', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser, { viewport: { width: 375, height: 667 } })
  // Post-fix, random-5 (a shuffle page) also hydrates cleanly — sampling/shuffle
  // is deferred to onMounted — so we assert zero hydration/console errors here too.
  for (const p of ['/', '/quiz/', '/quiz/chapter1/', '/quiz/random-5/', '/quiz/review/']) {
    const beforePe = errors.pageErrors.length
    const beforeCe = errors.consoleErrors.length
    const resp = await page.goto(url(p), { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)
    t.check(`mobile ${p} → 200`, resp && resp.status() === 200, `status=${resp && resp.status()}`)
    const newPe = errors.pageErrors.slice(beforePe)
    const newCe = errors.consoleErrors.slice(beforeCe)
    t.check(`mobile ${p} no JS errors (incl. clean hydration)`, newPe.length === 0 && newCe.length === 0,
      `pageErrors=${JSON.stringify(newPe)} consoleErrors=${JSON.stringify(newCe)}`)
  }
  // quiz card interactive on mobile
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')
  const qid = await currentQuizId(page)
  await clickCorrect(page, qid)
  await page.waitForSelector('.quiz-result')
  t.check('mobile: answering works', (await page.$('.quiz-result')) !== null)
})

// ============================================================================
// BLOCK U — Dark mode toggle does not break the drill
// ============================================================================
block('U. Dark mode toggle', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  // set dark via VitePress mechanism (localStorage + class), then reload
  await page.evaluate(() => localStorage.setItem('vitepress-theme-appearance', 'dark'))
  await page.reload({ waitUntil: 'networkidle' })
  await waitQuiz(page)
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  t.check('dark class applied', isDark)
  const qid = await currentQuizId(page)
  await clickCorrect(page, qid)
  await page.waitForSelector('.quiz-result')
  t.check('dark mode: answering works', (await page.$('.quiz-result')) !== null)
  t.check('dark mode: no JS errors', errors.pageErrors.length === 0 && errors.consoleErrors.length === 0,
    summarizeErrors(errors))
})

// ============================================================================
// BLOCK V — SSR/CSR consistency on a fixed-order page (no hydration mismatch)
//           + data integrity via UI totals
// ============================================================================
block('V. SSR/CSR + data integrity', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  // Fixed-order chapter page: hydration must be clean.
  await page.goto(url('/quiz/chapter2/'), { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  t.check('chapter2 fixed-order: no hydration/console warnings', errors.consoleErrors.length === 0,
    summarizeErrors(errors))

  // Data integrity: each chapter page total equals expected and they sum to 195.
  let sum = 0
  for (let ch = 1; ch <= 6; ch++) {
    await gotoQuiz(page, `/quiz/chapter${ch}/`)
    await clearStorage(page)
    await gotoQuiz(page, `/quiz/chapter${ch}/`)
    const num = await page.textContent('.quiz-num')
    const m = num.match(/\/\s*(\d+)/)
    const total = m ? parseInt(m[1], 10) : -1
    t.check(`chapter${ch} total = ${CH_COUNTS[ch]}`, total === CH_COUNTS[ch], `got ${total}`)
    sum += total
  }
  t.check('chapter totals sum to 195', sum === TOTAL, `sum=${sum}`)
})

// ============================================================================
// BLOCK W — Random page (shuffle all 195) loads & is interactive, CSR re-draw OK
// ============================================================================
block('W. Random-all (shuffle 195) interactive', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/random/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/random/')
  await page.waitForTimeout(300) // let onMounted sampling + per-card shuffle settle
  const num = await page.textContent('.quiz-num')
  t.check('random-all total = 195', num.includes('/ 195'), num)
  // Post-fix, the shuffle page must hydrate cleanly (no JS errors AND no hydration
  // mismatch). A reappearing mismatch flags regression of the SSR/CSR sampling fix.
  t.check('random-all no JS errors', errors.pageErrors.length === 0, summarizeErrors(errors))
  const hydrationWarns = errors.consoleErrors.filter((m) => /hydrat|mismatch/i.test(m))
  t.check('random-all hydrates cleanly (no mismatch)', hydrationWarns.length === 0,
    JSON.stringify(hydrationWarns))
  const qid = await currentQuizId(page)
  await clickCorrect(page, qid)
  await page.waitForSelector('.quiz-result')
  t.check('random-all: answering works', (await page.$('.quiz-result')) !== null)
  // and the highlighted-correct visible text equals the data answer (regression).
  const correctVisible = await page.$eval('.choice.correct .choice-text', (e) => e.textContent.trim())
  t.check('random-all: highlighted-correct matches data',
    normalize(correctVisible) === normalize(BY_ID.get(qid).choices[BY_ID.get(qid).answer]),
    `hl="${correctVisible}"`)
  // restart label for shuffle (no randomSample) = 順番をシャッフルしてもう一度 — verify on finish is heavy;
  // assert the sample key is the shuffle scope key.
  const key = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('quiz-sample-shuffle')))
  t.check('random-all uses shuffle sample key', key.some((k) => k.includes('all-195')), JSON.stringify(key))
})

// ============================================================================
// BLOCK X — Shuffle-bug regression sweep: correct & wrong selection highlight
//           lands on the EXACT clicked position, across all 6 chapters'
//           first card + the random/random-5 head card.
//
// This is the dedicated regression guard for the SSR/CSR shuffle defect
// ("選んだ正解が不正解になる"). On every page type we:
//   1) click the data-correct choice → badge=true AND the clicked button is
//      the .choice.correct (green) one, AND exactly one .correct exists.
//   2) reset, then click a wrong choice → badge=false AND the clicked button is
//      .choice.wrong (red) while the separate .choice.correct marks the answer.
// Because choices are shuffled on the client (random pages doubly so), a
// mismatch between display order and the click handler would surface here.
// ============================================================================
async function assertHighlightAtClick(t, page, label) {
  const qid = await currentQuizId(page)
  t.check(`${label}: resolved current quiz id`, qid !== null, 'currentQuizId returned null')
  if (!qid) return

  // (1) correct click
  const correctIdx = await clickCorrect(page, qid)
  await page.waitForSelector('.result-badge')
  const badgeC = await page.getAttribute('.result-badge', 'data-correct')
  t.check(`${label}: correct click → badge=true`, badgeC === 'true', `badge=${badgeC}`)
  let classes = await readChoiceClasses(page)
  t.check(`${label}: clicked button is .correct (green at click pos)`,
    /\bcorrect\b/.test(classes[correctIdx]) && !/\bwrong\b/.test(classes[correctIdx]),
    `idx=${correctIdx} class="${classes[correctIdx]}"`)
  t.check(`${label}: exactly one .correct after correct click`,
    classes.filter((c) => /\bcorrect\b/.test(c)).length === 1, JSON.stringify(classes))
  // localStorage must agree
  const recC = await page.evaluate((id) => JSON.parse(localStorage.getItem('quiz-answers') || '{}')[id], qid)
  t.check(`${label}: localStorage correct=true`, recC && recC.correct === true, JSON.stringify(recC))

  // (2) reset then wrong click — reset reshuffles, so re-resolve indices
  await page.click('.btn-reset')
  await page.waitForSelector('.quiz-choices button:not([disabled])')
  const wrongIdx = await clickWrong(page, qid)
  await page.waitForSelector('.result-badge')
  const badgeW = await page.getAttribute('.result-badge', 'data-correct')
  t.check(`${label}: wrong click → badge=false`, badgeW === 'false', `badge=${badgeW}`)
  classes = await readChoiceClasses(page)
  t.check(`${label}: clicked button is .wrong (red at click pos)`,
    /\bwrong\b/.test(classes[wrongIdx]), `idx=${wrongIdx} class="${classes[wrongIdx]}"`)
  t.check(`${label}: the correct answer still marked .correct`,
    classes.filter((c) => /\bcorrect\b/.test(c)).length === 1 && !/\bcorrect\b/.test(classes[wrongIdx]),
    JSON.stringify(classes))
}

block('X. Shuffle-bug regression sweep (all chapters + random head)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  for (let ch = 1; ch <= 6; ch++) {
    await gotoQuiz(page, `/quiz/chapter${ch}/`)
    await clearStorage(page)
    await gotoQuiz(page, `/quiz/chapter${ch}/`)
    await assertHighlightAtClick(t, page, `chapter${ch} Q1`)
  }
  // Random pages: the head card is doubly shuffled (sample + per-card). Clear
  // first so we land on a fresh draw, then verify the click→highlight invariant.
  for (const p of ['/quiz/random-5/', '/quiz/random/']) {
    await gotoQuiz(page, p)
    await clearStorage(page)
    await gotoQuiz(page, p)
    await assertHighlightAtClick(t, page, `${p} head`)
  }
})

run()
