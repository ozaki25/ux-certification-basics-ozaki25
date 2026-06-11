<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Quiz } from '../../../quiz/types'

const props = defineProps<{
  quiz: Quiz
  index: number
  total: number
  initialAnswered?: boolean
  initialCorrect?: boolean | null
  initialSelectedIndex?: number | null
}>()

const emit = defineEmits<{
  answered: [quizId: string, correct: boolean, selectedIndex: number]
  reset: [quizId: string]
}>()

// 表示順(displayIndex) -> 元の選択肢順(originalIndex) のマッピング。
// 表示のたびに Fisher-Yates でシャッフルし、選択肢順を覚えて当てる学習を防ぐ。
// emit や localStorage には元の index を渡すため、保存形式の互換性は保たれる。
function shuffleOrder(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const displayOrder = ref<number[]>(shuffleOrder(props.quiz.choices.length))

// 元indexで保持された selectedIndex を表示indexに翻訳する関数
function toDisplayIndex(originalIndex: number | null): number | null {
  if (originalIndex === null) return null
  const idx = displayOrder.value.indexOf(originalIndex)
  return idx >= 0 ? idx : null
}

const displayChoices = computed(() =>
  displayOrder.value.map((origIdx) => props.quiz.choices[origIdx])
)
const displayAnswerIndex = computed(() =>
  displayOrder.value.indexOf(props.quiz.answer)
)

// 表示indexで持つ。emit時/初期化時に元indexと相互変換する。
const selectedDisplayIndex = ref<number | null>(
  toDisplayIndex(props.initialSelectedIndex ?? null)
)
const answered = ref(props.initialAnswered ?? false)

function select(displayI: number) {
  if (answered.value) return
  const originalI = displayOrder.value[displayI]
  selectedDisplayIndex.value = displayI
  answered.value = true
  emit('answered', props.quiz.id, originalI === props.quiz.answer, originalI)
}

function choiceClass(displayI: number): string {
  if (!answered.value) return 'choice'
  if (displayI === displayAnswerIndex.value) return 'choice correct'
  if (selectedDisplayIndex.value !== null && displayI === selectedDisplayIndex.value) return 'choice wrong'
  return 'choice dim'
}

const difficultyLabel: Record<string, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'むずかしい',
}

// `` `foo` `` → <code>foo</code>（クイズデータは固定値なので v-html で安全）
function renderText(s: string): string {
  const escaped = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
}

