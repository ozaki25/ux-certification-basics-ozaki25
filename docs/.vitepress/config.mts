import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import { withPwa } from "@vite-pwa/vitepress";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";
import cjkFriendly from "markdown-it-cjk-friendly";

export default withPwa(
  withMermaid(
    defineConfig({
      title: "UX検定基礎 学習コンテンツ",
      description: "UX検定基礎の合格を目指す学習コンテンツ。全6章24レッスン、図解とドリルで段階的に学べます。",
      lang: "ja",
      lastUpdated: true,
      cleanUrls: true,
      head: [
        ["link", { rel: "icon", href: "/favicon.ico", sizes: "48x48" }],
        ["link", { rel: "icon", href: "/logo.svg", type: "image/svg+xml" }],
        ["link", { rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" }],
        ["meta", { name: "robots", content: "noindex, nofollow" }],
        ["meta", { name: "googlebot", content: "noindex, nofollow" }],
        ["meta", { name: "theme-color", content: "#3949ab" }],
        ["meta", { name: "author", content: "ozaki25" }],
        ["meta", { property: "og:type", content: "website" }],
        ["meta", { property: "og:locale", content: "ja_JP" }],
        ["meta", { property: "og:site_name", content: "UX検定基礎 学習コンテンツ" }],
        ["meta", { property: "og:title", content: "UX検定基礎 学習コンテンツ" }],
        ["meta", { property: "og:description", content: "UX検定基礎の合格を目指す学習コンテンツ。全6章24レッスン、図解とドリルで段階的に学べます。" }],
        ["meta", { property: "og:image", content: "/ogp.png" }],
        ["meta", { name: "twitter:card", content: "summary_large_image" }],
        ["meta", { name: "twitter:title", content: "UX検定基礎 学習コンテンツ" }],
        ["meta", { name: "twitter:description", content: "UX検定基礎の合格を目指す学習コンテンツ。24レッスン+ドリル付き。" }],
        ["meta", { name: "twitter:image", content: "/ogp.png" }],
      ],
      mermaid: {
        theme: "default",
        themeVariables: {
          primaryColor: "#e8eaf6",
          primaryTextColor: "#1e293b",
          primaryBorderColor: "#3949ab",
          lineColor: "#475569",
          fontFamily: "sans-serif",
        },
        // HTMLラベル(デフォルト)を使い、CJK文字の高さ計算はブラウザに委ねる。
        // SVG textで描く `htmlLabels: false` では `\n` を超える折り返しが
        // rect の高さに反映されず最終行が切れることがあるため、custom.cssで
        // foreignObject の overflow を visible にして補完する。
      },
      markdown: {
        config(md) {
          md.use(tabsMarkdownPlugin);
          // 日本語の太字（**…**）で、閉じ ** の直前が全角閉じ括弧（）」など）の
          // 場合に強調が描画されない CJK flanking 問題を解消する。
          md.use(cjkFriendly);
        },
      },
      themeConfig: {
        nav: [
          { text: "ホーム", link: "/" },
          { text: "ドリル", link: "/quiz/" },
        ],
        sidebar: {
          "/lessons/": [
            {
              text: "ナビゲーション",
              items: [
                { text: "ホーム", link: "/" },
                { text: "ドリル", link: "/quiz/" },
              ],
            },
            {
              text: "第1章 UXインテリジェンスの理念",
              collapsed: false,
              items: [
                { text: "lesson01: アフターデジタル時代とUX", link: "/lessons/lesson01/" },
                { text: "lesson02: UXインテリジェンスとは", link: "/lessons/lesson02/" },
                { text: "lesson03: UXと倫理・自由", link: "/lessons/lesson03/" },
              ],
            },
            {
              text: "第2章 UX関連基礎知識",
              collapsed: true,
              items: [
                { text: "lesson04: UXとは（定義と全体像）", link: "/lessons/lesson04/" },
                { text: "lesson05: ユーザビリティとISO規格", link: "/lessons/lesson05/" },
                { text: "lesson06: 人間中心デザイン（HCD）", link: "/lessons/lesson06/" },
                { text: "lesson07: UD・アクセシビリティ", link: "/lessons/lesson07/" },
                { text: "lesson08: 人間の特性（認知と行動）", link: "/lessons/lesson08/" },
              ],
            },
            {
              text: "第3章 UXプロジェクトの計画",
              collapsed: true,
              items: [
                { text: "lesson09: UXプロジェクトの全体像", link: "/lessons/lesson09/" },
                { text: "lesson10: プロジェクト計画と体制", link: "/lessons/lesson10/" },
                { text: "lesson11: 仮説検証のサイクル", link: "/lessons/lesson11/" },
              ],
            },
            {
              text: "第4章 ユーザー理解と要求定義",
              collapsed: true,
              items: [
                { text: "lesson12: ユーザー調査の全体像", link: "/lessons/lesson12/" },
                { text: "lesson13: インタビューと観察", link: "/lessons/lesson13/" },
                { text: "lesson14: ペルソナ", link: "/lessons/lesson14/" },
                { text: "lesson15: カスタマージャーニーマップ", link: "/lessons/lesson15/" },
                { text: "lesson16: ユーザー要求定義", link: "/lessons/lesson16/" },
              ],
            },
            {
              text: "第5章 UXデザインの具現化と評価",
              collapsed: true,
              items: [
                { text: "lesson17: アイデア発想と構造化", link: "/lessons/lesson17/" },
                { text: "lesson18: プロトタイピング", link: "/lessons/lesson18/" },
                { text: "lesson19: 専門家によるユーザビリティ評価", link: "/lessons/lesson19/" },
                { text: "lesson20: ユーザビリティテスト", link: "/lessons/lesson20/" },
                { text: "lesson21: 評価結果の活用", link: "/lessons/lesson21/" },
              ],
            },
            {
              text: "第6章 UX運用・グロースと組織化",
              collapsed: true,
              items: [
                { text: "lesson22: UXグロースの考え方", link: "/lessons/lesson22/" },
                { text: "lesson23: KPIと効果測定", link: "/lessons/lesson23/" },
                { text: "lesson24: UX組織化と人材", link: "/lessons/lesson24/" },
              ],
            },
          ],
          "/quiz/": [
            {
              text: "ナビゲーション",
              items: [
                { text: "ホーム", link: "/" },
                { text: "レッスン", link: "/lessons/lesson01/" },
              ],
            },
            {
              text: "ドリル",
              link: "/quiz/",
              items: [
                { text: "一覧", link: "/quiz/" },
                { text: "1章 UXインテリジェンスの理念", link: "/quiz/chapter1/" },
                { text: "2章 UX関連基礎知識", link: "/quiz/chapter2/" },
                { text: "3章 UXプロジェクトの計画", link: "/quiz/chapter3/" },
                { text: "4章 ユーザー理解と要求定義", link: "/quiz/chapter4/" },
                { text: "5章 UXデザインの具現化と評価", link: "/quiz/chapter5/" },
                { text: "6章 UX運用・グロースと組織化", link: "/quiz/chapter6/" },
                { text: "ランダム 5 問", link: "/quiz/random-5/" },
                { text: "ランダム 10 問", link: "/quiz/random-10/" },
                { text: "ランダム出題（全問）", link: "/quiz/random/" },
                { text: "間違えた問題を復習", link: "/quiz/review/" },
              ],
            },
          ],
        },
        outline: {
          label: "目次",
        },
        docFooter: {
          prev: "前のレッスン",
          next: "次のレッスン",
        },
        search: {
          provider: "local",
          options: {
            translations: {
              button: { buttonText: "検索" },
              modal: {
                noResultsText: "見つかりませんでした",
                resetButtonTitle: "リセット",
              },
            },
          },
        },
      },
      pwa: {
        registerType: "autoUpdate",
        manifest: {
          name: "UX検定基礎 学習コンテンツ",
          short_name: "UX検定基礎",
          description: "UX検定基礎の学習コンテンツ",
          theme_color: "#3949ab",
          background_color: "#ffffff",
          lang: "ja",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,webp,json}"],
        },
      },
    }),
  ),
);
