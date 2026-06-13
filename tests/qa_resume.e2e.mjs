// ============================================================================
// UX検定基礎 — Resume / state-persistence E2E suite (QA owner: 状態永続・再開機構)
//
// Exhaustively exercises the QuizPage resume/persistence state machine:
//   localStorage `quiz-answers`        — answer records (cross-session)
//   sessionStorage `quiz-state-{path}` — view position + finished (same-session)
//   sessionStorage `quiz-sample-*`     — random/shuffle draw (same-session)
//
// Block prefix RS-* keeps this independent of the shared quiz.e2e.mjs (A..X).
//
// HOW TO RUN
//   node tests/qa_resume.e2e.mjs                  # all 16 blocks (A..P)
//   BLOCKS=A-E node tests/qa_resume.e2e.mjs       # a chunk
//   BLOCKS=K,O,P node tests/qa_resume.e2e.mjs     # singletons
//   The runner keys on each block's LEADING LETTER. Blocks here are named
//   "A. [RS] …" .. "P. [RS] …" so they split cleanly with BLOCKS=. The whole
//   file is medium weight (it deliberately avoids walking 100/195-question
//   samples to completion); ~10 blocks run comfortably in one process.
//
// EACH BLOCK USES A SINGLE BROWSER CONTEXT. Multi-sub-case blocks (G/J/M) reuse
//   one page and reset with clearStorage between cases — opening a 2nd context
//   in the same process crashes the bundled @sparticuz/chromium.
//
// PRODUCT BUGS found here and now FIXED (assertions expect correct behavior):
//   RS-BUG-1 (block O/K): same-session restore onto the SSR/initial index of an
//     ANSWERED card used to show it as unanswered (stale QuizCard, :key unchanged).
//     Fixed: QuizPage bumps restoreNonce on restore → :key changes → fresh QuizCard.
//   RS-BUG-2 (block P): answering without navigating wrote no quiz-state, so a
//     same-session return was misclassified as new-session (toast + jump).
//     Fixed: onAnswered() now calls saveState().
//
// PRECONDITION: preview server live at http://localhost:4173 (shared — do NOT
//   restart/rebuild). If it is down every block fails fast on the first goto.
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

// ── Ground-truth quiz data (so we can click correct/wrong by TEXT, not pos) ──
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
const CH_COUNTS = { 1: 32, 2: 60, 3: 13, 4: 26, 5: 38, 6: 26 }

// ── DOM helpers (shared shape with quiz.e2e.mjs) ────────────────────────────
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
  if (idx < 0) throw new Error(`correct choice not found for ${quizId}`)
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
async function currentQuizId(page) {
  const qtext = normalize(await page.textContent('.quiz-question'))
  const found = ALL.find((q) => normalize(q.question) === qtext)
  return found ? found.id : null
}
async function gotoQuiz(page, path) {
  await page.goto(url(path), { waitUntil: 'networkidle' })
  await waitQuiz(page)
}
// "n / total" → n
async function curNum(page) {
  const t = await page.textContent('.quiz-num')
  const m = t.match(/^\s*(\d+)\s*\//)
  return m ? parseInt(m[1], 10) : -1
}
// Answer current question (correct) and advance to next card (does NOT click
// next on the last one). Returns the quiz id answered.
async function answerAndNext(page, { correct = true, advance = true } = {}) {
  const qid = await currentQuizId(page)
  if (correct) await clickCorrect(page, qid)
  else await clickWrong(page, qid)
  await page.waitForSelector('.quiz-result')
  if (advance) {
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card, .quiz-finish')
  }
  return qid
}
async function newSession(page) {
  // Simulate a brand-new tab/session: drop sessionStorage, keep localStorage.
  await page.evaluate(() => sessionStorage.clear())
}
async function getState(page, path) {
  return page.evaluate((p) => {
    const raw = sessionStorage.getItem(`quiz-state-${p}`)
    return raw ? JSON.parse(raw) : null
  }, path)
}
async function lsAnswers(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('quiz-answers') || '{}'))
}
async function sessionKeys(page) {
  return page.evaluate(() => Object.keys(sessionStorage))
}

// Reset a chapter page to a clean slate (clear ALL storage on origin then reload).
async function freshChapter(page, ch) {
  await gotoQuiz(page, `/quiz/chapter${ch}/`)
  await clearStorage(page)
  await gotoQuiz(page, `/quiz/chapter${ch}/`)
}

