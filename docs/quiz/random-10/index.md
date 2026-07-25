---
title: ドリル — ランダム 10 問
prev: false
next: false
---

# ランダム 10 問

全 7 章・全難易度からランダムに 10 問出題します。**特定の章で力試しをしたい場合は、左サイドバーの「N 章 〇〇」のドリルから選んでください**。

<script setup>
import { allQuizzes } from '../data/index'
</script>

<QuizPage :quizzes="allQuizzes" :random-sample="10" title="ランダム 10 問" />
