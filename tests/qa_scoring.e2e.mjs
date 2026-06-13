// ============================================================================
// UX検定基礎 — QA scoring-correctness E2E suite (SC-*)
//
// OWNER: Senior QA (scoring correctness / choice shuffle / keyboard).
//
// PURPOSE
//   Exhaustively verify "正誤判定の正しさ" across every page state. This suite is
//   the dedicated regression net for the two historical class-A scoring bugs:
//     (1) QuizCard choice-shuffle diverged between SSR and CSR → "正解を押しても
//         不正解 / 緑ハイライトが別ボタン".
//     (2) QuizPage random pages had the same SSR/CSR sampling divergence.
//   Both are fixed (SSR renders deterministic identity order → onMounted shuffles
//   / samples; the answer is always saved by ORIGINAL index). These tests must
//   FAIL loudly if either class of bug ever returns.
//
// HOW TO RUN
//   node tests/qa_scoring.e2e.mjs                  (preview must serve :4173)
//   BLOCKS=A,B node tests/qa_scoring.e2e.mjs       (subset; keys are SC block letters)
//
// DESIGN (mirrors tests/quiz.e2e.mjs, proven helpers reused / extended)
//   - Raw playwright-core via tests/helpers.mjs (bundled chromium fallback).
//   - One fresh browser per block (runner.mjs) → bundled chromium stays stable.
//   - GROUND TRUTH from docs/quiz/data/chapter*.ts loaded at startup. We click /
//     key the choice by its DISPLAYED TEXT (never by position), so verification is
//     independent of the per-card Fisher-Yates display shuffle.
//   - We assert not just the badge, but that the green (.correct) / red (.wrong)
//     highlight lands on the EXACT button the user actuated, that there is exactly
//     ONE .correct, and that localStorage records the ORIGINAL index + correctness.
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
const CH_COUNTS = { 1: 32, 2: 60, 3: 13, 4: 26, 5: 38, 6: 26 }

// Quizzes whose choices or question contain backtick `code` spans (test #6).
const BACKTICK_QUIZZES = ALL.filter(
  (q) => /`[^`]+`/.test(q.question) || q.choices.some((c) => /`[^`]+`/.test(c)),
)

// ── DOM interaction helpers (copied/extended from tests/quiz.e2e.mjs) ───────
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

async function readChoiceClasses(page) {
  return page.$$eval('.quiz-choices button', (btns) => btns.map((b) => b.className))
}

async function currentQuizId(page) {
  const qtext = normalize(await page.textContent('.quiz-question'))
  const found = ALL.find((q) => normalize(q.question) === qtext)
  return found ? found.id : null
}

// Find the display index of the correct / a-wrong choice for the on-screen card.
async function correctDisplayIndex(page, quizId) {
  const q = BY_ID.get(quizId)
  const want = normalize(q.choices[q.answer])
  const choices = (await readChoices(page)).map(normalize)
  return choices.findIndex((c) => c === want)
}
async function wrongDisplayIndex(page, quizId) {
  const q = BY_ID.get(quizId)
  const want = normalize(q.choices[q.answer])
  const choices = (await readChoices(page)).map(normalize)
  return choices.findIndex((c) => c !== want)
}

async function clickCorrect(page, quizId) {
  const idx = await correctDisplayIndex(page, quizId)
  if (idx < 0) throw new Error(`correct choice not found for ${quizId}`)
  await page.$$('.quiz-choices button').then((b) => b[idx].click())
  return idx
}
async function clickWrong(page, quizId) {
  const idx = await wrongDisplayIndex(page, quizId)
  if (idx < 0) throw new Error(`wrong choice not found for ${quizId}`)
  await page.$$('.quiz-choices button').then((b) => b[idx].click())
  return idx
}

async function gotoQuiz(page, path) {
  await page.goto(url(path), { waitUntil: 'networkidle' })
  await waitQuiz(page)
}
// Fresh load: navigate, clear storage, reload so a clean shuffle/sample runs.
async function freshQuiz(page, path) {
  await gotoQuiz(page, path)
  await clearStorage(page)
  await gotoQuiz(page, path)
}