// ============================================================================
// RS-A — Fresh / never-answered: Q1, no toast, 0 answered, state seeded
// ============================================================================
block('A. [RS] Fresh start (no prior answers)', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  await freshChapter(page, 1)

  t.check('fresh: lands on Q1', (await curNum(page)) === 1, await page.textContent('.quiz-num'))
  t.check('fresh: no resume toast', (await page.$('.quiz-resume-toast')) === null)
  t.check('fresh: 0 answered', (await page.textContent('.quiz-progress-text')).includes('0 / 32'))
  t.check('fresh: not finished (card visible)', (await page.$('.quiz-card')) !== null)
  t.check('fresh: localStorage empty', Object.keys(await lsAnswers(page)).length === 0)
  // The watch on [currentIndex, finished] is NOT immediate, so on a fresh page
  // with no interaction (index stays 0, finished stays false) NO quiz-state key
  // is written yet. Documented behaviour: state appears only after first nav/answer.
  const st = await getState(page, '/quiz/chapter1/')
  t.check('fresh: quiz-state NOT yet written (watch non-immediate)', st == null, JSON.stringify(st))
  // Answering then advancing triggers the watch → state now persisted.
  await answerAndNext(page, { advance: true })
  const st2 = await getState(page, '/quiz/chapter1/')
  t.check('after first answer+next: quiz-state written at index 1',
    st2 != null && st2.currentIndex === 1 && st2.finished === false, JSON.stringify(st2))
  t.check('fresh: no console/JS errors', errors.consoleErrors.length === 0 && errors.pageErrors.length === 0,
    summarizeErrors(errors))
})

// ============================================================================
// RS-B — Same-session restore: position + answers, NO toast; multiple round-trips
// ============================================================================
block('B. [RS] Same-session view restore', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 2)

  // answer 3, advance to Q4
  for (let i = 0; i < 3; i++) await answerAndNext(page)
  t.check('advanced to Q4', (await curNum(page)) === 4, await page.textContent('.quiz-num'))

  // leave to a lesson, come back (same tab → sessionStorage kept)
  await page.goto(url('/lessons/lesson06/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/chapter2/')
  t.check('same-session restores position Q4', (await curNum(page)) === 4, await page.textContent('.quiz-num'))
  t.check('same-session: NO resume toast', (await page.$('.quiz-resume-toast')) === null)
  t.check('same-session: 3 answered preserved', (await page.textContent('.quiz-progress-text')).includes('3 / 60'))

  // the restored current card (Q4) is unanswered → next disabled, no result yet
  t.check('restored Q4 is unanswered (next disabled)', (await page.getAttribute('.btn-next', 'disabled')) !== null)

  // navigate back via prev to an answered question → its result is restored
  await page.click('.btn-prev')
  await page.waitForSelector('.quiz-card')
  t.check('prev to Q3 shows restored result', (await page.$('.quiz-result')) !== null && (await curNum(page)) === 3)
  const prevBadge = await page.getAttribute('.result-badge', 'data-correct')
  t.check('restored answered card shows badge', prevBadge === 'true' || prevBadge === 'false', `badge=${prevBadge}`)

  // second round-trip: move to Q2, leave, return → restores Q2 (not Q4)
  await page.click('.btn-prev')
  await page.waitForSelector('.quiz-card')
  t.check('now at Q2', (await curNum(page)) === 2)
  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/chapter2/')
  t.check('same-session restores most-recent position Q2', (await curNum(page)) === 2, await page.textContent('.quiz-num'))
})

// ============================================================================
// RS-C — Same-session FINISH restore: reach results, leave, return → results
// ============================================================================
block('C. [RS] Same-session finish-screen restore', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 3)
  const count = CH_COUNTS[3]
  for (let i = 0; i < count; i++) {
    await answerAndNext(page, { correct: i % 3 !== 0, advance: i < count - 1 })
  }
  // last answered; click 結果を見る
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-finish')
  t.check('reached finish screen', (await page.$('.quiz-finish')) !== null)
  const st1 = await getState(page, '/quiz/chapter3/')
  t.check('quiz-state finished=true', st1 != null && st1.finished === true, JSON.stringify(st1))

  // leave and return same-session → finish screen restored (NOT the card)
  await page.goto(url('/lessons/lesson16/'), { waitUntil: 'networkidle' })
  await page.goto(url('/quiz/chapter3/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-card, .quiz-finish')
  t.check('same-session restores FINISH screen', (await page.$('.quiz-finish')) !== null)
  t.check('finish restore: no resume toast', (await page.$('.quiz-resume-toast')) === null)
  // score integrity preserved
  const score = await page.textContent('.finish-score')
  t.check('restored finish shows full count', score.includes(`/ ${count}`), score.trim())
})

