<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { chapters, STORAGE_KEY, STREAK_KEY } from '../../../quiz/types'
import type { StoredAnswers } from '../../../quiz/types'
import { quizzesByChapter } from '../../../quiz/data/index'

const stored = ref<StoredAnswers>({})
const studyDates = ref<string[]>([])

onMounted(() => {
  if (typeof window === 'undefined') return
  try {
    stored.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    stored.value = {}
  }
  try {
    studyDates.value = JSON.parse(localStorage.getItem(STREAK_KEY) || '[]')
  } catch {
    studyDates.value = []
  }
})

const streak = computed(() => {
  if (studyDates.value.length === 0) return 0
  const sorted = [...studyDates.value].sort()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let count = 0
  for (let offset = 0; ; offset++) {
    const d = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    if (sorted.includes(key)) count++
    else if (offset === 0) continue
    else break
  }
  return count
})

const chapterStats = computed(() =>
  chapters.map((ch) => {
    const quizzes = quizzesByChapter[ch.id] ?? []
    const total = quizzes.length
    const answered = quizzes.filter((q) => stored.value[q.id] !== undefined).length
    const correct = quizzes.filter((q) => stored.value[q.id]?.correct).length
    const wrong = answered - correct
    const easy = quizzes.filter((q) => q.difficulty === 'easy').length
    const normal = quizzes.filter((q) => q.difficulty === 'normal').length
    const hard = quizzes.filter((q) => q.difficulty === 'hard').length
    return { ...ch, total, answered, correct, wrong, easy, normal, hard }
  }),
)

const totalAnswered = computed(() =>
  chapterStats.value.reduce((acc, c) => acc + c.answered, 0),
)
const totalQuestions = computed(() =>
  chapterStats.value.reduce((acc, c) => acc + c.total, 0),
)
const totalCorrect = computed(() =>
  chapterStats.value.reduce((acc, c) => acc + c.correct, 0),
)

const wrongCount = computed(() =>
  chapterStats.value.reduce((acc, c) => acc + (c.answered - c.correct), 0),
)

const continueChapter = computed(() => {
  let latestTs = 0
  let latestChapterId: number | null = null
  for (const ch of chapterStats.value) {
    if (ch.answered === 0 || ch.answered === ch.total) continue
    const quizzes = quizzesByChapter[ch.id] ?? []
    const maxTs = Math.max(...quizzes.map((q) => stored.value[q.id]?.ts ?? 0))
    if (maxTs > latestTs) {
      latestTs = maxTs
      latestChapterId = ch.id
    }
  }
  return latestChapterId != null
    ? chapterStats.value.find((c) => c.id === latestChapterId) ?? null
    : null
})

function resetProgress() {
  if (!confirm('回答履歴をすべて削除しますか？この操作は元に戻せません。')) return
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STREAK_KEY)
  // ドリル各ページに残っている sessionStorage 上の view 位置・抽選結果も
  // 一掃する。残しておくと、リセット直後に章ページへ行ったとき
  // 「全問正解の finish 画面」がそのまま見えてしまう
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key && (key.startsWith('quiz-state-') || key.startsWith('quiz-sample-'))) {
        sessionStorage.removeItem(key)
      }
    }
  } catch {
    /* ignore */
  }
  stored.value = {}
  studyDates.value = []
}
</script>

