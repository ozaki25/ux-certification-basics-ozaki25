// ============================================================================
// UX検定基礎 — QA suite for RANDOM draw / mock-exam / REVIEW pages.
//
// Owner: Senior QA (random sampling, mock-exam volume, review page).
// Runs against the already-running preview at http://localhost:4173 — this
// suite NEVER rebuilds or restarts it.
//
// HOW TO RUN
//   node tests/qa_random_review.e2e.mjs
//   BLOCKS=RR-A,RR-D node tests/qa_random_review.e2e.mjs   (single letters; see runner.mjs)
//
// DESIGN (mirrors tests/quiz.e2e.mjs)
//   - Raw Playwright via playwright-core + bundled chromium (helpers.mjs).
//   - One fresh browser per block (runner.mjs) — bundled chromium is unstable
//     across many contexts.
//   - Ground-truth answers loaded from docs/quiz/data/*.ts so we can click the
//     correct / a wrong choice by TEXT (independent of the per-card shuffle).
//
// SPEC NOTES established by reading QuizPage.vue / QuizReview.vue:
//   * Totals: random-5=5, random-10=10, random-100=100, random(all)=195.
//   * Sample stability is keyed in sessionStorage:
//       random-N    → quiz-sample-n{N}
//       shuffle all  → quiz-sample-shuffle-all-{len}   (random-all & review)
//     Same tab (sessionStorage kept) ⇒ same set & order across reload / nav.
//     Clearing sessionStorage ⇒ key gone ⇒ fresh draw on next mount.
//   * Re-draw on the finish screen ("別の N 問でもう一度" / "順番をシャッフルして
//     もう一度") calls sampleQuizzes(true) → new set/order.
//   * REVIEW page: onMounted filters allQuizzes where stored[id] exists && !correct.
//     - none wrong  → .review-empty
//     - wrong>0     → QuizPage(shuffle, hideReviewCta) titled 間違えた問題を復習（N 問）
//     - DROP-ON-CORRECT is computed at MOUNT: answering correctly on the review
//       page writes localStorage.correct=true, but the card only disappears on the
//       NEXT visit/reload (re-mount re-filters). We assert via re-navigation.
//     - already-correct ids never appear in review.
// ============================================================================

import { readFileSync } from 'fs'
import { block, run } from './runner.mjs'
import {
  newInstrumentedPage,
  summarizeErrors,
  url,
  clearStorage,
  waitQuiz,
} from './helpers.mjs'

// ── Ground-truth quiz data ──────────────────────────────────────────────────
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
const TOTAL = 195