// ============================================================================
// RS-D — New session, k consecutive answered → resume at Q(k+1) + toast text
// ============================================================================
block('D. [RS] New-session consecutive resume + toast', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 4)
  // answer first 5 consecutively (indices 0..4), leaving Q6 first-unanswered
  for (let i = 0; i < 5; i++) {
    await answerAndNext(page, { advance: i < 4 })
  }
  await newSession(page)
  await gotoQuiz(page, '/quiz/chapter4/')

  t.check('resume at Q6 (k+1)', (await curNum(page)) === 6, await page.textContent('.quiz-num'))
  const toast = await page.$('.quiz-resume-toast-text')
  t.check('resume toast shown', toast !== null)
  if (toast) t.check('toast says 6 問目', (await toast.textContent()).includes('6 問目'),
    (await toast.textContent()).trim())
  t.check('resume: 5 answered preserved', (await page.textContent('.quiz-progress-text')).includes('5 / 26'))
  // The resumed current card (Q6) should be unanswered
  t.check('resumed card Q6 unanswered', (await page.$('.quiz-result')) === null)
})

// ============================================================================
// RS-E — New session, GAPPED answers → resume at FIRST unanswered (the gap)
// ============================================================================
block('E. [RS] New-session gapped resume (first unanswered)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 4)
  // btn-next is gated on unanswered questions, so we cannot literally "skip" Q2
  // in the UI. To produce a genuine gap (Q1 + Q3 answered, Q2 a hole) we answer
  // Q1, Q2, Q3 consecutively, then DELETE Q2's localStorage record — simulating
  // a partially-synced answer history (the state the resume logic must handle).
  await answerAndNext(page, { advance: true })   // Q1 answered, now Q2
  const q2id = await currentQuizId(page)
  await clickCorrect(page, q2id)                 // Q2 answered
  await page.waitForSelector('.quiz-result')
  await page.click('.btn-next')                  // -> Q3
  await page.waitForSelector('.quiz-card')
  await answerAndNext(page, { advance: false })  // Q3 answered

  // Now create the gap: remove Q2's answer from localStorage.
  await page.evaluate((id) => {
    const d = JSON.parse(localStorage.getItem('quiz-answers') || '{}')
    delete d[id]
    localStorage.setItem('quiz-answers', JSON.stringify(d))
  }, q2id)

  await newSession(page)
  await gotoQuiz(page, '/quiz/chapter4/')
  t.check('gapped resume lands on Q2 (first unanswered)', (await curNum(page)) === 2,
    await page.textContent('.quiz-num'))
  const toast = await page.$('.quiz-resume-toast-text')
  t.check('gapped resume toast says 2 問目', toast !== null && (await toast.textContent()).includes('2 問目'),
    toast ? (await toast.textContent()).trim() : 'no toast')
  // answered count = 2 (Q1 + Q3), Q2 is the hole
  t.check('gapped resume: 2 answered', (await page.textContent('.quiz-progress-text')).includes('2 / 26'))
})

// ============================================================================
// RS-F — New session, ALL answered → straight to finish, no toast
// ============================================================================
block('F. [RS] New-session all-answered → finish (no toast)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 3)
  const count = CH_COUNTS[3]
  for (let i = 0; i < count; i++) {
    await answerAndNext(page, { advance: i < count - 1 })
  }
  await newSession(page)
  await gotoQuiz(page, '/quiz/chapter3/')
  t.check('all-answered new session → finish immediately', (await page.$('.quiz-finish')) !== null)
  t.check('all-answered new session: no resume toast', (await page.$('.quiz-resume-toast')) === null)
})

// ============================================================================
// RS-G — Resume toast actions: restart (clears LS) and close (keeps position)
// ============================================================================
block('G. [RS] Resume toast actions (restart / close)', async ({ t, browser }) => {
  // Single page/context for both sub-cases (bundled chromium is unstable with
  // multiple contexts per process); reset state with clearStorage between them.
  const { page } = await newInstrumentedPage(browser)

  // --- restart ("1問目から始める") ---
  await freshChapter(page, 4)
  for (let i = 0; i < 4; i++) await answerAndNext(page, { advance: i < 3 })
  await newSession(page)
  await gotoQuiz(page, '/quiz/chapter4/')
  t.check('restart-case: toast present at Q5', (await page.$('.quiz-resume-toast')) !== null && (await curNum(page)) === 5)

  const lsBefore = await lsAnswers(page)
  t.check('restart-case: 4 answers in localStorage before', Object.keys(lsBefore).length === 4, JSON.stringify(Object.keys(lsBefore)))

  await page.click('.quiz-resume-toast-restart')
  await page.waitForSelector('.quiz-card')
  t.check('restart → back to Q1', (await curNum(page)) === 1)
  t.check('restart dismisses toast', (await page.$('.quiz-resume-toast')) === null)
  t.check('restart resets progress to 0', (await page.textContent('.quiz-progress-text')).includes('0 / 26'))
  // restart() in fixed-order mode clears the chapter's localStorage answers
  t.check('restart clears this chapter localStorage answers', Object.keys(await lsAnswers(page)).length === 0,
    JSON.stringify(Object.keys(await lsAnswers(page))))
  // and the first card is now freshly answerable (no restored result)
  t.check('restart: Q1 unanswered after restart', (await page.$('.quiz-result')) === null)

  // --- close ("×") --- reuse same page, clean slate
  await freshChapter(page, 4)
  for (let i = 0; i < 4; i++) await answerAndNext(page, { advance: i < 3 })
  await newSession(page)
  await gotoQuiz(page, '/quiz/chapter4/')
  const numAtResume = await curNum(page)
  t.check('close-case: toast present at Q5', (await page.$('.quiz-resume-toast')) !== null && numAtResume === 5)
  await page.click('.quiz-resume-toast-close')
  await page.waitForTimeout(100)
  t.check('close dismisses toast', (await page.$('.quiz-resume-toast')) === null)
  t.check('close keeps position (still Q5)', (await curNum(page)) === 5)
  t.check('close keeps answers (4 answered)', (await page.textContent('.quiz-progress-text')).includes('4 / 26'))
  // localStorage untouched by close
  t.check('close does NOT clear localStorage', Object.keys(await lsAnswers(page)).length === 4)
})