<template>
  <div class="quiz-top">
    <div class="quiz-top-summary">
      <div class="summary-item">
        <span class="summary-label">回答済み</span>
        <span class="summary-value">{{ totalAnswered }} / {{ totalQuestions }}</span>
      </div>
      <div class="summary-item summary-item-correct">
        <span class="summary-label">正解数</span>
        <span class="summary-value">
          {{ totalCorrect }}<span class="summary-value-sub">/ {{ totalQuestions }}</span>
        </span>
      </div>
      <div class="summary-item">
        <span class="summary-label">正答率</span>
        <span class="summary-value">
          {{ totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0 }}%
        </span>
      </div>
      <div v-if="streak > 0" class="summary-item summary-item-streak">
        <span class="summary-label">連続学習</span>
        <span class="summary-value">{{ streak }} 日</span>
      </div>
    </div>

    <a v-if="continueChapter" :href="`/quiz/chapter${continueChapter.id}/`" class="continue-banner">
      <span class="continue-banner-label">続きから</span>
      <span class="continue-banner-body">
        <span class="continue-banner-title">{{ continueChapter.title }}</span>
        <span class="continue-banner-sub">
          {{ continueChapter.answered }} / {{ continueChapter.total }} 問 — 残り {{ continueChapter.total - continueChapter.answered }} 問
        </span>
      </span>
      <span class="continue-banner-arrow">→</span>
    </a>

    <a v-if="wrongCount > 0" href="/quiz/review/" class="review-banner">
      <span class="review-banner-icon">↻</span>
      <span class="review-banner-body">
        <span class="review-banner-text">
          <strong>{{ wrongCount }} 問</strong>、もう一度ふりかえってみよう
        </span>
        <span class="review-banner-sub">前回間違えた問題だけを集めて出題します</span>
      </span>
      <span class="review-banner-arrow">→</span>
    </a>

    <div class="chapter-grid">
      <a
        v-for="ch in chapterStats"
        :key="ch.id"
        :href="`/quiz/chapter${ch.id}/`"
        class="chapter-card"
      >
        <div class="chapter-card-header">
          <span class="chapter-num">{{ ch.id }}</span>
          <span class="chapter-title">{{ ch.title }}</span>
          <span
            v-if="ch.total > 0 && ch.answered === ch.total && ch.wrong === 0"
            class="chapter-complete"
            aria-label="全問正解"
          >達成</span>
        </div>
        <div class="chapter-bar-wrap">
          <div
            class="chapter-bar"
            :style="{ width: ch.total > 0 ? (ch.answered / ch.total) * 100 + '%' : '0%' }"
          />
        </div>
        <div class="chapter-stats">
          <span>{{ ch.answered }} / {{ ch.total }} 問</span>
          <span v-if="ch.wrong > 0" class="chapter-wrong">要復習 {{ ch.wrong }}</span>
          <span v-else-if="ch.answered > 0" class="chapter-rate">
            正解 {{ Math.round((ch.correct / ch.answered) * 100) }}%
          </span>
        </div>
        <div class="chapter-difficulty">
          <span class="diff-chip diff-easy" :title="`やさしい ${ch.easy} 問`">易 {{ ch.easy }}</span>
          <span class="diff-chip diff-normal" :title="`ふつう ${ch.normal} 問`">中 {{ ch.normal }}</span>
          <span class="diff-chip diff-hard" :title="`むずかしい ${ch.hard} 問`">難 {{ ch.hard }}</span>
        </div>
        <div v-if="ch.answered < ch.total" class="chapter-time">
          目安 約 {{ Math.max(1, Math.ceil((ch.total - ch.answered) * 0.5)) }} 分
        </div>
      </a>
    </div>

    <div class="quiz-top-actions-group">
      <p class="quiz-top-actions-label">ランダム出題</p>
      <div class="quiz-top-actions">
        <a href="/quiz/random-5/" class="btn-action btn-action-secondary">5 問だけ</a>
        <a href="/quiz/random-10/" class="btn-action btn-action-secondary">10 問だけ</a>
        <a href="/quiz/random/" class="btn-action">全 {{ totalQuestions }} 問から</a>
      </div>
    </div>

    <div class="quiz-top-actions-group">
      <a
        v-if="wrongCount > 0"
        href="/quiz/review/"
        class="btn-action btn-review"
      >
        間違えた問題を復習（{{ wrongCount }} 件）
      </a>
      <p v-else class="btn-action btn-review btn-review-disabled" aria-disabled="true">
        間違えた問題を復習（0 件 — まずは章を解いてみましょう）
      </p>
    </div>

    <div v-if="totalAnswered > 0" class="quiz-top-reset">
      <button class="btn-reset-progress" type="button" @click="resetProgress">
        回答履歴をリセット
      </button>
    </div>
  </div>
</template>

<style scoped>
.quiz-top {
  max-width: 760px;
  margin: 0 auto;
}

