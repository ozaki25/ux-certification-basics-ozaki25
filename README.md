# UX検定基礎 学習コンテンツ

[![CI](https://github.com/ozaki25/ux-certification-basics-ozaki25/actions/workflows/build.yml/badge.svg)](https://github.com/ozaki25/ux-certification-basics-ozaki25/actions/workflows/build.yml)

UX検定基礎（UXインテリジェンス協会主催）の合格を目指す学習コンテンツです。

全 6 章 31 レッスンで構成し、1 レッスン 1 トピックで段階的に学べるようにしています。

## コンテンツ

- **31 レッスン**: 公式シラバス（2023年5月版）の全小カテゴリをカバー（1 レッスン 15 分程度）
- **ドリル 195 問**: 章別出題・ランダム・模擬試験ボリューム（100問）・復習に対応。回答履歴をブラウザに保存
- **図解**: 25 の Mermaid 図でプロセスや構造を可視化

## 技術スタック

- [VitePress](https://vitepress.dev/) + PWA（`@vite-pwa/vitepress`）
- [Mermaid](https://mermaid.js.org/)（`vitepress-plugin-mermaid`）— 図解
- vitepress-plugin-tabs — タブ表示
- textlint（`preset-ja-technical-writing`）— 日本語文章の校正
- Vue 3 — ドリルのカスタムコンポーネント
- Vercel Analytics / Speed Insights
- GitHub Actions — `main` と PR でビルド・lint・ドリル検証

## クイックスタート

```bash
npm install
npm run docs:dev   # 開発サーバー http://localhost:5173
```

## 主なコマンド

```bash
npm run docs:dev       # ローカル開発サーバー
npm run docs:build     # 本番ビルド
npm run docs:lint      # textlint で日本語を校正
npm run quiz:validate  # ドリルデータの検証
npm run pwa:icons      # logo.svg から PWA アイコンを生成
```

## ディレクトリ構成

```
docs/
  index.md                     トップページ
  lessons/lessonNN/index.md    各レッスン（lesson01〜lesson31）
  quiz/                        ドリル（4 択問題）
    types.ts                   型定義・章メタ情報
    data/chapterN.ts           章ごとの問題データ
    chapterN/index.md          章別ドリルページ
    random/ random-5/ random-10/ random-100/ review/   ランダム・模擬試験・復習ページ
  public/diagrams/             SVG 図版
  .vitepress/
    config.mts                 サイト設定（nav・サイドバー・PWA・SEO）
    theme/                     カスタムテーマ・Vue コンポーネント
scripts/quiz-validate.mjs      ドリルデータの検証スクリプト
```

## 章とレッスンの対応

| 章 | テーマ | レッスン |
|----|--------|----------|
| 1 | UXインテリジェンスの理念 | lesson01〜05 |
| 2 | UX関連基礎知識 | lesson06〜15 |
| 3 | UXプロジェクト計画 | lesson16〜17 |
| 4 | ユーザー理解 | lesson18〜21 |
| 5 | ユーザー要求定義と具現化 | lesson22〜27 |
| 6 | UXデザイン評価・運用・組織化 | lesson28〜31 |

## レッスン・ドリルの追加方法

詳細は [`CLAUDE.md`](./CLAUDE.md) を参照してください。執筆スタイル・用語統一ルール・図版作成のガイドラインが記載されています。

## デプロイ

- main ブランチへの push で Vercel が自動デプロイします

## 参考にしたリポジトリ

同じ仕組みで作られた学習コンテンツ:

- [color-coordination-training-ozaki25](https://github.com/ozaki25/color-coordination-training-ozaki25)
- [web-front-training-ozaki25](https://github.com/ozaki25/web-front-training-ozaki25)
- [web-front-handson-ozaki25](https://github.com/ozaki25/web-front-handson-ozaki25)