// ============================================================================
// RS-H — Per-chapter independence: ch1 progress does not leak into ch2;
//        quiz-state keyed per pathname.
// ============================================================================
block('H. [RS] Per-chapter independence', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  // clean slate
  await gotoQuiz(page, '/quiz/chapter1/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/chapter1/')
  // answer 3 in ch1, advance to Q4
  for (let i = 0; i < 3; i++) await answerAndNext(page)
  t.check('ch1 at Q4', (await curNum(page)) === 4)

  // open ch2 same session → fresh Q1, no toast (different pathname key)
  await gotoQuiz(page, '/quiz/chapter2/')
  t.check('ch2 opens fresh at Q1', (await curNum(page)) === 1, await page.textContent('.quiz-num'))
  t.check('ch2 no resume toast', (await page.$('.quiz-resume-toast')) === null)
  t.check('ch2 shows 0 answered (uncontaminated)', (await page.textContent('.quiz-progress-text')).includes('0 / 60'))

  // interact with ch2 (answer 1, advance to Q2) so its own quiz-state key is
  // written — and confirm it does not perturb ch1's persisted state.
  await answerAndNext(page) // ch2 Q1 -> Q2
  t.check('ch2 advanced to Q2', (await curNum(page)) === 2)

  // both per-path state keys exist and are distinct (ch2 now has one)
  const keys = await sessionKeys(page)
  t.check('quiz-state key for ch1 exists', keys.includes('quiz-state-/quiz/chapter1/'), JSON.stringify(keys))
  t.check('quiz-state key for ch2 exists', keys.includes('quiz-state-/quiz/chapter2/'), JSON.stringify(keys))
  const st1 = await getState(page, '/quiz/chapter1/')
  const st2 = await getState(page, '/quiz/chapter2/')
  t.check('ch1 state preserved at index 3 (untouched by ch2)', st1 && st1.currentIndex === 3, JSON.stringify(st1))
  t.check('ch2 state at index 1 (its own)', st2 && st2.currentIndex === 1, JSON.stringify(st2))

  // return to ch1 same-session → restored at Q4 (independent of ch2 visit)
  await gotoQuiz(page, '/quiz/chapter1/')
  t.check('ch1 restored at Q4 after visiting ch2', (await curNum(page)) === 4, await page.textContent('.quiz-num'))
  t.check('ch1 still 3 answered', (await page.textContent('.quiz-progress-text')).includes('3 / 32'))
})

