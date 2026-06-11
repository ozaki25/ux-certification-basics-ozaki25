# UX検定基礎 学習コンテンツ

[![CI](https://github.com/ozaki25/ux-certification-basics-ozaki25/actions/workflows/build.yml/badge.svg)](https://github.com/ozaki25/ux-certification-basics-ozaki25/actions/workflows/build.yml)

UX検定基礎（UXインテリジェンス協会主催）の合格を目指す学習コンテンツです。

全 6 章 24 レッスンで構成し、1 レッスン 1 トピックで段階的に学べるようにしています。

> [!NOTE]
> 現在は土台のみ整備した段階です。レッスン本文とドリルの問題は今後追加します。カリキュラムはドラフトのため変わる可能性があります。

## コンテンツ（予定）

- **24 レッスン**: 公式シラバスの大カテゴリをカバー（1 レッスン 15 分程度）
- **ドリル**: 章別出題・ランダム・復習に対応。回答履歴をブラウザに保存
- **図版**: プロセスや構造を示す SVG 図解・Mermaid 図

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
  lessons/lessonNN/index.md    各レッスン（lesson01〜lesson24）
  quiz/                        ドリル（4 択問題）
    types.ts                   型定義・章メタ情報
    data/chapterN.ts           章ごとの問題データ
    chapterN/index.md          章別ドリルページ
    random/ random-5/ random-10/ review/   ランダム・復習ページ
  public/diagrams/             SVG 図版
  .vitepress/
    config.mts                 サイト設定（nav・サイドバー・PWA・SEO）
    theme/                     カスタムテーマ・Vue コンポーネント
scripts/quiz-validate.mjs      ドリルデータの検証スクリプト
```

## 章とレッスンの対応（ドラフト）

| 章 | テーマ | レッスン |
|----|--------|----------|
| 1 | UXインテリジェンスの理念 | lesson01〜03 |
| 2 | UX関連基礎知識 | lesson04〜08 |
| 3 | UXプロジェクトの計画 | lesson09〜11 |
| 4 | ユーザー理解と要求定義 | lesson12〜16 |
| 5 | UXデザインの具現化と評価 | lesson17〜21 |
| 6 | UX運用・グロースと組織化 | lesson22〜24 |

## レッスン・ドリルの追加方法

詳細は [`CLAUDE.md`](./CLAUDE.md) を参照してください。執筆スタイル・用語統一ルール・図版作成のガイドラインが記載されています。

## デプロイ

- main ブランチへの push で Vercel が自動デプロイします

## 参考にしたリポジトリ

同じ仕組みで作られた学習コンテンツ:

- [color-coordination-training-ozaki25](https://github.com/ozaki25/color-coordination-training-ozaki25)
- [web-front-training-ozaki25](https://github.com/ozaki25/web-front-training-ozaki25)
- [web-front-handson-ozaki25](https://github.com/ozaki25/web-front-handson-ozaki25)
