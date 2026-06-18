# FACTCHECK — 事実確認の台帳

レッスン・ドリルの記述のうち、一次資料（公式シラバス・講座資料）で直接裏取りできていない箇所の確認状況を管理する台帳です。運用方法は `PLAYBOOK.md` の Phase 7 を参照。

- 状態: ✅ 確認済み / 🔶 確認中 / ⬜ 未確認
- 確認先の優先順位: 公式シラバス > 公式サイト > 推薦図書・著者の公開発信 > 一般知識

## 確認済み

<!-- textlint-disable ja-technical-writing/max-kanji-continuous-len -->

| 項目 | 対象 | 結果 | 出典 |
|---|---|---|---|
| ✅ ボトムアップ型=抜本改善+高速改善、トップダウン型=事業変革+全社変革 | lesson04, lesson31 | 『UXグロースモデル』の章構成（第4章=抜本改善、第5章=高速改善、第6章=事業変革、第7章=全社変革）と一致 | [日経BOOKプラス 書籍ページ](https://bookplus.nikkei.com/atcl/catalog/21/283740/)、[データのじかん書評](https://data.wingarc.com/after-digital-ux-growth-model-42664) |
| ✅ UX企画力の構造（ユーザー理解を共通土台に、ビジネス構築とグロースチーム運用の2場面。世界観の体現が価値の中核） | lesson05 | 『アフターデジタル2』第4章の整理と一致するよう本文を精緻化済み | [GLOBIS知見録 書評](https://globis.jp/article/7816/)、[beBit セミナー資料](https://www.bebit.co.jp/seminar/article/pms_adc_ux-growth-model/) |
| ✅ 収益モデル（ジャーニー使用料=サブスク型、無償/廉価版で潜在顧客と接点維持→有償化、特定シーンの大きな成功） | lesson04 | 著者解説・書評の整理と一致（平安保険グッドドクターの無償提供→有償化の事例とも整合） | [しのジャッキー note まとめ](https://note.com/shinojackie/n/n4f010184cf4f)、[アフターデジタル要約](https://peeks-blog.com/after-digital/) |
| ✅ 試験形式（オンラインCBT・4択100問・100分） | CLAUDE.md, docs/index.md | 受験記・公式情報と一致 | 公式サイト・複数の受験記事 |
| ✅ 推薦図書4冊の正確なリスト | CLAUDE.md | 『アフターデジタル2 UXと自由』『UXグロースモデル』『人間中心設計入門』（HCDライブラリー第0巻）『ユーザビリティエンジニアリング』（樽本徹也）の4冊で確定。CLAUDE.md に反映済み | [テックジム対策ガイド](https://techgym.jp/column/ux-kentei/) ほか受験記事複数 |
| ✅ UXスキルレベル3段階の公式名称 | lesson03, q120 | UXIA は「UXジェネラリストレベル」「UXプロフェッショナルレベル」「UXマネジメントレベル」と定義（UX検定基礎=UXジェネラリスト）。正式名称に修正済み | [UXIA 公式](https://www.uxia.or.jp/certification/)、[日経ビジネススクール](https://school.nikkei.co.jp/special/ux_certification/) |
| ✅ シャッケルの定義の年号（1991年） | lesson14 | 『Human Factors for Informatics Usability』（1991）で提示された枠組み（ユーティリティ・ユーザビリティ・ライカビリティ×コスト→受容性）。記述は正確 | [U-Site 解説](https://u-site.jp/lecture/designing-happiness)、[ユーザビリティ - Wikipedia](https://ja.wikipedia.org/wiki/%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%93%E3%83%AA%E3%83%86%E3%82%A3) |
| ✅ インセプション・デッキ「10の質問」 | lesson08 | 『アジャイルサムライ』の10個の質問と課題（「我々はなぜここにいるのか」等）。記述は正確 | [プロマネ研究室 解説](https://pm-laboratory.com/m20220913/) |
| ✅ PPM の軸名表記（市場成長率・相対的な市場シェア） | lesson17 | BCG マトリクスの標準的な軸名。「市場占有率」は同義の別表記であり許容 | 一般的な経営学の確立知識 |
| ✅ JIS X 8341 の正式名称 | lesson15 | 「高齢者・障害者等配慮設計指針」が正式名称。本文を正式名称に修正済み（textlint は disable コメントで対応） | JIS 規格名 |
| ✅ ドハティのしきい値の表記 | lesson12 | 0.4秒 = 400ミリ秒で同値。本文に併記する形に修正済み | 原典（IBM, Doherty & Thadani 1982）の一般的解説 |
| ✅ ドリル全195問の正答の内容的正しさ | docs/quiz/data/chapter1〜6.ts | 専門家レビュー（章別6名）で全問を公式シラバス・講座資料・確立したUX知識と照合。CRITICAL（答えの誤り）・MAJOR（複数正解・資料矛盾）は0件。固有名詞・規格番号・年号・数値（ISO 9241-11/JIS X 8341-3/EAST・FEAST/ドハティ0.4秒/ニールセン5人≒85%/BMC 9ブロック等）も一致を確認 | 公式シラバス・UXインテリジェンス基礎講座 全8回資料 |
| ✅ PPMの軸名「相対的な市場シェア」の表記統一 | lesson17, q310/q311 | BCGマトリクスの正式軸名に合わせ lesson17 の表ヘッダ・キーワード・試験ポイントを「相対的な市場シェア」に統一 | 確立した経営学知識（BCG PPM） |

<!-- textlint-enable -->

## 未確認（優先度順）

現在、未確認の項目はありません。新しい疑義はこのセクションに追記してください。

| 項目 | 対象 | 現在の記述 | 確認先 |
|---|---|---|---|

## 確認の進め方

1. 上の表の項目を、確認先にあたって ✅ / 記述修正に振り分ける
2. レッスンを修正したら、対応するドリル（`grep -rn 'lesson: "lessonNN"' docs/quiz/data/`）も突き合わせる
3. 修正後は `npm run docs:lint && npm run quiz:validate && npm run docs:build` を通してからコミット
4. 新しい疑義を見つけたら、このファイルの「未確認」に1行追加してからコミットする（記憶やチャットに残さない）

## 著者の公開発信（裏取りに使える情報源）

- beBit「AFTER DIGITAL Frontier/Basic」: https://afterdigital.bebit.co.jp/ （『UXグロースモデル』の一部を限定公開する記事あり）
- beBit セミナーレポート: https://www.bebit.co.jp/seminar/ （藤井保文氏による UXグロースモデル解説）
- GLOBIS 知見録の藤井氏対談・書評: https://globis.jp/article/7816/ ほか
- 日経クロステック・MarkeZine 等のインタビュー記事（バリュージャーニー・ジャーニーシフト解説）