// ============================================================================
// RS-I — Reset progress from top wipes LS + quiz-state + quiz-sample;
//        opening a (previously-completed) chapter after reset is fresh.
// ============================================================================
block('I. [RS] Top reset → chapter fresh', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  // Complete chapter3 fully (so without reset it would re-show finish screen),
  // and seed a random sample key too.
  await freshChapter(page, 3)
  const count = CH_COUNTS[3]
  for (let i = 0; i < count; i++) await answerAndNext(page, { advance: i < count - 1 })
  await page.click('.btn-next')
  await page.waitForSelector('.quiz-finish')
  // visit random-5 to create a quiz-sample-n5 key
  await gotoQuiz(page, '/quiz/random-5/')
  const keysBefore = await sessionKeys(page)
  t.check('pre-reset: quiz-sample key present', keysBefore.some((k) => k.startsWith('quiz-sample-')), JSON.stringify(keysBefore))
  t.check('pre-reset: quiz-state key present', keysBefore.some((k) => k.startsWith('quiz-state-')), JSON.stringify(keysBefore))

  // go to top, accept confirm, reset
  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await page.waitForSelector('.quiz-top')
  page.on('dialog', (d) => d.accept())
  const resetBtn = await page.$('.btn-reset-progress')
  t.check('reset button present', resetBtn !== null)
  await resetBtn.click()
  await page.waitForTimeout(300)

  t.check('post-reset: localStorage answers cleared', (await page.evaluate(() => localStorage.getItem('quiz-answers'))) === null)
  const keysAfter = await sessionKeys(page)
  t.check('post-reset: no quiz-state keys', !keysAfter.some((k) => k.startsWith('quiz-state-')), JSON.stringify(keysAfter))
  t.check('post-reset: no quiz-sample keys', !keysAfter.some((k) => k.startsWith('quiz-sample-')), JSON.stringify(keysAfter))

  // open the previously-completed chapter3 → must be fresh Q1, NOT finish screen
  await gotoQuiz(page, '/quiz/chapter3/')
  t.check('post-reset chapter3 is fresh Q1 (not finish)', (await page.$('.quiz-finish')) === null && (await curNum(page)) === 1,
    `finish=${(await page.$('.quiz-finish')) !== null} num=${await page.textContent('.quiz-num')}`)
  t.check('post-reset chapter3 no toast', (await page.$('.quiz-resume-toast')) === null)
  t.check('post-reset chapter3 0 answered', (await page.textContent('.quiz-progress-text')).includes('0 / 13'))
})

// ============================================================================
// RS-J — Random/shuffle pages do NOT cross-session resume; DO same-session
//        restore (position + same draw); new session re-draws fresh, no toast.
// ============================================================================
block('J. [RS] Random/shuffle resume semantics', async ({ t, browser }) => {
  // Single page/context for both sub-cases (chromium stability).
  const { page } = await newInstrumentedPage(browser)

  // random-10 (randomSample=10): same-session restore + new-session re-draw
  await gotoQuiz(page, '/quiz/random-10/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/random-10/')
  await page.waitForTimeout(200)
  // answer a few
  for (let i = 0; i < 3; i++) await answerAndNext(page)
  t.check('random-10 advanced to Q4', (await curNum(page)) === 4)
  const sampleBefore = await page.evaluate(() => sessionStorage.getItem('quiz-sample-n10'))

  // same-session restore: leave, return → same draw + same position
  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/random-10/')
  const sampleSame = await page.evaluate(() => sessionStorage.getItem('quiz-sample-n10'))
  t.check('random-10 same-session: same draw set', sampleBefore === sampleSame, 'draw changed in same session')
  t.check('random-10 same-session: position restored Q4', (await curNum(page)) === 4, await page.textContent('.quiz-num'))
  t.check('random-10 same-session: no toast', (await page.$('.quiz-resume-toast')) === null)

  // new session: re-draw, start at Q1, no toast (even though LS has answers)
  await newSession(page)
  await gotoQuiz(page, '/quiz/random-10/')
  await page.waitForTimeout(200)
  t.check('random-10 new session: back to Q1', (await curNum(page)) === 1, await page.textContent('.quiz-num'))
  t.check('random-10 new session: NO resume toast', (await page.$('.quiz-resume-toast')) === null)
  const sampleNew = await page.evaluate(() => sessionStorage.getItem('quiz-sample-n10'))
  t.check('random-10 new session: fresh sample key present', sampleNew !== null)
  t.check('random-10 total still 10', (await page.textContent('.quiz-num')).includes('/ 10'))

  // random/ (shuffle=true, all 195): new session does not resume/toast
  await gotoQuiz(page, '/quiz/random/')
  await clearStorage(page)
  await gotoQuiz(page, '/quiz/random/')
  await page.waitForTimeout(200)
  for (let i = 0; i < 2; i++) await answerAndNext(page)
  t.check('random-all advanced to Q3', (await curNum(page)) === 3)
  await newSession(page)
  await gotoQuiz(page, '/quiz/random/')
  await page.waitForTimeout(200)
  t.check('random-all new session: Q1, no resume', (await curNum(page)) === 1 && (await page.$('.quiz-resume-toast')) === null,
    await page.textContent('.quiz-num'))
})