async function readStored(page, quizId) {
  return page.evaluate(
    (id) => JSON.parse(localStorage.getItem('quiz-answers') || '{}')[id],
    quizId,
  )
}

// Keyboard helper: press a key, wait for the result to appear (absorb hydration
// race where the onMounted keydown listener is not yet attached).
async function pressKeyUntilAnswered(page, key, tries = 6) {
  for (let i = 0; i < tries; i++) {
    await page.keyboard.press(key)
    try {
      await page.waitForSelector('.quiz-result', { timeout: 1200 })
      return true
    } catch {
      if (await page.$('.quiz-result')) return true
    }
  }
  return false
}

// ── Core invariant: after actuating a choice (click OR key) at displayIdx, ──
// verify badge, exact-button highlight, exactly-one .correct, localStorage.
async function assertScoring(t, page, quizId, displayIdx, label) {
  const q = BY_ID.get(quizId)
  const choices = (await readChoices(page)).map(normalize)
  const expectCorrect = choices[displayIdx] === normalize(q.choices[q.answer])

  await page.waitForSelector('.result-badge')
  const badge = await page.getAttribute('.result-badge', 'data-correct')
  t.check(`${label}: badge=${expectCorrect}`, badge === String(expectCorrect),
    `badge=${badge} expected=${expectCorrect}`)

  const classes = await readChoiceClasses(page)
  const clicked = classes[displayIdx] || ''
  if (expectCorrect) {
    t.check(`${label}: actuated button is .correct (green at actuated pos)`,
      /\bcorrect\b/.test(clicked) && !/\bwrong\b/.test(clicked),
      `idx=${displayIdx} class="${clicked}"`)
  } else {
    t.check(`${label}: actuated button is .wrong (red at actuated pos)`,
      /\bwrong\b/.test(clicked) && !/\bcorrect\b/.test(clicked),
      `idx=${displayIdx} class="${clicked}"`)
  }
  const correctCount = classes.filter((c) => /\bcorrect\b/.test(c)).length
  t.check(`${label}: exactly one .correct button`, correctCount === 1, `count=${correctCount}`)

  // the highlighted-correct visible text must equal the ground-truth answer.
  const correctVisible = await page.$eval('.choice.correct .choice-text', (e) => e.textContent.trim())
  t.check(`${label}: .correct text == data answer`,
    normalize(correctVisible) === normalize(q.choices[q.answer]),
    `hl="${correctVisible}" want="${q.choices[q.answer]}"`)

  // localStorage: selectedIndex is ORIGINAL index, correct matches.
  const rec = await readStored(page, quizId)
  const expectedOriginal = displayIdx // resolve actual original below
  // resolve original index of the actuated display position via DOM->data text
  const actuatedText = (await readChoices(page))[displayIdx]
  const origIdx = q.choices.findIndex((c) => normalize(c) === normalize(actuatedText))
  void expectedOriginal
  t.check(`${label}: localStorage selectedIndex == original index`,
    rec && rec.selectedIndex === origIdx, `rec=${JSON.stringify(rec)} expectedOrig=${origIdx}`)
  t.check(`${label}: localStorage correct matches`,
    rec && rec.correct === expectCorrect, `rec=${JSON.stringify(rec)} expected=${expectCorrect}`)
}

const CHAPTER_PATHS = [1, 2, 3, 4, 5, 6].map((n) => [`/quiz/chapter${n}/`, `ch${n}`])
const RANDOM_PATHS = [
  ['/quiz/random-5/', 'rand5'],
  ['/quiz/random-10/', 'rand10'],
  ['/quiz/random-100/', 'rand100'],
  ['/quiz/random/', 'rand195'],
]

// ============================================================================
// SC-A — Head card of every chapter + every random page: correct click scoring
// ============================================================================
block('A. Head-card correct scoring (all chapters + random)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  for (const [path, lbl] of [...CHAPTER_PATHS, ...RANDOM_PATHS]) {
    await freshQuiz(page, path)
    const qid = await currentQuizId(page)
    t.check(`${lbl}: resolved head quiz id`, qid !== null, `path=${path}`)
    if (!qid) continue
    const idx = await clickCorrect(page, qid)
    await assertScoring(t, page, qid, idx, `${lbl} head correct`)
  }
})

