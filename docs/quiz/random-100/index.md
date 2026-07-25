---
title: ドリル — 模擬試験ボリューム（100問）
prev: false
next: false
---

# 模擬試験ボリューム（100問）

本番の UX検定基礎と同じ **100 問**を、全 7 章・全難易度からランダムに出題します。本番の試験時間は 100 分（1 問あたり 1 分ペース）なので、時間を計って解くと本番のペース感覚をつかめます。

::: info 本番との違い
出題の順序・分野の配分はランダムであり、実際の試験の出題割合を再現したものではありません。実際の試験はオンライン CBT 方式で、見直し用のチェック機能などがあります。
:::

<script setup>
import { allQuizzes } from '../data/index'
</script>

<QuizPage :quizzes="allQuizzes" :random-sample="100" title="模擬試験ボリューム（100問）" />