// ============================================================================
// RS-K — Reset-within-card ("もう一度解く") interaction with resume:
//        resume restores an answered card, reset it, re-answer → record updates;
//        progress count stays consistent.
// ============================================================================
block('K. [RS] Reset-within-card after resume', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 1)
  // answer Q1 WRONG, advance to Q2, answer Q2 correct, advance Q3
  const q1 = await currentQuizId(page)
  await clickWrong(page, q1)
  await page.waitForSelector('.quiz-result')
  await page.click('.btn-next'); await page.waitForSelector('.quiz-card')
  await answerAndNext(page) // Q2 correct -> Q3

  // new session resume (Q3 first unanswered? no — Q1,Q2 answered so first
  // unanswered is Q3). Resume there, then navigate back to Q1 (the wrong one).
  await newSession(page)
  await gotoQuiz(page, '/quiz/chapter1/')
  t.check('resumed at Q3', (await curNum(page)) === 3, await page.textContent('.quiz-num'))
  // back to Q1 via prev twice
  await page.click('.btn-prev'); await page.waitForSelector('.quiz-card')
  await page.click('.btn-prev'); await page.waitForSelector('.quiz-card')
  t.check('navigated back to Q1', (await curNum(page)) === 1)
  t.check('Q1 shows restored (wrong) result', (await page.getAttribute('.result-badge', 'data-correct')) === 'false')
  // it shows "前回の回答" marker since initialAnswered=true
  t.check('Q1 marked as previous answer', (await page.$('.result-badge-prev')) !== null)

  const progBefore = await page.textContent('.quiz-progress-text')
  t.check('progress 2 answered before reset', progBefore.includes('2 / 32'), progBefore.trim())

  // reset Q1 → record removed, progress drops to 1
  await page.click('.btn-reset')
  await page.waitForSelector('.quiz-choices button:not([disabled])')
  t.check('reset removes Q1 from localStorage', (await lsAnswers(page))[q1] === undefined)
  t.check('progress drops to 1 answered after reset', (await page.textContent('.quiz-progress-text')).includes('1 / 32'))

  // re-answer Q1 correctly → record updates to correct, progress back to 2
  await clickCorrect(page, q1)
  await page.waitForSelector('.result-badge')
  t.check('re-answer Q1 correct badge', (await page.getAttribute('.result-badge', 'data-correct')) === 'true')
  const rec = (await lsAnswers(page))[q1]
  t.check('localStorage Q1 updated to correct', rec && rec.correct === true, JSON.stringify(rec))
  t.check('progress back to 2 answered', (await page.textContent('.quiz-progress-text')).includes('2 / 32'))

  // and after re-answering, leaving + same-session return preserves the new state
  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/chapter1/')
  await page.waitForTimeout(300)
  // Position restored to Q1 and progress still counts Q1 answered...
  const posOk = (await curNum(page)) === 1
  const progOk = (await page.textContent('.quiz-progress-text')).includes('2 / 32')
  t.check('same-session after re-answer: position restored to Q1', posOk, await page.textContent('.quiz-num'))
  t.check('same-session after re-answer: progress still 2 answered', progOk)
  // RS-BUG-1 FIXED: restoring onto the initial index (Q1) of an answered card
  // must show its result. QuizPage now bumps restoreNonce on same-session restore
  // so the :key changes and QuizCard remounts with initial-answered=true.
  const resultShown = (await page.$('.quiz-result')) !== null
  t.check('restored answered Q1 (==initial idx) shows its result (RS-BUG-1 fixed)',
    resultShown === true, `expected result shown; resultShown=${resultShown}`)
})

// ============================================================================
// RS-L — Persistence across plain reload (same session): LS answer persists,
//        prev/next position behavior, restored result on the answered card.
// ============================================================================
block('L. [RS] Persistence across reload + nav position', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 1)
  const q1 = await currentQuizId(page)
  await clickCorrect(page, q1)
  await page.waitForSelector('.result-badge')
  // advance to Q3 then reload (same session keeps quiz-state at index 2)
  await page.click('.btn-next'); await page.waitForSelector('.quiz-card')
  await answerAndNext(page) // Q2 -> Q3
  t.check('at Q3 before reload', (await curNum(page)) === 3)

  await page.reload({ waitUntil: 'networkidle' })
  await waitQuiz(page)
  // same-session reload → quiz-state restores Q3 position (NOT first-unanswered jump)
  t.check('reload (same session) restores Q3 position', (await curNum(page)) === 3, await page.textContent('.quiz-num'))
  const ls = await lsAnswers(page)
  t.check('Q1 answer persists in localStorage', ls[q1] && ls[q1].correct === true, JSON.stringify(ls[q1]))
  t.check('2 answered after reload', (await page.textContent('.quiz-progress-text')).includes('2 / 32'))

  // navigate to an answered card → result restored
  await page.click('.btn-prev'); await page.waitForSelector('.quiz-card')
  await page.click('.btn-prev'); await page.waitForSelector('.quiz-card')
  t.check('back to Q1', (await curNum(page)) === 1)
  t.check('Q1 result restored after reload+nav', (await page.$('.quiz-result')) !== null)
})