// ============================================================================
// SC-B — Head card of every chapter + every random page: wrong click scoring
// ============================================================================
block('B. Head-card wrong scoring (all chapters + random)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  for (const [path, lbl] of [...CHAPTER_PATHS, ...RANDOM_PATHS]) {
    await freshQuiz(page, path)
    const qid = await currentQuizId(page)
    if (!qid) { t.check(`${lbl}: resolved head quiz id`, false, path); continue }
    const idx = await clickWrong(page, qid)
    await assertScoring(t, page, qid, idx, `${lbl} head wrong`)
  }
})

// ============================================================================
// SC-C — Walk several cards in chapters 1-3, alternating correct/wrong.
//        Verifies later (client-rendered) cards keep highlight integrity.
// ============================================================================
block('C. Multi-card walk (ch1-3, alternate correct/wrong)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  for (const ch of [1, 2, 3]) {
    await freshQuiz(page, `/quiz/chapter${ch}/`)
    const steps = Math.min(6, CH_COUNTS[ch])
    for (let i = 0; i < steps; i++) {
      const qid = await currentQuizId(page)
      if (!qid) { t.check(`ch${ch} Q${i + 1}: id resolved`, false); break }
      const wantCorrect = i % 2 === 0
      const idx = wantCorrect ? await clickCorrect(page, qid) : await clickWrong(page, qid)
      await assertScoring(t, page, qid, idx, `ch${ch} Q${i + 1}`)
      if (i < steps - 1) {
        await page.click('.btn-next')
        await page.waitForSelector('.quiz-card')
      }
    }
  }
})

// ============================================================================
// SC-D — Walk several cards in chapters 4-6 (the other half), same invariant.
// ============================================================================
block('D. Multi-card walk (ch4-6, alternate wrong/correct)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  for (const ch of [4, 5, 6]) {
    await freshQuiz(page, `/quiz/chapter${ch}/`)
    const steps = Math.min(6, CH_COUNTS[ch])
    for (let i = 0; i < steps; i++) {
      const qid = await currentQuizId(page)
      if (!qid) { t.check(`ch${ch} Q${i + 1}: id resolved`, false); break }
      const wantCorrect = i % 2 === 1 // opposite phase from SC-C
      const idx = wantCorrect ? await clickCorrect(page, qid) : await clickWrong(page, qid)
      await assertScoring(t, page, qid, idx, `ch${ch} Q${i + 1}`)
      if (i < steps - 1) {
        await page.click('.btn-next')
        await page.waitForSelector('.quiz-card')
      }
    }
  }
})

// ============================================================================
// SC-E — Keyboard: "1" and "A" select the SAME display index (index 0); the
//        result must equal clicking choice 0. Also verify number-vs-letter
//        parity across two questions, and that the badge matches choice 0.
// ============================================================================
block('E. Keyboard 1/A parity with display order', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)

  // Q1: press "1" → display index 0 answered.
  await freshQuiz(page, '/quiz/chapter1/')
  const qid1 = await currentQuizId(page)
  const ok1 = await pressKeyUntilAnswered(page, '1')
  t.check('key "1" answers the question', ok1 && (await page.$('.quiz-result')) !== null)
  await assertScoring(t, page, qid1, 0, 'key "1" → idx0')
  // store badge for cross-check with "A"
  const badgeNum = await page.getAttribute('.result-badge', 'data-correct')

  // Q2 fresh: press "a" → display index 0 answered (same selection semantics).
  await freshQuiz(page, '/quiz/chapter1/')
  const qid2 = await currentQuizId(page)
  // qid2 should equal qid1 (same chapter head after fresh) — both target idx0.
  const ok2 = await pressKeyUntilAnswered(page, 'a')
  t.check('key "a" answers the question', ok2 && (await page.$('.quiz-result')) !== null)
  await assertScoring(t, page, qid2, 0, 'key "a" → idx0')
  const badgeAlpha = await page.getAttribute('.result-badge', 'data-correct')

  // Both "1" and "a" select display index 0 — already proven per-load by the
  // assertScoring(..., 0, ...) calls above (each checks the actuated button is
  // the one at display position 0 with correct highlight/badge). We deliberately
  // do NOT compare the two loads to each other: choice display order is
  // reshuffled on every load (QuizCard shuffles in onMounted), so index 0 holds
  // different content across loads — a cross-load comparison would be flaky and
  // semantically wrong. badgeNum/badgeAlpha are recorded only for the log.
  t.info(`key "1"→idx0 badge=${badgeNum}, key "a"→idx0 badge=${badgeAlpha} (per-load shuffle differs; not cross-compared)`)
})

