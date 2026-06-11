# PLAYBOOK — 検定学習コンテンツの立ち上げ・運用プレイブック

このリポジトリ（UX検定基礎）を参考に**新しい検定・学習コンテンツのリポジトリを立ち上げるとき**と、**公開後に品質を上げ続けるとき**の手順をまとめます。本リポジトリ自体の経緯は `SPRINTLOG.md` を参照。

## Phase 0: 土台の複製（半日）

1. このリポジトリの構成をコピーする（`docs/` の仕組み・`scripts/`・`.github/`・設定ファイル一式）。レッスン本文とドリルデータは捨てて空にする
2. 置き換えるもの:
   - `package.json` の名前と説明
   - `config.mts` のタイトル・説明・テーマ色・PWA manifest
   - `theme/custom.css` のブランド色（**WCAG AA 4.5:1 をライト・ダーク両方で計算して確認**）
   - `docs/public/logo.svg`（→ `npm run pwa:icons` でアイコン再生成、OGP も作り直す）
3. `npm install` → `docs:build` が通ることを確認してから main に初回コミット

## Phase 1: 一次情報の確定（最重要・先にやる）

- **公式の出題範囲（シラバス等）を必ず入手してから**カリキュラムを設計する。検索情報だけで作ると欠落が出る（本リポジトリでは検索ベースの仮カリキュラムに 8 トピック以上の欠落があり、シラバス入手後に全面再編した）
- 非公開資料（講座資料等）は `references/` に置き、`.gitignore` で除外。索引 `references/INDEX.md` を作る
- 出典の優先順位を CLAUDE.md に明記する（例: 公式シラバス > 公式サイト > 推薦図書・著者発信 > 一般知識）

## Phase 2: カリキュラム設計（1スプリント）

- レッスンは出題範囲の最小単位（小カテゴリ等）と 1 対 1 で対応させる。統合する場合は対応表に明記
- 同期箇所は 5 か所: `config.mts`（サイドバー）/ `docs/index.md`（目次）/ `docs/quiz/types.ts`（章メタ）/ `README.md`（章対応表）/ CLAUDE.md（対応表）。**再編時はこの 5 か所を機械的に grep で確認**

## Phase 3: レッスン執筆（1レッスン=1スプリント）

- 最初の 1 本は手本として丁寧に書き、以降のドラフトの基準にする（構成・分量・トーン）
- 並列ドラフト（サブエージェント等）を使う場合の必須インプット: CLAUDE.md / 手本レッスン / 担当範囲のシラバス（学習目標・重要ワード）/ 対応する一次資料のパス。**「自信のない記述を申告させる」**と後段のファクトチェックが効率化する
- ドラフトは必ず人手レビューしてからコミット: 重要ワード網羅 / 事実の一次資料との照合 / 執筆ルール準拠 / textlint / ビルド
- レビュー観点 10 項目は `SPRINTLOG.md` 冒頭を参照

## Phase 4: 横断監査（執筆完了後に一括）

```bash
# 位置依存表現・禁止記法
grep -rn "次のレッスン\|前のレッスン\|前章\|次章で" docs/lessons/
grep -rn "——\|<br" docs/lessons/
# 表記ゆれ（プロジェクト固有の統一ルールに合わせて調整）
grep -rn "ユーザ[^ー]" docs/lessons/ | grep -v ユーザビリティ
# リンク切れ（存在しない lessonNN への参照）
grep -rhno "/lessons/lesson[0-9]\{2\}/" docs/ | grep -o "lesson[0-9]\{2\}" | sort -u
# 必須セクションの存在
for f in docs/lessons/lesson*/index.md; do for s in "## このレッスンで学ぶこと" "## キーワード" "## 試験のポイント"; do grep -q "^$s" "$f" || echo "$f missing: $s"; done; done
```

## Phase 5: ドリル作成（1章=1スプリント）

- ルールは CLAUDE.md「ドリル（quiz）」を踏襲。`npm run quiz:validate` が形式を保証する
- 形式チェックでは保証されない品質（**正答がレッスン本文と一致しているか・ひっかけが概念混同として成立しているか**）は全問レビューする
- バランス集計（正解位置・難易度・レッスン別出題数）:

```bash
node -e '
const fs=require("fs");let pos=[0,0,0,0],diff={easy:0,normal:0,hard:0},per={};
for(let c=1;c<=6;c++){const t=fs.readFileSync(`docs/quiz/data/chapter${c}.ts`,"utf8");
for(const it of t.split(/\bid:\s*"/).slice(1)){
const a=it.match(/answer:\s*([0-3])/);if(a)pos[+a[1]]++;
const d=it.match(/difficulty:\s*"(\w+)"/);if(d)diff[d[1]]++;
const l=it.match(/lesson:\s*"(lesson\d+)"/);if(l)per[l[1]]=(per[l[1]]||0)+1;}}
console.log("正解位置:",pos.join("/"),"難易度:",JSON.stringify(diff));
console.log(Object.keys(per).sort().map(k=>`${k}:${per[k]}`).join(" "));'
```

- 目安: 正解位置は各 25%±5%、難易度 easy:normal:hard ≈ 4:4:2、全レッスン 6 問以上

## Phase 6: リリース

- トップページ・README の「準備中」表記を解除し、確定数値（レッスン数・問題数）に更新
- 最終検証: `docs:lint` / `quiz:validate` / `docs:build` + dist のスポットチェック（manifest・OGP・検索インデックス）
- CLAUDE.md に完成状態を記録してからプッシュ

## Phase 7: 公開後の運用サイクル（継続）

公開後の品質改善は次のループで回す。**気づきを必ずファイルに落とす**ことが要点（会話やメモ帳に残すと消える）。

1. **気づきの記録**: 学習中・レビューで見つけた疑義は `FACTCHECK.md` に追記（対象ファイル・現在の記述・確認先）
2. **裏取り**: 公式サイト・シラバス・推薦図書・著者の公開発信（記事・インタビュー・登壇資料）の優先順で確認。確認結果と出典を `FACTCHECK.md` に記録
3. **修正**: レッスンを直したら、そのレッスンに紐づくドリル（`lesson` フィールドで grep）も必ず突き合わせる
4. **検証とリリース**: `docs:lint` / `quiz:validate` / `docs:build` → コミット → push（Vercel が自動デプロイ）
5. **ルール化**: 同種の誤りを防げるなら CLAUDE.md・このプレイブックに反映する

シラバス改訂時は Phase 2 の「5 か所同期」から再実行する。