// ============================================================================
// RS-M — Boundary/anomaly: corrupt quiz-state & out-of-range index are ignored
//        gracefully (falls back to fresh-session resume logic), no crash.
// ============================================================================
block('M. [RS] Corrupt / out-of-range state robustness', async ({ t, browser }) => {
  // Single page/context (chromium stability); clearStorage resets between cases.
  const { page, errors } = await newInstrumentedPage(browser)

  // (1) corrupt JSON in quiz-state → loadState catch → treated as null → resume logic
  await freshChapter(page, 3)
  for (let i = 0; i < 2; i++) await answerAndNext(page, { advance: i < 1 }) // Q1,Q2 answered
  await page.evaluate(() => {
    sessionStorage.setItem('quiz-state-/quiz/chapter3/', '{not valid json')
  })
  await gotoQuiz(page, '/quiz/chapter3/')
  // corrupt state ignored → new-session resume path → Q3 + toast
  t.check('corrupt state ignored, no crash', (await page.$('.quiz-card, .quiz-finish')) !== null)
  t.check('corrupt state → resume logic lands at Q3', (await curNum(page)) === 3, await page.textContent('.quiz-num'))
  t.check('corrupt state → toast shown (treated as new session)', (await page.$('.quiz-resume-toast')) !== null)
  t.check('corrupt state: no JS errors surfaced', errors.pageErrors.length === 0, summarizeErrors(errors))

  // (2) out-of-range currentIndex (>= length) → guarded, falls back to default
  await freshChapter(page, 3)
  for (let i = 0; i < 2; i++) await answerAndNext(page, { advance: i < 1 })
  await page.evaluate(() => {
    sessionStorage.setItem('quiz-state-/quiz/chapter3/', JSON.stringify({ currentIndex: 9999, finished: false }))
  })
  await gotoQuiz(page, '/quiz/chapter3/')
  // savedState != null → same-session branch, but bad index is guarded
  // (must be 0 <= idx < length) so currentIndex keeps its default 0 (Q1), no toast.
  const numOOR = await curNum(page)
  t.check('out-of-range index does not crash', (await page.$('.quiz-card, .quiz-finish')) !== null)
  t.check('out-of-range index guarded (valid position)', numOOR >= 1 && numOOR <= CH_COUNTS[3], await page.textContent('.quiz-num'))
  t.check('out-of-range index: no JS errors', errors.pageErrors.length === 0, summarizeErrors(errors))
  t.info(`out-of-range landed on Q${numOOR} (expected Q1 per guard fallthrough)`)

  // (3) negative currentIndex → guarded (must be >= 0)
  await freshChapter(page, 3)
  await answerAndNext(page, { advance: false })
  await page.evaluate(() => {
    sessionStorage.setItem('quiz-state-/quiz/chapter3/', JSON.stringify({ currentIndex: -5, finished: false }))
  })
  await gotoQuiz(page, '/quiz/chapter3/')
  const numNeg = await curNum(page)
  t.check('negative index guarded → valid position', numNeg >= 1 && numNeg <= CH_COUNTS[3], await page.textContent('.quiz-num'))
})

// ============================================================================
// RS-N — finished=true persisted via quiz-state restores finish even when LS
//        is NOT fully complete (same-session honors saved finished flag).
//        Documents the precise semantics of the finished flag restore.
// ============================================================================
block('N. [RS] Persisted finished flag semantics', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 3)
  // answer just 2 questions (NOT all), then forcibly set finished=true in state
  for (let i = 0; i < 2; i++) await answerAndNext(page, { advance: i < 1 })
  await page.evaluate(() => {
    const k = 'quiz-state-/quiz/chapter3/'
    const cur = JSON.parse(sessionStorage.getItem(k) || '{}')
    sessionStorage.setItem(k, JSON.stringify({ currentIndex: cur.currentIndex ?? 1, finished: true }))
  })
  await gotoQuiz(page, '/quiz/chapter3/')
  // same-session branch honors finished=true → finish screen even though only 2 answered
  t.check('persisted finished=true restores finish screen', (await page.$('.quiz-finish')) !== null)
  const score = await page.textContent('.finish-score')
  // score reflects only the 2 answered (sessionAnswers rebuilt from LS)
  t.check('finish score reflects 2 correct', score.includes('2 /'), score.trim())
  t.info(`finish score on partial-but-finished: ${score.trim()}`)
})

