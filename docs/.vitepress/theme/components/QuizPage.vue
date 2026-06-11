<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Quiz, ChapterId } from '../../../quiz/types'
import { STORAGE_KEY, STREAK_KEY, chapters } from '../../../quiz/types'
import type { StoredAnswer, StoredAnswers } from '../../../quiz/types'
import QuizCard from './QuizCard.vue'

const props = defineProps<{
  quizzes: Quiz[]
  title: string
  shuffle?: boolean
  chapter?: ChapterId
  randomSample?: number
  hideReviewCta?: boolean
}>()

function sampleSessionKey(): string | null {
  if (props.randomSample != null && props.randomSample > 0) {
    return `quiz-sample-n${props.randomSample}`
  }
  if (props.shuffle) {
    return `quiz-sample-shuffle-${props.quizzes.length}`
  }
  return null
}

function loadSampleIds(): string[] | null {
  const key = sampleSessionKey()
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSampleIds(quizzes: Quiz[]) {
  const key = sampleSessionKey()
  if (!key || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(quizzes.map((q) => q.id)))
  } catch {
    /* ignore quota errors */
  }
}

function sampleQuizzes(force = false): Quiz[] {
  // 同じタブ内で再マウントした場合は前回の抽選結果を復元する。
  // 戻る操作やレッスン → 戻る、別ページ → 戻る でもセットが変わらない。
  if (!force && (props.randomSample != null || props.shuffle)) {
    const ids = loadSampleIds()
    if (ids && ids.length > 0) {
      const byId = new Map(props.quizzes.map((q) => [q.id, q]))
      const restored = ids.map((id) => byId.get(id)).filter((q): q is Quiz => q != null)
      const expected =
        props.randomSample != null
          ? Math.min(props.randomSample, props.quizzes.length)
          : props.quizzes.length
      if (restored.length === expected) return restored
    }
  }

  let result: Quiz[]
  if (props.randomSample != null && props.randomSample > 0) {
    result = shuffleArray(props.quizzes).slice(0, props.randomSample)
  } else if (props.shuffle) {
    result = shuffleArray(props.quizzes)
  } else {
    return props.quizzes
  }
  saveSampleIds(result)
  return result
}