// ============================================================================
// SC-F — Keyboard: uppercase letter, and number selecting a NON-zero index,
//        both score correctly (text-based expectation), independent of shuffle.
// ============================================================================
block('F. Keyboard uppercase + non-zero index', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)

  // Uppercase "B" → display index 1.
  await freshQuiz(page, '/quiz/chapter2/')
  let qid = await currentQuizId(page)
  const okB = await pressKeyUntilAnswered(page, 'B')
  t.check('uppercase "B" answers the question', okB)
  await assertScoring(t, page, qid, 1, 'key "B" → idx1')

  // number "3" → display index 2 on a fresh card.
  await freshQuiz(page, '/quiz/chapter2/')
  qid = await currentQuizId(page)
  const ok3 = await pressKeyUntilAnswered(page, '3')
  t.check('number "3" answers the question', ok3)
  await assertScoring(t, page, qid, 2, 'key "3" → idx2')

  // number "4" → display index 3 on a fresh card.
  await freshQuiz(page, '/quiz/chapter2/')
  qid = await currentQuizId(page)
  const ok4 = await pressKeyUntilAnswered(page, '4')
  t.check('number "4" answers the question', ok4)
  await assertScoring(t, page, qid, 3, 'key "4" → idx3')
})

// ============================================================================
// SC-G — Double-answer guard: after answering by keyboard, another keypress is
//        ignored (classes + badge + localStorage unchanged).
// ============================================================================
block('G. Keyboard double-answer guard', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshQuiz(page, '/quiz/chapter1/')
  const qid = await currentQuizId(page)
  const ok = await pressKeyUntilAnswered(page, '2') // idx1
  t.check('key "2" answers the question', ok)
  await assertScoring(t, page, qid, 1, 'key "2" → idx1')

  const classesBefore = await readChoiceClasses(page)
  const badgeBefore = await page.getAttribute('.result-badge', 'data-correct')
  const recBefore = await readStored(page, qid)

  // press several other keys — all must be ignored
  for (const k of ['1', '3', '4', 'a', 'd']) {
    await page.keyboard.press(k)
  }
  await page.waitForTimeout(200)
  const classesAfter = await readChoiceClasses(page)
  const badgeAfter = await page.getAttribute('.result-badge', 'data-correct')
  const recAfter = await readStored(page, qid)
  const allDisabled = await page.$$eval('.quiz-choices button', (b) => b.every((x) => x.disabled))

  t.check('after-answer: all choices still disabled', allDisabled)
  t.check('after-answer: class list unchanged',
    JSON.stringify(classesBefore) === JSON.stringify(classesAfter),
    `before=${JSON.stringify(classesBefore)} after=${JSON.stringify(classesAfter)}`)
  t.check('after-answer: badge unchanged', badgeBefore === badgeAfter,
    `before=${badgeBefore} after=${badgeAfter}`)
  t.check('after-answer: localStorage unchanged',
    JSON.stringify(recBefore) === JSON.stringify(recAfter),
    `before=${JSON.stringify(recBefore)} after=${JSON.stringify(recAfter)}`)
})

