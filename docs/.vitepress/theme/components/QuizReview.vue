<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { STORAGE_KEY } from '../../../quiz/types'
import { allQuizzes } from '../../../quiz/data/index'
import QuizPage from './QuizPage.vue'

const loaded = ref(false)
const wrongQuizzes = ref<typeof allQuizzes>([])

onMounted(() => {
  if (typeof window === 'undefined') return
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    wrongQuizzes.value = allQuizzes.filter(
      (q) => stored[q.id] !== undefined && !stored[q.id].correct,
    )
  } catch {
    wrongQuizzes.value = []
  }
  loaded.value = true
})

const hasWrong = computed(() => wrongQuizzes.value.length > 0)
</script>

<template>
  <div v-if="!loaded" class="review-loading">読み込み中...</div>

  <div v-else-if="!hasWrong" class="review-empty">
    <p class="review-empty-title">復習する問題はありません</p>
    <p class="review-empty-sub">
      まだドリルを解いていないか、解いた問題はすべて正解しています。<br>
      <a href="/quiz/">ドリル一覧から挑戦する</a>
    </p>
  </div>

  <QuizPage
    v-else
    :quizzes="wrongQuizzes"
    :title="`間違えた問題を復習（${wrongQuizzes.length} 問）`"
    :shuffle="true"
    :hide-review-cta="true"
  />
</template>

<style scoped>
.review-loading,
.review-empty {
  padding: 2rem 1rem;
}

.review-empty-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin-bottom: 0.5rem;
}

.review-empty-sub {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.review-empty a {
  color: var(--vp-c-brand-1);
}
</style>