function chapterIdFromLesson(lesson: string): ChapterId | null {
  const m = lesson.match(/lesson(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  for (const ch of chapters) {
    const start = parseInt(ch.lessonRange[0].replace('lesson', ''), 10)
    const end = parseInt(ch.lessonRange[1].replace('lesson', ''), 10)
    if (n >= start && n <= end) return ch.id
  }
  return null
}

function chapterLabel(lesson: string): string {
  const id = chapterIdFromLesson(lesson)
  if (id == null) return ''
  return `${id}章`
}

const nextChapter = computed(() => {
  if (props.chapter == null) return null
  const next = chapters.find((c) => c.id === (props.chapter as number) + 1)
  return next ?? null
})

const wrongQuizCount = computed(
  () => orderedQuizzes.value.length - correctCount.value,
)

function loadAnswers(): StoredAnswers {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function recordStudyDay() {
  if (typeof window === 'undefined') return
  const today = new Date().toISOString().slice(0, 10)
  let dates: string[] = []
  try {
    dates = JSON.parse(localStorage.getItem(STREAK_KEY) || '[]')
  } catch {
    dates = []
  }
  if (!dates.includes(today)) {
    dates.push(today)
    if (dates.length > 365) dates = dates.slice(-365)
    localStorage.setItem(STREAK_KEY, JSON.stringify(dates))
  }
}

function saveAnswer(quizId: string, correct: boolean, selectedIndex: number) {
  const data = loadAnswers()
  data[quizId] = { correct, ts: Date.now(), selectedIndex }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  storedAnswers.value = data
  recordStudyDay()
}

function renderText(s: string): string {
  const escaped = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const orderedQuizzes = ref<Quiz[]>(sampleQuizzes())

const currentIndex = ref(0)
const sessionAnswers = ref<Record<string, { correct: boolean; selectedIndex: number | null }>>({})
const finished = ref(false)
const resumedFrom = ref(0)

const currentQuiz = computed<Quiz | null>(() => orderedQuizzes.value[currentIndex.value] ?? null)

const correctCount = computed(
  () => Object.values(sessionAnswers.value).filter((v) => v.correct).length,
)

const answeredCount = computed(() => Object.keys(sessionAnswers.value).length)

const progress = computed(() =>
  orderedQuizzes.value.length > 0
    ? (answeredCount.value / orderedQuizzes.value.length) * 100
    : 0,
)

const isCurrentAnswered = computed(
  () => currentQuiz.value != null && sessionAnswers.value[currentQuiz.value.id] !== undefined,
)

const currentAnswer = computed(() =>
  currentQuiz.value != null ? sessionAnswers.value[currentQuiz.value.id] ?? null : null,
)

function onAnswered(quizId: string, correct: boolean, selectedIndex: number) {
  sessionAnswers.value[quizId] = { correct, selectedIndex }
  saveAnswer(quizId, correct, selectedIndex)
}

function onReset(quizId: string) {
  delete sessionAnswers.value[quizId]
  const data = loadAnswers()
  delete data[quizId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  storedAnswers.value = data
}

function next() {
  if (currentIndex.value + 1 >= orderedQuizzes.value.length) {
    finished.value = true
  } else {
    currentIndex.value++
  }
}

function prev() {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

function stateSessionKey(): string | null {
  if (typeof window === 'undefined') return null
  return `quiz-state-${window.location.pathname}`
}

function loadState(): { currentIndex: number; finished: boolean } | null {
  const key = stateSessionKey()
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveState() {
  const key = stateSessionKey()
  if (!key) return
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        currentIndex: currentIndex.value,
        finished: finished.value,
      }),
    )
  } catch {
    /* ignore */
  }
}

function dismissResumeToast() {
  resumedFrom.value = 0
}

function restartFromBeginning() {
  // 再開通知から「1問目から始める」: restart() を流用して章の localStorage を
  // クリアし、resumeトーストも消す
  restart()
  resumedFrom.value = 0
}

function restart() {
  if (props.randomSample != null || props.shuffle) {
    orderedQuizzes.value = sampleQuizzes(true)
  } else {
    // 章モードの「同じ問題でもう一度」: localStorage の回答記録もリセット
    // （そうしないと別ページに移動して戻ったとき再び結果画面になる）
    const data = loadAnswers()
    let changed = false
    for (const q of orderedQuizzes.value) {
      if (data[q.id] !== undefined) {
        delete data[q.id]
        changed = true
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      storedAnswers.value = data
    }
  }
  currentIndex.value = 0
  sessionAnswers.value = {}
  finished.value = false
  // watch で自動的に saveState される
}

const storedAnswers = ref<StoredAnswers>({})

// state を sessionStorage に保存し、戻る操作で view 位置が保たれるようにする
watch([currentIndex, finished], () => saveState())

onMounted(() => {
  const stored = loadAnswers()
  storedAnswers.value = stored

  const savedState = loadState()
  if (savedState != null) {
    // 同じタブで戻ってきた: 最後の view 位置を復元する
    for (const q of orderedQuizzes.value) {
      if (stored[q.id] !== undefined) {
        sessionAnswers.value[q.id] = {
          correct: stored[q.id].correct,
          selectedIndex: stored[q.id].selectedIndex ?? null,
        }
      }
    }
    if (
      typeof savedState.currentIndex === 'number' &&
      savedState.currentIndex >= 0 &&
      savedState.currentIndex < orderedQuizzes.value.length
    ) {
      currentIndex.value = savedState.currentIndex
    }
    if (typeof savedState.finished === 'boolean') {
      finished.value = savedState.finished
    }
    return
  }

  // 新規セッション: 既存の "前回の続き" 再開ロジック
  if (!props.shuffle) {
    for (const q of orderedQuizzes.value) {
      if (stored[q.id] !== undefined) {
        sessionAnswers.value[q.id] = {
          correct: stored[q.id].correct,
          selectedIndex: stored[q.id].selectedIndex ?? null,
        }
      }
    }
    const firstUnanswered = orderedQuizzes.value.findIndex((q) => stored[q.id] === undefined)
    if (firstUnanswered === -1) {
      // 全問回答済み → 即結果画面
      finished.value = true
    } else if (firstUnanswered > 0) {
      resumedFrom.value = firstUnanswered + 1
      currentIndex.value = firstUnanswered
    } else {
      currentIndex.value = firstUnanswered
    }
  }
})

</script>

<template>
  <div class="quiz-page">
    <p class="quiz-page-back">
      <a href="/quiz/">← ドリル一覧へ</a>
    </p>

    <div v-if="!finished">
      <div v-if="resumedFrom > 0" class="quiz-resume-toast" role="status" aria-live="polite">
        <span class="quiz-resume-toast-text">前回の続き、{{ resumedFrom }} 問目から再開しました</span>
        <div class="quiz-resume-toast-actions">
          <button
            type="button"
            class="quiz-resume-toast-restart"
            @click="restartFromBeginning"
          >1問目から始める</button>
          <button
            type="button"
            class="quiz-resume-toast-close"
            aria-label="通知を閉じる"
            @click="dismissResumeToast"
          >×</button>
        </div>
      </div>
      <div class="quiz-progress-bar-wrap" role="progressbar" aria-valuemin="0" :aria-valuenow="answeredCount" :aria-valuemax="orderedQuizzes.length">
        <div class="quiz-progress-bar" :style="{ width: progress + '%' }" />
      </div>
      <p class="quiz-progress-text">
        {{ answeredCount }} / {{ orderedQuizzes.length }} 問回答済み
        <span v-if="orderedQuizzes.length - answeredCount > 0" class="quiz-remaining">
          （あと {{ orderedQuizzes.length - answeredCount }} 問・約 {{ Math.max(1, Math.ceil((orderedQuizzes.length - answeredCount) * 0.5)) }} 分）
        </span>
      </p>
      <p class="quiz-keyboard-hint">
        キーボード: <kbd>A</kbd><kbd>B</kbd><kbd>C</kbd><kbd>D</kbd>または<kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd>で選択
      </p>

      <QuizCard
        v-if="currentQuiz"
        :key="currentQuiz.id"
        :quiz="currentQuiz"
        :index="currentIndex"
        :total="orderedQuizzes.length"
        :initial-answered="currentAnswer != null"
        :initial-correct="currentAnswer?.correct ?? null"
        :initial-selected-index="currentAnswer?.selectedIndex ?? null"
        @answered="onAnswered"
        @reset="onReset"
      />

      <div class="quiz-nav">
        <div>
          <button
            v-if="currentIndex > 0"
            class="btn-prev"
            type="button"
            @click="prev"
          >
            前の問題
          </button>
        </div>
        <div>
          <button
            class="btn-next"
            type="button"
            :disabled="!isCurrentAnswered"
            @click="next"
          >
            {{ currentIndex + 1 < orderedQuizzes.length ? '次の問題' : '結果を見る' }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="quiz-finish">
      <p class="finish-score">
        結果: <strong>{{ correctCount }} / {{ orderedQuizzes.length }}</strong> 問正解
      </p>
      <p class="finish-rate">
        正答率 {{ orderedQuizzes.length > 0 ? Math.round((correctCount / orderedQuizzes.length) * 100) : 0 }}%
      </p>

      <div v-if="correctCount < orderedQuizzes.length" class="finish-section">
        <p class="finish-section-heading finish-section-wrong">これから覚えたい {{ orderedQuizzes.length - correctCount }} 問</p>
        <div class="finish-list">
          <details
            v-for="(q, i) in orderedQuizzes.filter(q => !sessionAnswers[q.id]?.correct)"
            :key="q.id"
            class="finish-row finish-row-detail"
            data-correct="false"
          >
            <summary class="finish-row-summary">
              <span class="finish-row-num">{{ orderedQuizzes.indexOf(q) + 1 }}</span>
              <span class="finish-row-mark">×</span>
              <span class="finish-row-body">
                <span class="finish-row-q" v-html="renderText(q.question)" />
                <span class="finish-row-meta">
                  <span v-if="q.lesson" class="finish-row-chapter">{{ chapterLabel(q.lesson) }}</span>
                  <span class="finish-row-answer" v-html="`正解: ${renderText(q.choices[q.answer])}`" />
                </span>
              </span>
              <span class="finish-row-toggle" aria-hidden="true"></span>
            </summary>
            <p class="finish-row-explanation" v-html="renderText(q.explanation)" />
            <p v-if="q.lesson" class="finish-row-lesson-link">
              <a :href="`/lessons/${q.lesson}/`">{{ q.lesson }} を読み直す →</a>
            </p>
          </details>
        </div>
      </div>

      <details v-if="correctCount > 0" class="finish-section finish-section-collapsible">
        <summary class="finish-section-heading finish-section-correct finish-section-toggle">
          正解 {{ correctCount }} 問を表示
        </summary>
        <div class="finish-list">
          <div
            v-for="(q, i) in orderedQuizzes.filter(q => sessionAnswers[q.id]?.correct)"
            :key="q.id"
            class="finish-row"
            data-correct="true"
          >
            <span class="finish-row-num">{{ orderedQuizzes.indexOf(q) + 1 }}</span>
            <span class="finish-row-mark">○</span>
            <span class="finish-row-body">
              <span class="finish-row-q" v-html="renderText(q.question)" />
              <span v-if="q.lesson" class="finish-row-chapter finish-row-chapter-correct">{{ chapterLabel(q.lesson) }}</span>
            </span>
          </div>
        </div>
      </details>

      <div class="finish-actions">
        <a
          v-if="wrongQuizCount > 0 && !props.hideReviewCta"
          href="/quiz/review/"
          class="btn-restart btn-review-cta"
        >
          間違えた {{ wrongQuizCount }} 問だけ復習する →
        </a>
        <button class="btn-restart" type="button" @click="restart">
          {{
            props.randomSample != null
              ? `別の ${orderedQuizzes.length} 問でもう一度`
              : props.shuffle
                ? '順番をシャッフルしてもう一度'
                : '同じ問題でもう一度'
          }}
        </button>
        <a v-if="nextChapter" :href="`/quiz/chapter${nextChapter.id}/`" class="btn-restart btn-next-chapter">
          次の章へ（{{ nextChapter.id }}章 {{ nextChapter.title }}）→
        </a>
        <a href="/quiz/" class="btn-list">ドリル一覧へ</a>
      </div>
    </div>

  </div>
</template>

<style scoped>
.quiz-page {
  max-width: 720px;
  margin: 0 auto;
}

.quiz-page-back {
  margin: -0.5rem 0 1rem;
  font-size: 0.85rem;
}

.quiz-page-back a {
  color: var(--vp-c-text-2);
  text-decoration: none;
}

.quiz-page-back a:hover {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.quiz-resume-toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  padding: 0.6rem 0.85rem;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: 4px;
  font-size: 0.88rem;
}

.quiz-resume-toast-text {
  flex: 1;
  min-width: 0;
}

.quiz-resume-toast-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.quiz-resume-toast-restart {
  min-height: 32px;
  padding: 0.3rem 0.7rem;
  background: var(--vp-c-brand-1);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.quiz-resume-toast-restart:hover,
.quiz-resume-toast-restart:focus-visible {
  background: var(--vp-c-brand-2);
}

.quiz-resume-toast-restart:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.quiz-resume-toast-close {
  flex-shrink: 0;
  min-width: 32px;
  min-height: 32px;
  padding: 0.1rem 0.5rem;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 4px;
  color: inherit;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
}

.quiz-resume-toast-close:hover,
.quiz-resume-toast-close:focus-visible {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.quiz-resume-toast-close:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.quiz-progress-bar-wrap {
  height: 6px;
  background: var(--vp-c-bg-mute);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.4rem;
}

.quiz-progress-bar {
  height: 100%;
  background: var(--vp-c-brand-2);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.quiz-progress-text {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  margin-bottom: 1rem;
}

.quiz-remaining {
  color: var(--vp-c-text-3);
}

.quiz-keyboard-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  margin: 0 0 1rem;
}

.quiz-keyboard-hint kbd {
  display: inline-block;
  padding: 0.05rem 0.35rem;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.7rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 3px;
}

@media (hover: none) and (pointer: coarse), (max-width: 640px) {
  .quiz-keyboard-hint {
    display: none;
  }
}

.quiz-nav {
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 640px) {
  .quiz-nav {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin: 1rem -1rem 0;
    padding: 0.75rem 1rem;
    background: var(--vp-c-bg);
    border-top: 1px solid var(--vp-c-divider);
  }
}

.btn-prev {
  min-height: 44px;
  padding: 0.65rem 1.4rem;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.btn-prev:hover {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-text-1);
}

.btn-prev:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.btn-next:focus-visible,
.btn-restart:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.btn-next,
.btn-restart {
  min-height: 44px;
  padding: 0.65rem 1.4rem;
  background: #1e3a8a;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.btn-next:disabled {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-3);
  cursor: default;
  opacity: 0.6;
}

.dark .btn-next:disabled {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-3);
}

.btn-next:hover,
.btn-restart:hover {
  background: #1e40af;
  color: #fff;
}

.dark .btn-next,
.dark .btn-restart {
  background: #2563eb;
}

.dark .btn-next:hover,
.dark .btn-restart:hover {
  background: #1d4ed8;
  color: #fff;
}

.quiz-finish {
  padding: 1.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}

.finish-score {
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.finish-rate {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.5rem;
}


.finish-section {
  margin-bottom: 1.25rem;
}

.finish-section-heading {
  font-size: 0.82rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.finish-section-wrong {
  color: #dc2626;
}

.finish-section-correct {
  color: #16a34a;
}

.finish-section-collapsible summary {
  cursor: pointer;
  user-select: none;
  margin-bottom: 0.5rem;
  list-style: none;
}

.finish-section-collapsible summary::-webkit-details-marker {
  display: none;
}

.finish-section-collapsible[open] > summary {
  /* swap ▼ to ▲ when open */
}

.finish-section-collapsible[open] summary {
  margin-bottom: 0.75rem;
}

.finish-section-toggle::before {
  content: '▼ ';
  font-size: 0.75rem;
}

.finish-section-collapsible[open] .finish-section-toggle::before {
  content: '▲ ';
}

.dark .finish-section-wrong {
  color: #fca5a5;
}

.dark .finish-section-correct {
  color: #86efac;
}

.finish-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 360px;
  overflow-y: auto;
}

.finish-row {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.85rem;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  background: var(--vp-c-bg);
}

.finish-row-detail {
  display: block;
  padding: 0;
}

.finish-row-summary {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.55rem 0.6rem;
  cursor: pointer;
  list-style: none;
}

.finish-row-summary::-webkit-details-marker {
  display: none;
}

.finish-row-detail[open] .finish-row-summary {
  border-bottom: 1px solid var(--vp-c-divider);
}

.finish-row-explanation {
  margin: 0;
  padding: 0.6rem 0.8rem;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--vp-c-text-1);
}

.finish-row-lesson-link {
  margin: 0;
  padding: 0 0.8rem 0.6rem;
  font-size: 0.78rem;
}

.finish-row-lesson-link a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.finish-row[data-correct='true'] .finish-row-mark {
  color: #16a34a;
  font-weight: 700;
}

.finish-row[data-correct='false'] .finish-row-mark {
  color: #dc2626;
  font-weight: 700;
}

.dark .finish-row[data-correct='true'] .finish-row-mark {
  color: #86efac;
}

.dark .finish-row[data-correct='false'] .finish-row-mark {
  color: #fca5a5;
}

.finish-row-num {
  color: var(--vp-c-text-2);
  min-width: 1.5em;
}

.finish-row-mark {
  min-width: 1em;
  text-align: center;
}

.finish-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-list {
  font-size: 0.9rem;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.btn-review-cta {
  display: inline-block;
  text-decoration: none;
  background: #b91c1c;
}

.btn-review-cta:hover {
  background: #991b1b;
  color: #fff;
}

.dark .btn-review-cta {
  background: #b91c1c;
}

.dark .btn-review-cta:hover {
  background: #dc2626;
  color: #fff;
}

.btn-next-chapter {
  display: inline-block;
  text-decoration: none;
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-2);
}

.btn-next-chapter:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-brand-1);
}

.finish-row-meta {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.15rem;
}

.finish-row-chapter {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1em 0.45em;
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-2);
  border-radius: 3px;
  letter-spacing: 0.02em;
}

.finish-row-chapter-correct {
  margin-left: 0.4rem;
  align-self: center;
}

.finish-row-toggle {
  flex-shrink: 0;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  align-self: center;
  margin-left: auto;
}

.finish-row-toggle::before {
  content: '▼ 解説を読む';
}

.finish-row-detail[open] .finish-row-toggle {
  color: var(--vp-c-text-2);
}

.finish-row-detail[open] .finish-row-toggle::before {
  content: '▲ 閉じる';
}

.dark .btn-list {
  color: var(--vp-c-brand-1);
}

.quiz-prev-results {
  margin-top: 1.5rem;
  padding: 0.6rem 0.9rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.quiz-prev-results p {
  margin: 0;
}

.finish-row-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.finish-row-q {
  flex: 1;
  line-height: 1.5;
}

.finish-row-answer {
  font-size: 0.78rem;
  color: #b91c1c;
  line-height: 1.4;
}

.dark .finish-row-answer {
  color: #fca5a5;
}

.finish-row-q :deep(code),
.finish-row-answer :deep(code) {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.875em;
  background: var(--vp-c-bg-mute);
  padding: 0.15em 0.35em;
  border-radius: 3px;
  color: var(--vp-c-text-1);
}
</style>