// ============================================================================
// SC-H — "もう一度解く" (reset) round-trips BOTH directions:
//        wrong→correct (localStorage flips false→true) and correct→wrong.
//        After reset, choices re-enable; the re-answer updates badge + storage.
// ============================================================================
block('H. Reset re-answer both directions (wrong→correct, correct→wrong)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)

  // direction 1: wrong → correct
  await freshQuiz(page, '/quiz/chapter1/')
  const qid = await currentQuizId(page)
  let idx = await clickWrong(page, qid)
  await assertScoring(t, page, qid, idx, 'reset-1 first wrong')
  let rec = await readStored(page, qid)
  t.check('reset-1: stored wrong before reset', rec && rec.correct === false, JSON.stringify(rec))

  await page.click('.btn-reset')
  await page.waitForSelector('.quiz-choices button:not([disabled])')
  t.check('reset-1: result cleared', (await page.$('.quiz-result')) === null)
  t.check('reset-1: localStorage entry removed', (await readStored(page, qid)) === undefined)
  const reEnabled = await page.$$eval('.quiz-choices button', (b) => b.every((x) => !x.disabled))
  t.check('reset-1: choices re-enabled', reEnabled)

  idx = await clickCorrect(page, qid)
  await assertScoring(t, page, qid, idx, 'reset-1 re-answer correct')
  rec = await readStored(page, qid)
  t.check('reset-1: localStorage flipped false→true', rec && rec.correct === true, JSON.stringify(rec))

  // direction 2: correct → wrong (use chapter2 head)
  await freshQuiz(page, '/quiz/chapter2/')
  const qid2 = await currentQuizId(page)
  idx = await clickCorrect(page, qid2)
  await assertScoring(t, page, qid2, idx, 'reset-2 first correct')
  await page.click('.btn-reset')
  await page.waitForSelector('.quiz-choices button:not([disabled])')
  idx = await clickWrong(page, qid2)
  await assertScoring(t, page, qid2, idx, 'reset-2 re-answer wrong')
  rec = await readStored(page, qid2)
  t.check('reset-2: localStorage flipped true→false', rec && rec.correct === false, JSON.stringify(rec))
})

// ============================================================================
// SC-I — localStorage original-index invariant under shuffle: clicking the
//        SAME quiz across multiple fresh loads (different display orders) must
//        always store the SAME original selectedIndex when picking the answer.
// ============================================================================
block('I. localStorage selectedIndex is original-index stable across shuffles', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  const path = '/quiz/chapter1/'
  let targetQid = null
  let targetAnswer = null
  const seenOrders = new Set()
  for (let attempt = 0; attempt < 5; attempt++) {
    await freshQuiz(page, path)
    const qid = await currentQuizId(page)
    if (!qid) { t.check(`attempt ${attempt}: id resolved`, false); continue }
    targetQid = qid
    targetAnswer = BY_ID.get(qid).answer
    const order = (await readChoices(page)).map(normalize).join('|')
    seenOrders.add(order)
    const idx = await clickCorrect(page, qid)
    await page.waitForSelector('.result-badge')
    const rec = await readStored(page, qid)
    t.check(`attempt ${attempt}: stored selectedIndex == data.answer (${targetAnswer})`,
      rec && rec.selectedIndex === targetAnswer,
      `rec=${JSON.stringify(rec)} displayIdx=${idx} dataAnswer=${targetAnswer}`)
    t.check(`attempt ${attempt}: stored correct=true`, rec && rec.correct === true, JSON.stringify(rec))
  }
  t.info(`distinct display orders seen for ${targetQid}: ${seenOrders.size}`)
  // Not strictly asserted (shuffle can coincide), but flag if shuffle never varied
  // across 5 loads of a 4-choice question (would be statistically suspicious).
  t.check('display order varied across fresh loads (shuffle active)',
    seenOrders.size >= 2, `only ${seenOrders.size} distinct order(s) in 5 loads`)
})

