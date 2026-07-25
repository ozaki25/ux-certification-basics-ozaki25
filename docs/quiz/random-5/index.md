---
title: ドリル — ランダム 5 問
prev: false
next: false
---

# ランダム 5 問

全 7 章・全難易度（やさしい〜むずかしい）からランダムに 5 問出題します。**特定の章で力試しをしたい場合は、左サイドバーの「N 章 〇〇」のドリルから選んでください**。

<script setup>
import { allQuizzes } from '../data/index'
</script>

<QuizPage :quizzes="allQuizzes" :random-sample="5" title="ランダム 5 問" />