.quiz-top-summary {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.summary-item {
  flex: 1;
  min-width: 120px;
  padding: 0.9rem 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.summary-label {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
}

.summary-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.summary-item-correct .summary-value {
  color: #16a34a;
}

.dark .summary-item-correct .summary-value {
  color: #86efac;
}

.summary-item-streak .summary-value {
  color: #b45309;
}

.dark .summary-item-streak .summary-value {
  color: #fbbf24;
}

.summary-value-sub {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin-left: 0.25rem;
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.chapter-card {
  display: block;
  padding: 0.9rem 1rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.chapter-card:hover {
  border-color: var(--vp-c-brand-2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.chapter-card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.chapter-num {
  width: 1.6em;
  height: 1.6em;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.chapter-title {
  font-weight: 600;
  font-size: 0.9rem;
  flex: 1;
}

.chapter-complete {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15em 0.5em;
  background: #16a34a;
  color: #fff;
  border-radius: 3px;
  letter-spacing: 0.04em;
}

.dark .chapter-complete {
  background: #166534;
  color: #86efac;
}


.chapter-bar-wrap {
  height: 5px;
  background: var(--vp-c-bg-mute);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.4rem;
}

.chapter-bar {
  height: 100%;
  background: var(--vp-c-brand-2);
  border-radius: 3px;
}

.chapter-stats {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.chapter-time {
  margin-top: 0.25rem;
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.chapter-difficulty {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.4rem;
}

.diff-chip {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.05em 0.4em;
  border-radius: 3px;
  letter-spacing: 0.02em;
}

.diff-easy {
  background: #dcfce7;
  color: #166534;
}

.diff-normal {
  background: #fef9c3;
  color: #854d0e;
}

.diff-hard {
  background: #fee2e2;
  color: #991b1b;
}

.dark .diff-easy {
  background: #14532d;
  color: #86efac;
}

.dark .diff-normal {
  background: #422006;
  color: #fde047;
}

.dark .diff-hard {
  background: #450a0a;
  color: #fca5a5;
}

.chapter-rate {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.chapter-wrong {
  color: #dc2626;
  font-weight: 600;
}

.dark .chapter-wrong {
  color: #fca5a5;
}

.quiz-top-actions-group {
  margin-bottom: 1rem;
}

.quiz-top-actions-label {
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  margin: 0 0 0.4rem;
}

.quiz-top-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-action {
  padding: 0.6rem 1.3rem;
  background: #1e3a8a;
  color: #fff;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.15s;
}

.btn-action:hover {
  background: #1e40af;
  color: #fff;
}

.btn-action:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.chapter-card:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.review-banner:focus-visible {
  outline: 2px solid #b91c1c;
  outline-offset: 2px;
}

.dark .btn-action:not(.btn-review):not(.btn-action-secondary) {
  background: #2563eb;
  color: #fff;
}

.dark .btn-action:not(.btn-review):not(.btn-action-secondary):hover {
  background: #1d4ed8;
  color: #fff;
}

.btn-action.btn-action-secondary {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.btn-action.btn-action-secondary:hover {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-text-1);
}

.btn-review {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.btn-review:hover {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-text-1);
}

.btn-review-disabled {
  display: inline-block;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
  border: 1px dashed var(--vp-c-divider);
  cursor: default;
  margin: 0;
}

.btn-review-disabled:hover {
  background: var(--vp-c-bg-soft);
  border-color: var(--vp-c-divider);
  color: var(--vp-c-text-3);
}

.continue-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  background: var(--vp-c-brand-soft);
  border: 1px solid var(--vp-c-brand-2);
  border-radius: 8px;
  text-decoration: none;
  color: var(--vp-c-brand-1);
  transition: background 0.15s, border-color 0.15s;
}

.continue-banner:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-brand-1);
}

.continue-banner-label {
  flex-shrink: 0;
  padding: 0.25em 0.6em;
  background: var(--vp-c-brand-1);
  color: #fff;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
}

.continue-banner-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.continue-banner-title {
  font-weight: 600;
  font-size: 0.95rem;
}

.continue-banner-sub {
  font-size: 0.78rem;
  opacity: 0.85;
}

.continue-banner-arrow {
  flex-shrink: 0;
}

.review-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  text-decoration: none;
  color: #b91c1c;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.15s, border-color 0.15s;
}

.review-banner:hover {
  background: #fee2e2;
  border-color: #f87171;
  color: #b91c1c;
}

.review-banner-icon {
  font-weight: 900;
  font-size: 1.2rem;
  flex-shrink: 0;
  line-height: 1;
}

.review-banner-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.review-banner-text {
  font-weight: 600;
}

.review-banner-sub {
  font-size: 0.78rem;
  font-weight: 400;
  opacity: 0.85;
}

.review-banner-arrow {
  flex-shrink: 0;
  font-size: 1rem;
}

.dark .review-banner {
  background: #450a0a;
  border-color: #b91c1c;
  color: #fca5a5;
}

.dark .review-banner:hover {
  background: #5a0f0f;
  border-color: #dc2626;
  color: #fca5a5;
}

.quiz-top-reset {
  margin-top: 1.5rem;
  text-align: right;
}

.btn-reset-progress {
  padding: 0.35rem 0.8rem;
  font-size: 0.78rem;
  background: none;
  color: var(--vp-c-text-3);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.btn-reset-progress:hover {
  color: #dc2626;
  border-color: #fca5a5;
}

.dark .btn-reset-progress:hover {
  color: #fca5a5;
  border-color: #b91c1c;
}
</style>