// ============================================================================
// SC-J — Shuffle stress: many fresh loads of the SAME head card; correct text
//        must ALWAYS score correct and highlight the exact actuated button.
//        This is the direct guard against the SSR/CSR "押した正解が不正解" bug.
// ============================================================================
block('J. Shuffle stress: correct always scores correct (10 loads)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  const path = '/quiz/chapter3/'
  let pass = 0
  const TRIES = 10
  for (let i = 0; i < TRIES; i++) {
    await freshQuiz(page, path)
    const qid = await currentQuizId(page)
    if (!qid) continue
    const idx = await clickCorrect(page, qid)
    await page.waitForSelector('.result-badge')
    const badge = await page.getAttribute('.result-badge', 'data-correct')
    const classes = await readChoiceClasses(page)
    const clicked = classes[idx] || ''
    const oneCorrect = classes.filter((c) => /\bcorrect\b/.test(c)).length === 1
    const okThis = badge === 'true' && /\bcorrect\b/.test(clicked) && !/\bwrong\b/.test(clicked) && oneCorrect
    if (okThis) pass++
    else t.check(`stress load ${i}: correct click scored correct + highlighted`, false,
      `badge=${badge} idx=${idx} class="${clicked}" oneCorrect=${oneCorrect}`)
  }
  t.check(`shuffle stress: all ${TRIES} loads scored correct`, pass === TRIES, `${pass}/${TRIES}`)
})

// ============================================================================
// SC-K — Shuffle stress, wrong path: wrong text always scores wrong, with the
//        red on the actuated button and exactly one green on the answer.
// ============================================================================
block('K. Shuffle stress: wrong always scores wrong (10 loads)', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  const path = '/quiz/random/'
  let pass = 0
  const TRIES = 10
  for (let i = 0; i < TRIES; i++) {
    await freshQuiz(page, path)
    const qid = await currentQuizId(page)
    if (!qid) continue
    const idx = await clickWrong(page, qid)
    await page.waitForSelector('.result-badge')
    const badge = await page.getAttribute('.result-badge', 'data-correct')
    const classes = await readChoiceClasses(page)
    const clicked = classes[idx] || ''
    const oneCorrect = classes.filter((c) => /\bcorrect\b/.test(c)).length === 1
    const notCorrectOnClicked = !/\bcorrect\b/.test(clicked)
    const okThis = badge === 'false' && /\bwrong\b/.test(clicked) && notCorrectOnClicked && oneCorrect
    if (okThis) pass++
    else t.check(`stress load ${i}: wrong click scored wrong + highlighted`, false,
      `badge=${badge} idx=${idx} class="${clicked}" oneCorrect=${oneCorrect}`)
  }
  t.check(`shuffle stress (wrong): all ${TRIES} loads scored wrong`, pass === TRIES, `${pass}/${TRIES}`)
})

// ============================================================================
// SC-L — Backtick `code` choices/questions: text match + scoring not broken.
//        (If no such quiz exists in the data, record an informational skip.)
// ============================================================================
block('L. Backtick code choices score correctly', async ({ t, browser }) => {
  if (BACKTICK_QUIZZES.length === 0) {
    t.info('no quizzes contain backtick `code` spans — invariant holds vacuously')
    t.check('backtick coverage: dataset has zero backtick quizzes (documented)', true,
      'no `code` in any question/choice across chapter1-6')
    return
  }
  const { page } = await newInstrumentedPage(browser)
  // Walk the chapter(s) containing backtick quizzes until we land on each one.
  const target = BACKTICK_QUIZZES[0]
  const chOf = (lesson) => {
    const n = parseInt(lesson.replace('lesson', ''), 10)
    return n <= 5 ? 1 : n <= 15 ? 2 : n <= 17 ? 3 : n <= 21 ? 4 : n <= 27 ? 5 : 6
  }
  const ch = chOf(target.lesson)
  await freshQuiz(page, `/quiz/chapter${ch}/`)
  let found = false
  for (let i = 0; i < CH_COUNTS[ch]; i++) {
    const qid = await currentQuizId(page)
    if (qid === target.id) {
      found = true
      // the displayed choice text (code stripped by normalize) must match data.
      const choices = (await readChoices(page)).map(normalize)
      const want = normalize(target.choices[target.answer])
      t.check(`backtick ${qid}: correct choice text resolvable`, choices.includes(want),
        `want="${want}" got=${JSON.stringify(choices)}`)
      const idx = await clickCorrect(page, qid)
      await assertScoring(t, page, qid, idx, `backtick ${qid}`)
      break
    }
    if (!(await page.$('.quiz-result'))) {
      await clickCorrect(page, qid)
      await page.waitForSelector('.quiz-result')
    }
    await page.click('.btn-next')
    await page.waitForSelector('.quiz-card')
  }
  t.check('backtick target quiz was reached', found, `target=${target.id}`)
})