// ============================================================================
// RS-O — Focused regression for RS-BUG-1 + its boundary.
//   (a) BUG case: same-session restore that lands on the SSR/initial index
//       (Q1) of an ANSWERED question shows the card as UNANSWERED.
//   (b) CONTRAST: same-session restore that lands on a DIFFERENT index of an
//       answered question DOES correctly show the result (key changes → fresh
//       QuizCard). This pins the bug to "restored index == initial index".
// ============================================================================
block('O. [RS] Restore-to-answered-card rehydration (RS-BUG-1)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)

  // (a) BUG: answer Q1, navigate Q1->Q2->Q1 (so saved index=0 AND Q1 answered),
  // leave same-session, return → lands on Q1 but result is missing.
  await freshChapter(page, 1)
  const q1 = await currentQuizId(page)
  await clickCorrect(page, q1)
  await page.waitForSelector('.quiz-result')
  await page.click('.btn-next'); await page.waitForSelector('.quiz-card')   // Q2
  await page.click('.btn-prev'); await page.waitForSelector('.quiz-card')   // back to Q1 (writes state idx0)
  t.check('pre-leave: Q1 shows result', (await page.$('.quiz-result')) !== null && (await curNum(page)) === 1)
  const st = await getState(page, '/quiz/chapter1/')
  t.check('pre-leave: saved state index 0', st && st.currentIndex === 0, JSON.stringify(st))

  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/chapter1/')
  await page.waitForTimeout(300)
  t.check('return lands on Q1 (index restored)', (await curNum(page)) === 1, await page.textContent('.quiz-num'))
  t.check('return: progress still counts Q1 answered', (await page.textContent('.quiz-progress-text')).includes('1 / 32'))
  const aResult = (await page.$('.quiz-result')) !== null
  t.check('restored Q1 (==initial idx) shows its result (RS-BUG-1 fixed)',
    aResult === true, `expected result shown; shown=${aResult}`)

  // (b) CONTRAST: answer Q1+Q2, leave from Q2 (saved index=1 ≠ initial idx 0),
  // return → Q2 is answered AND shows the result (key differs → fresh card).
  await freshChapter(page, 1)
  const c1 = await currentQuizId(page); await clickCorrect(page, c1); await page.waitForSelector('.quiz-result')
  await page.click('.btn-next'); await page.waitForSelector('.quiz-card')   // Q2
  const c2 = await currentQuizId(page); await clickCorrect(page, c2); await page.waitForSelector('.quiz-result')
  // currently on Q2 (index 1); state was saved as index 1 when we advanced
  const st2 = await getState(page, '/quiz/chapter1/')
  t.check('contrast: saved state index 1', st2 && st2.currentIndex === 1, JSON.stringify(st2))
  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/chapter1/')
  await page.waitForTimeout(300)
  t.check('contrast: return lands on Q2', (await curNum(page)) === 2, await page.textContent('.quiz-num'))
  const bResult = (await page.$('.quiz-result')) !== null
  t.check('contrast: restored Q2 (≠initial idx) DOES show result', bResult === true,
    `expected result shown; shown=${bResult}`)
  t.info('RS-BUG-1 fixed: restoreNonce in the :key forces a fresh QuizCard on same-session restore, so the answered result shows regardless of whether the restored index equals the initial render index.')
})

// ============================================================================
// RS-P — Same-session state is persisted only on currentIndex/finished CHANGE,
//        not on answering. Documents RS-BUG-2: answering without navigating
//        leaves no quiz-state, so a same-session return is misclassified as a
//        NEW session (jumps to first-unanswered + shows resume toast).
// ============================================================================
block('P. [RS] Answer-without-nav: same-session restore (RS-BUG-2 fixed)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshChapter(page, 1)
  // answer Q1 only — DO NOT navigate. onAnswered now calls saveState(), so
  // quiz-state is written even though currentIndex/finished did not change.
  const q1 = await currentQuizId(page)
  await clickCorrect(page, q1)
  await page.waitForSelector('.quiz-result')
  const st = await getState(page, '/quiz/chapter1/')
  t.check('answer-only: quiz-state written (RS-BUG-2 fixed)', st != null && st.currentIndex === 0, JSON.stringify(st))

  // leave + return SAME session → must be a silent same-session restore (no toast),
  // staying on Q1 with its answered result shown (spec item #2).
  await page.goto(url('/quiz/'), { waitUntil: 'networkidle' })
  await gotoQuiz(page, '/quiz/chapter1/')
  await page.waitForTimeout(300)
  t.check('same-session return stays on Q1 (no first-unanswered jump)',
    (await curNum(page)) === 1, await page.textContent('.quiz-num'))
  t.check('same-session return shows NO resume toast',
    (await page.$('.quiz-resume-toast')) === null)
  t.check('restored Q1 shows its answered result', (await page.$('.quiz-result')) !== null)
  t.check('answer-only: answer still persisted', (await page.textContent('.quiz-progress-text')).includes('1 / 32'))
  t.info('RS-BUG-2 fixed: onAnswered() calls saveState(), so answering (without nav) persists quiz-state and a same-session return is a silent restore (spec #2), not a new-session toast jump.')
})

run()
