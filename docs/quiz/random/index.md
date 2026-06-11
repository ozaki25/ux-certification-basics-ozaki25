---
title: ドリル — ランダム出題（全問）
prev: false
next: false
---

# ランダム出題（全問）

全 {{ allQuizzes.length }} 問からランダムに出題します。毎回順番が変わるので、繰り返し解いても慣れが出にくくなります。キーボード（1-4 で選択肢）でも操作できます。

<script setup>
import { allQuizzes } from '../data/index'
</script>

<QuizPage :quizzes="allQuizzes" :title="`ランダム出題（全 ${allQuizzes.length} 問）`" :shuffle="true" />