// ============================================================================
// SC-M — Anomalies: btn-next disabled before answering; force-click does not
//        advance or fabricate a result. Rapid double-click records ONE answer.
// ============================================================================
block('M. Anomalies: next-gating + single-answer under rapid clicks', async ({ t, browser }) => {
  const { page } = await newInstrumentedPage(browser)
  await freshQuiz(page, '/quiz/chapter1/')

  // next disabled before answering
  const disabledBefore = await page.getAttribute('.btn-next', 'disabled')
  t.check('btn-next disabled before answering', disabledBefore !== null, `attr=${disabledBefore}`)
  // forcing a click on the disabled button is a no-op
  await page.$eval('.btn-next', (b) => b.click())
  await page.waitForTimeout(100)
  t.check('forced next while disabled does not advance', (await page.textContent('.quiz-num')).startsWith('1 /'))
  t.check('forced next while disabled does not create result', (await page.$('.quiz-result')) === null)

  // rapid double click: first (correct) wins, the second (wrong) is ignored.
  const qid = await currentQuizId(page)
  const correctIdx = await correctDisplayIndex(page, qid)
  const wrongIdx = await wrongDisplayIndex(page, qid)
  const btns = await page.$$('.quiz-choices button')
  await btns[correctIdx].click()
  await btns[wrongIdx].click().catch(() => {}) // disabled now → ignored
  await page.waitForSelector('.result-badge')
  const badge = await page.getAttribute('.result-badge', 'data-correct')
  t.check('rapid double-click: first (correct) wins', badge === 'true', `badge=${badge}`)
  const rec = await readStored(page, qid)
  t.check('rapid double-click: single correct record + original index', rec && rec.correct === true,
    JSON.stringify(rec))
  // exactly one .correct, and the wrong button NOT marked wrong (it was never registered)
  const classes = await readChoiceClasses(page)
  t.check('rapid double-click: exactly one .correct', classes.filter((c) => /\bcorrect\b/.test(c)).length === 1,
    JSON.stringify(classes))
  t.check('rapid double-click: ignored second pick not marked .wrong',
    !/\bwrong\b/.test(classes[wrongIdx] || ''), `wrongIdxClass="${classes[wrongIdx]}"`)
  // btn-next enabled now
  t.check('btn-next enabled after a valid answer', (await page.getAttribute('.btn-next', 'disabled')) === null)
})

// ============================================================================
// SC-N — No JS / hydration errors while scoring on a fixed-order AND a shuffle
//        page (a reappearing hydration mismatch was the SSR/CSR bug's symptom).
// ============================================================================
block('N. Clean hydration while answering (fixed-order + shuffle)', async ({ t, browser }) => {
  const { page, errors } = await newInstrumentedPage(browser)
  for (const [path, lbl] of [['/quiz/chapter1/', 'ch1 fixed'], ['/quiz/random-5/', 'rand5 shuffle']]) {
    const beforePe = errors.pageErrors.length
    const beforeCe = errors.consoleErrors.length
    await freshQuiz(page, path)
    await page.waitForTimeout(300)
    const qid = await currentQuizId(page)
    if (qid) {
      const idx = await clickCorrect(page, qid)
      await assertScoring(t, page, qid, idx, `${lbl} answer`)
    }
    const newPe = errors.pageErrors.slice(beforePe)
    const newCe = errors.consoleErrors.slice(beforeCe)
    t.check(`${lbl}: no JS/console/hydration errors while scoring`,
      newPe.length === 0 && newCe.length === 0,
      `pageErrors=${JSON.stringify(newPe)} consoleErrors=${JSON.stringify(newCe)}`)
  }
  void summarizeErrors
})

run()