function normalize(s) {
  return s.replace(/`/g, '').replace(/\s+/g, ' ').trim()
}

async function readChoices(page) {
  return page.$$eval('.quiz-choices button', (btns) =>
    btns.map((b) => {
      const t = b.querySelector('.choice-text')
      return t ? t.textContent.trim() : b.textContent.trim()
    }),
  )
}

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

async function readChoiceClasses(page) {
  return page.$$eval('.quiz-choices button', (btns) => btns.map((b) => b.className))
}

async function currentQuizId(page) {
  const qtext = normalize(await page.textContent('.quiz-question'))
  const found = ALL.find((q) => normalize(q.question) === qtext)
  return found ? found.id : null
}

async function gotoQuiz(page, path) {
  await page.goto(url(path), { waitUntil: 'networkidle' })
  await waitQuiz(page)
}

// Read the displayed total from ".quiz-num" ("現在 / 総数").
function parseTotal(numText) {
  const m = numText.match(/\/\s*(\d+)/)
  return m ? parseInt(m[1], 10) : -1
}

// Walk the first `k` cards (without answering) recording quiz ids, then return
// to the head. Used to compare ordering between reloads. We must answer to move
// next (btn-next is gated), so this is destructive — callers should clear after.
async function walkIdsAnsweringCorrect(page, k) {
  const ids = []
  for (let i = 0; i < k; i++) {
    const qid = await currentQuizId(page)
    ids.push(qid)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    // advance unless last requested
    if (i < k - 1) {
      await page.click('.btn-next')
      await page.waitForSelector('.quiz-card, .quiz-finish')
      if (await page.$('.quiz-finish')) break
    }
  }
  return ids
}

// Read the stored sample id array for a given key (or null).
async function readSampleKey(page, key) {
  return page.evaluate((k) => sessionStorage.getItem(k), key)
}

const RANDOM_CASES = [
  ['/quiz/random-5/', 5, 'quiz-sample-n5'],
  ['/quiz/random-10/', 10, 'quiz-sample-n10'],
  ['/quiz/random-100/', 100, 'quiz-sample-n100'],
  ['/quiz/random/', 195, 'quiz-sample-shuffle-all-195'],
]

// ============================================================================
// RR-A — Exact totals on every random page (5 / 10 / 100 / 195)
// ============================================================================
block('RR-A. Random totals exact (5/10/100/195)', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  for (const [path, n, key] of RANDOM_CASES) {
    await gotoQuiz(page, path)
    await clearStorage(page)
    await gotoQuiz(page, path)
    await page.waitForTimeout(250) // onMounted sample settles
    const num = await page.textContent('.quiz-num')
    t.check(`${path} total = ${n}`, parseTotal(num) === n, num.trim())

    // the sample key for this page must exist with exactly n ids after mount
    const raw = await readSampleKey(page, key)
    let ids = []
    try { ids = JSON.parse(raw || '[]') } catch {}
    t.check(`${path} sample key ${key} has ${n} ids`, Array.isArray(ids) && ids.length === n,
      `key=${key} len=${ids && ids.length}`)
    // all ids are real quiz ids and unique
    const uniq = new Set(ids)
    t.check(`${path} sampled ids unique & valid`,
      uniq.size === ids.length && ids.every((id) => BY_ID.has(id)),
      `uniq=${uniq.size} len=${ids.length}`)
  }
  t.check('no JS/console errors across random pages', errors.pageErrors.length === 0 && errors.consoleErrors.length === 0,
    summarizeErrors(errors))
})

// ============================================================================
// RR-B — Same-session stability: reload yields same set & order
// ============================================================================
block('RR-B. Same-session stability (reload == same set+order)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  for (const [path, n, key] of RANDOM_CASES) {
    await gotoQuiz(page, path)
    await clearStorage(page)
    await gotoQuiz(page, path)
    await page.waitForTimeout(200)

    const before = JSON.parse((await readSampleKey(page, key)) || '[]')
    const firstId = await currentQuizId(page)

    await page.reload({ waitUntil: 'networkidle' })
    await waitQuiz(page)
    await page.waitForTimeout(200)

    const after = JSON.parse((await readSampleKey(page, key)) || '[]')
    const firstId2 = await currentQuizId(page)

    t.check(`${path} first question stable across reload`, firstId === firstId2,
      `${firstId} vs ${firstId2}`)
    t.check(`${path} full sample set+order identical across reload`,
      JSON.stringify(before) === JSON.stringify(after),
      `before[0..3]=${before.slice(0, 3)} after[0..3]=${after.slice(0, 3)}`)
  }
})

// ============================================================================
// RR-C — Same-session stability across navigation away & back
//         (leave to a lesson, return → same draw)
// ============================================================================
block('RR-C. Stable across navigate-away & back', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  // use random-10 (cheap) and random-all (shuffle key)
  for (const [path, , key] of [RANDOM_CASES[1], RANDOM_CASES[3]]) {
    await gotoQuiz(page, path)
    await clearStorage(page)
    await gotoQuiz(page, path)
    await page.waitForTimeout(200)
    const before = JSON.parse((await readSampleKey(page, key)) || '[]')

    await page.goto(url('/lessons/lesson06/'), { waitUntil: 'networkidle' })
    await gotoQuiz(page, path)
    await page.waitForTimeout(200)
    const after = JSON.parse((await readSampleKey(page, key)) || '[]')

    t.check(`${path} same set after navigate-away & back`,
      JSON.stringify(before) === JSON.stringify(after),
      `len before=${before.length} after=${after.length}`)
  }
})

// ============================================================================
// RR-D — New session (sessionStorage cleared, localStorage kept) → re-draw.
//         Confirms the sample key is regenerated. (May coincide by chance for
//         random-all since it shuffles the same 195; we assert KEY presence and
//         that for sampled pages the *set* is freshly written.)
// ============================================================================
block('RR-D. New session re-draws sample', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  // random-100: sampling 100 of 195 — set equality across two independent draws
  // is astronomically unlikely, so a differing set is a reliable re-draw signal.
  for (const [path, n, key] of [RANDOM_CASES[2]]) {
    await gotoQuiz(page, path)
    await clearStorage(page)
    await gotoQuiz(page, path)
    await page.waitForTimeout(200)
    const before = JSON.parse((await readSampleKey(page, key)) || '[]')

    // Simulate NEW session: drop the sample key (sessionStorage), keep localStorage.
    await page.evaluate(() => sessionStorage.clear())
    const cleared = await readSampleKey(page, key)
    t.check(`${path} sample key cleared on new session`, cleared === null, `key still=${cleared}`)

    await gotoQuiz(page, path)
    await page.waitForTimeout(200)
    const after = JSON.parse((await readSampleKey(page, key)) || '[]')
    t.check(`${path} new key written with ${n} ids`, after.length === n, `len=${after.length}`)
    t.check(`${path} new-session draw differs from previous (re-draw)`,
      JSON.stringify(before) !== JSON.stringify(after),
      'sample identical across sessions (statistically implausible — possible no-redraw bug)')
  }
})

// ============================================================================
// RR-E — Random-100 full walk → finish score integrity, then re-draw button
//         changes the set. (Heavy: 100 answers.)
// ============================================================================
block('RR-E. random-100 finish integrity + re-draw button', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/random-100/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/random-100/')
  await page.waitForTimeout(200)

  const before = JSON.parse((await readSampleKey(page, 'quiz-sample-n100')) || '[]')
  t.check('random-100 head: 100 sampled', before.length === 100, `len=${before.length}`)

  // Answer with a known pattern: first 3 wrong, rest correct → correct = 97.
  let wrong = 0
  for (let i = 0; i < 100; i++) {
    const qid = await currentQuizId(page)
    if (i < 3) { await clickWrong(page, qid); wrong++ } else { await clickCorrect(page, qid) }
    await page.waitForSelector('.quiz-result')
    if (i < 99) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  await page.click('.btn-next') // 結果を見る
  await page.waitForSelector('.quiz-finish')

  const score = await page.textContent('.finish-score')
  const expectCorrect = 100 - wrong
  t.check('random-100 finish score = 97 / 100', score.includes(`${expectCorrect} / 100`), score.trim())
  const rate = await page.textContent('.finish-rate')
  t.check('random-100 rate = 97%', rate.includes('97%'), rate.trim())
  const wrongRows = await page.$$eval('.finish-row[data-correct="false"]', (e) => e.length)
  t.check('random-100 wrong list = 3', wrongRows === wrong, `rows=${wrongRows}`)
  // review CTA appears (wrong>0) on a random page (NOT hideReviewCta)
  t.check('random-100 finish shows review CTA (wrong>0)', (await page.$('.btn-review-cta')) !== null)

  // re-draw button label + new set
  const restartBtn = await page.$('.btn-restart:not(.btn-review-cta):not(.btn-next-chapter)')
  const label = await restartBtn.textContent()
  t.check('random-100 restart label = 別の 100 問でもう一度', label.includes('別の 100 問'), label.trim())
  await restartBtn.click()
  await page.waitForSelector('.quiz-card')
  await page.waitForTimeout(150)
  const after = JSON.parse((await readSampleKey(page, 'quiz-sample-n100')) || '[]')
  t.check('re-draw resets to Q1', (await page.textContent('.quiz-num')).startsWith('1 /'))
  t.check('re-draw changes the 100-set', JSON.stringify(before) !== JSON.stringify(after),
    'set unchanged after re-draw')
  t.check('re-draw set still 100', after.length === 100, `len=${after.length}`)
})

// ============================================================================
// RR-F — random-all (shuffle 195) re-draw changes ORDER, restart label,
//         and answering scores correctly (random-context correctness check).
// ============================================================================
block('RR-F. random-all shuffle re-draw + correctness', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/random/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/random/')
  await page.waitForTimeout(250)

  const key = 'quiz-sample-shuffle-all-195'
  const before = JSON.parse((await readSampleKey(page, key)) || '[]')
  t.check('random-all sample = 195 ids', before.length === 195, `len=${before.length}`)
  // it is a permutation of ALL ids (same set, possibly different order)
  const allIds = new Set(ALL.map((q) => q.id))
  t.check('random-all is a permutation of all 195', new Set(before).size === 195 &&
    before.every((id) => allIds.has(id)), `uniq=${new Set(before).size}`)

  // correctness in random context: clicking the data-correct choice → badge true,
  // and the highlighted .correct text equals the data answer.
  const qid = await currentQuizId(page)
  const cIdx = await clickCorrect(page, qid)
  await page.waitForSelector('.result-badge')
  t.check('random-all: correct click → badge=true',
    (await page.getAttribute('.result-badge', 'data-correct')) === 'true')
  const classes = await readChoiceClasses(page)
  t.check('random-all: clicked button highlighted .correct (no shuffle drift)',
    /\bcorrect\b/.test(classes[cIdx]) && !/\bwrong\b/.test(classes[cIdx]),
    `idx=${cIdx} class="${classes[cIdx]}"`)
  const correctVisible = await page.$eval('.choice.correct .choice-text', (e) => e.textContent.trim())
  t.check('random-all: highlighted-correct text matches data',
    normalize(correctVisible) === normalize(BY_ID.get(qid).choices[BY_ID.get(qid).answer]),
    `hl="${correctVisible}"`)

  // Walk to finish to reach the re-draw button. (195 answers — heavy.)
  // Continue from Q2 (Q1 already answered correct).
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-card')
  for (let i = 1; i < 195; i++) {
    const id = await currentQuizId(page)
    await clickCorrect(page, id)
    await page.waitForSelector('.quiz-result')
    if (i < 194) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-finish')
  const score = await page.textContent('.finish-score')
  t.check('random-all all-correct → 195 / 195', score.includes('195 / 195'), score.trim())

  const restartBtn = await page.$('.btn-restart:not(.btn-review-cta):not(.btn-next-chapter)')
  const label = await restartBtn.textContent()
  t.check('random-all restart label = 順番をシャッフルしてもう一度',
    label.includes('順番をシャッフル'), label.trim())
  await restartBtn.click()
  await page.waitForSelector('.quiz-card')
  await page.waitForTimeout(150)
  const after = JSON.parse((await readSampleKey(page, key)) || '[]')
  t.check('shuffle re-draw still 195 (same set)', after.length === 195 &&
    new Set(after).size === 195, `len=${after.length}`)
  t.check('shuffle re-draw changes ORDER', JSON.stringify(before) !== JSON.stringify(after),
    'order identical after reshuffle (improbable)')
  t.check('random-all no JS errors', errors.pageErrors.length === 0, summarizeErrors(errors))
})

// ============================================================================
// RR-G — random-100 == mock-exam volume aligned with the real 100-question CBT
//         (problem count only; distribution is out of scope per spec).
// ============================================================================
block('RR-G. random-100 mock-exam volume = 100', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/random-100/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/random-100/')
  await page.waitForTimeout(200)
  const num = await page.textContent('.quiz-num')
  t.check('random-100 mock volume = 100 (matches official CBT count)', parseTotal(num) === 100, num.trim())
  const ids = JSON.parse((await readSampleKey(page, 'quiz-sample-n100')) || '[]')
  t.check('random-100 draws from the full 195 pool', ids.length === 100 && ids.every((id) => BY_ID.has(id)),
    `len=${ids.length}`)
  t.check('100 <= total pool 195', 100 <= TOTAL)
})

// ============================================================================
// RR-H — Review page EMPTY state (no answers / all-correct answers)
// ============================================================================
block('RR-H. Review empty state', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  // (1) no answers at all → empty
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await clearStorage(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.review-empty, .quiz-card', { timeout: 10000 })
  t.check('review empty when no answers stored', (await page.$('.review-empty')) !== null)
  t.check('review empty shows guidance link to /quiz/',
    (await page.$('.review-empty a[href="/quiz/"]')) !== null)

  // (2) only-correct answers → still empty (correct ids never enter review)
  await gotoQuiz(page, '/quiz/chapter1/')
  for (let i = 0; i < 3; i++) {
    const qid = await currentQuizId(page)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    if (i < 2) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.review-empty, .quiz-card', { timeout: 10000 })
  t.check('review empty when all answered correctly', (await page.$('.review-empty')) !== null)
})

// ============================================================================
// RR-I — Review aggregates wrong answers ACROSS multiple chapters; correct ids
//         excluded; title shows count; shuffle restart label.
// ============================================================================
block('RR-I. Review aggregates across chapters (excludes correct)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)

  // chapter1: 2 wrong + 1 correct
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
  const correctId1 = await currentQuizId(page)
  await clickCorrect(page, correctId1)
  await page.waitForSelector('.quiz-result')

  // chapter4: 2 more wrong
  await gotoQuiz(page, '/quiz/chapter4/')
  for (let i = 0; i < 2; i++) {
    const qid = await currentQuizId(page)
    wrongIds.push(qid)
    await clickWrong(page, qid)
    await page.waitForSelector('.quiz-result')
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card')
  }

  // visit review
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-card, .review-empty', { timeout: 10000 })
  t.check('review populated (not empty)', (await page.$('.review-empty')) === null)
  const num = await page.textContent('.quiz-num')
  t.check('review total = 4 (2 ch1 + 2 ch4 wrong)', parseTotal(num) === 4, num.trim())
  // The static markdown heading "間違えた問題を復習" is shown.
  const heading = await page.textContent('h1')
  t.check('review page heading present (間違えた問題を復習)', /間違えた問題を復習/.test(heading), heading)
  // FINDING: QuizReview passes a dynamic title prop "間違えた問題を復習（N 問）" to
  // QuizPage, but QuizPage never renders `title` anywhere — so the per-visit count
  // is NOT shown to the user (dead prop). Assert the count string is absent to lock
  // in / surface this behavior. If a future change renders it, this flips and prompts review.
  const bodyText = await page.textContent('body')
  t.check('FINDING: dynamic title count (N 問) is NOT rendered — QuizPage ignores title prop',
    !/間違えた問題を復習（\s*\d+\s*問）/.test(bodyText),
    'count-bearing title now visible — title prop got wired up; update report')

  // the set of review ids == the wrong ids we created (and excludes the correct one)
  const seen = new Set()
  for (let i = 0; i < 4; i++) {
    const qid = await currentQuizId(page)
    seen.add(qid)
    if (i < 3) {
      // answer (correctly) only to advance; correctness change won't drop mid-session
      await clickCorrect(page, qid)
      await page.waitForSelector('.quiz-result')
      await page.click('.btn-next')
      await page.waitForSelector('.quiz-card')
    }
  }
  const allWrongSeen = wrongIds.every((id) => seen.has(id))
  t.check('review contains exactly the 4 wrong ids', seen.size === 4 && allWrongSeen,
    `seen=${[...seen]} wrong=${wrongIds}`)
  t.check('review excludes the correctly-answered ch1 id', !seen.has(correctId1),
    `correctId=${correctId1} appeared in review`)
})

// ============================================================================
// RR-J — Drop-on-correct: answer a review card correctly, re-visit → it's gone.
//         (In-memory set is fixed at mount; drop manifests on re-mount.)
// ============================================================================
block('RR-J. Drop-on-correct on re-visit', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter2/')
  await clearStorage(page)

  // create 3 wrong in chapter2
  await gotoQuiz(page, '/quiz/chapter2/')
  const wrongIds = []
  for (let i = 0; i < 3; i++) {
    const qid = await currentQuizId(page)
    wrongIds.push(qid)
    await clickWrong(page, qid)
    await page.waitForSelector('.quiz-result')
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card')
  }

  // review: 3 questions
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-card', { timeout: 10000 })
  t.check('review starts with 3', parseTotal(await page.textContent('.quiz-num')) === 3,
    await page.textContent('.quiz-num'))

  // answer the FIRST review card correctly (whatever it is, by id)
  const fixedId = await currentQuizId(page)
  t.check('first review card is a known wrong id', wrongIds.includes(fixedId), fixedId)
  await clickCorrect(page, fixedId)
  await page.waitForSelector('.quiz-result')
  // localStorage now records it correct
  const rec = await page.evaluate((id) => JSON.parse(localStorage.getItem('quiz-answers') || '{}')[id], fixedId)
  t.check('answered review card recorded correct in localStorage', rec && rec.correct === true,
    JSON.stringify(rec))

  // re-visit review (re-mount re-filters) → that id is dropped, total = 2
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-card, .review-empty', { timeout: 10000 })
  t.check('review total drops to 2 after correcting one', parseTotal(await page.textContent('.quiz-num')) === 2,
    await page.textContent('.quiz-num'))
  // the corrected id is gone; walk to confirm
  const remaining = new Set()
  for (let i = 0; i < 2; i++) {
    remaining.add(await currentQuizId(page))
    if (i < 1) {
      await clickCorrect(page, await currentQuizId(page))
      await page.waitForSelector('.quiz-result')
      await page.click('.btn-next')
      await page.waitForSelector('.quiz-card')
    }
  }
  t.check('corrected id no longer present in review', !remaining.has(fixedId), `remaining=${[...remaining]}`)
})

// ============================================================================
// RR-K — Full interaction loop: chapter wrong → appears in review → correct
//         there → re-visit empties review (all wrongs cleared).
// ============================================================================
block('RR-K. Chapter→review→correct→empty loop', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await gotoQuiz(page, '/quiz/chapter3/')
  await clearStorage(page)

  // create 2 wrong in chapter3
  await gotoQuiz(page, '/quiz/chapter3/')
  const wrongIds = []
  for (let i = 0; i < 2; i++) {
    const qid = await currentQuizId(page)
    wrongIds.push(qid)
    await clickWrong(page, qid)
    await page.waitForSelector('.quiz-result')
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card')
  }

  // review shows them
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-card', { timeout: 10000 })
  t.check('review shows the 2 chapter3 wrongs', parseTotal(await page.textContent('.quiz-num')) === 2,
    await page.textContent('.quiz-num'))

  // answer BOTH correctly → finish; review CTA must be hidden (hideReviewCta)
  for (let i = 0; i < 2; i++) {
    const qid = await currentQuizId(page)
    await clickCorrect(page, qid)
    await page.waitForSelector('.quiz-result')
    if (i < 1) { await page.click('.btn-next'); await page.waitForSelector('.quiz-card') }
  }
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-finish')
  t.check('review finish hides review CTA (hideReviewCta)', (await page.$('.btn-review-cta')) === null)
  const restartLabel = await page.textContent('.btn-restart:not(.btn-next-chapter)')
  t.check('review restart label = 順番をシャッフルしてもう一度',
    restartLabel.includes('順番をシャッフル'), restartLabel.trim())

  // re-visit review → empty
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.review-empty, .quiz-card', { timeout: 10000 })
  t.check('review empty after all wrongs corrected', (await page.$('.review-empty')) !== null)
})

// ============================================================================
// RR-L — Review page hydrates cleanly (no JS / console / hydration warnings),
//         both in empty and populated states.
// ============================================================================
block('RR-L. Review hydration clean (empty + populated)', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  // empty
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await clearStorage(page)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const emptyClean = errors.pageErrors.length === 0 && errors.consoleErrors.length === 0
  t.check('review empty: no JS/console/hydration errors', emptyClean, summarizeErrors(errors))

  // populated
  await gotoQuiz(page, '/quiz/chapter1/')
  const qid = await currentQuizId(page)
  await clickWrong(page, qid)
  await page.waitForSelector('.quiz-result')
  const ceBefore = errors.consoleErrors.length
  const peBefore = errors.pageErrors.length
  await page.goto(url('/quiz/review/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-card', { timeout: 10000 })
  await page.waitForTimeout(300)
  const newCe = errors.consoleErrors.slice(ceBefore)
  const newPe = errors.pageErrors.slice(peBefore)
  t.check('review populated: no JS/console/hydration errors', newCe.length === 0 && newPe.length === 0,
    `consoleErrors=${JSON.stringify(newCe)} pageErrors=${JSON.stringify(newPe)}`)
})

run()