function handleKeydown(e: KeyboardEvent) {
  // 修飾キー押下時は無視（⌘+R などを奪わない）
  if (e.metaKey || e.ctrlKey || e.altKey) return
  // 1〜4 の数字キー（表示順）
  const n = parseInt(e.key)
  if (n >= 1 && n <= displayChoices.value.length) {
    select(n - 1)
    return
  }
  // A〜D（小文字も許容、表示順）
  if (e.key.length === 1) {
    const code = e.key.toLowerCase().charCodeAt(0)
    const idx = code - 'a'.charCodeAt(0)
    if (idx >= 0 && idx < displayChoices.value.length) {
      select(idx)
    }
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

function resetAnswer() {
  answered.value = false
  selectedDisplayIndex.value = null
  // もう一度解くときは並びも変える(答えの位置で覚えてしまうのを防ぐ)
  displayOrder.value = shuffleOrder(props.quiz.choices.length)
  emit('reset', props.quiz.id)
}

const effectiveCorrect = computed(() => {
  if (!answered.value) return null
  if (selectedDisplayIndex.value !== null) {
    return displayOrder.value[selectedDisplayIndex.value] === props.quiz.answer
  }
  return props.initialCorrect ?? null
})
</script>

<template>
  <div class="quiz-card">
    <div class="quiz-meta">
      <span class="quiz-num">{{ index + 1 }} / {{ total }}</span>
      <span class="quiz-difficulty" :data-level="quiz.difficulty">
        {{ difficultyLabel[quiz.difficulty] ?? quiz.difficulty }}
      </span>
    </div>

    <p class="quiz-question" v-html="renderText(quiz.question)" />

    <ol class="quiz-choices" aria-label="選択肢">
      <li v-for="(choice, i) in displayChoices" :key="displayOrder[i]">
        <button
          :class="choiceClass(i)"
          :disabled="answered"
          @click="select(i)"
          type="button"
        >
          <span class="choice-label" aria-hidden="true">{{ String.fromCharCode(65 + i) }}</span>
          <span class="choice-text" v-html="renderText(choice)" />
          <span v-if="answered && i === displayAnswerIndex" class="choice-check">正解</span>
        </button>
      </li>
    </ol>

    <div v-if="answered" class="quiz-result" role="status" aria-live="polite">
      <div class="result-header">
        <p class="result-badge" :data-correct="effectiveCorrect !== null ? String(effectiveCorrect) : undefined">
          {{ effectiveCorrect ? '正解' : '不正解' }}
          <span v-if="props.initialAnswered" class="result-badge-prev">（前回の回答）</span>
        </p>
        <button
          class="btn-reset"
          type="button"
          @click="resetAnswer"
        >
          もう一度解く
        </button>
      </div>
      <p v-if="effectiveCorrect === false" class="quiz-after-wrong">
        解説を読めば次は分かります。一緒に確認しましょう。
      </p>
      <p class="quiz-explanation" v-html="renderText(quiz.explanation)" />
      <p v-if="quiz.lesson" class="quiz-lesson-link">
        <a :href="`/lessons/${quiz.lesson}/`">{{ quiz.lesson }} を読み直す →</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.quiz-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
  background: var(--vp-c-bg);
}

.quiz-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.quiz-difficulty {
  padding: 0.15em 0.5em;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
}

.quiz-difficulty[data-level='easy'] {
  background: #dcfce7;
  color: #166534; /* #166534 on #dcfce7 ≈ 5.2:1 (WCAG AA pass) */
}
.quiz-difficulty[data-level='normal'] {
  background: #fef9c3;
  color: #854d0e; /* #854d0e on #fef9c3 ≈ 5.1:1 (WCAG AA pass) */
}
.quiz-difficulty[data-level='hard'] {
  background: #fee2e2;
  color: #991b1b; /* #991b1b on #fee2e2 ≈ 5.0:1 (WCAG AA pass) */
}

.dark .quiz-difficulty[data-level='easy'] {
  background: #14532d;
  color: #86efac;
}
.dark .quiz-difficulty[data-level='normal'] {
  background: #422006;
  color: #fde047;
}
.dark .quiz-difficulty[data-level='hard'] {
  background: #450a0a;
  color: #fca5a5;
}

.quiz-question {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.6;
  margin: 0 0 1rem;
  color: var(--vp-c-text-1);
}

.quiz-choices {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.choice {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  min-height: 44px;
  padding: 0.75rem 0.9rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  transition: background 0.15s, border-color 0.15s;
}

.choice:not(:disabled):hover {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-2);
}

.choice:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.btn-reset:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.choice:disabled {
  cursor: default;
}

.choice.correct {
  background: #f0fdf4;
  border-color: #16a34a;
  border-width: 2px;
  color: #15803d;
  font-weight: 600;
}

.choice.wrong {
  background: #fef7f7;
  border-color: #f87171;
  color: #991b1b;
}

.choice.dim {
  opacity: 0.5;
}

.dark .choice.correct {
  background: #052e16;
  border-color: #16a34a;
  color: #86efac;
}

.dark .choice.wrong {
  background: #450a0a;
  border-color: #dc2626;
  color: #fca5a5;
}

.choice-label {
  font-weight: 700;
  min-width: 1.2em;
  text-align: center;
  flex-shrink: 0;
}

.choice-text {
  flex: 1;
}

.choice-check {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15em 0.55em;
  background: #16a34a;
  color: #fff;
  border-radius: 3px;
  flex-shrink: 0;
  align-self: center;
  letter-spacing: 0.04em;
}

.quiz-result {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: var(--vp-c-bg-soft);
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.result-badge {
  font-weight: 700;
  font-size: 0.9rem;
  margin: 0;
}

.result-badge-prev {
  margin-left: 0.4em;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--vp-c-text-3);
}

.btn-reset {
  min-height: 36px;
  padding: 0.45rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 600;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .btn-reset {
    min-height: 44px;
    padding: 0.6rem 1rem;
    font-size: 0.9rem;
  }
}

.btn-reset:hover {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-text-2);
  color: var(--vp-c-text-1);
}

.result-badge[data-correct='true'] {
  color: #16a34a;
}

.result-badge[data-correct='false'] {
  color: #ea580c;
}

.dark .result-badge[data-correct='true'] {
  color: #86efac;
}

.dark .result-badge[data-correct='false'] {
  color: #fca5a5;
}

.quiz-after-wrong {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  font-style: italic;
}

.quiz-explanation {
  font-size: 0.875rem;
  line-height: 1.7;
  color: var(--vp-c-text-1);
  margin: 0;
}

.dark .quiz-explanation {
  color: var(--vp-c-text-1);
}

.dark .quiz-result {
  background: var(--vp-c-bg-soft);
  border-color: var(--vp-c-divider);
}

.quiz-lesson-link {
  margin: 0.6rem 0 0;
  font-size: 0.82rem;
}

.quiz-lesson-link a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* v-html で挿入される <code> のスタイル */
.quiz-card :deep(code) {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.875em;
  background: var(--vp-c-bg-mute);
  padding: 0.15em 0.35em;
  border-radius: 3px;
  color: var(--vp-c-text-1);
}
</style>
