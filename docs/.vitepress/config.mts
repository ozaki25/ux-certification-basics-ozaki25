import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import { withPwa } from "@vite-pwa/vitepress";
import { tabsMarkdownPlugin } from "vitepress-plugin-tabs";
import cjkFriendly from "markdown-it-cjk-friendly";

export default withPwa(
  withMermaid(
    defineConfig({
      title: "UX検定基礎 学習コンテンツ",
      description: "UX検定基礎の合格を目指す学習コンテンツ。全6章31レッスン、図解とドリルで段階的に学べます。",
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
        ["meta", { property: "og:description", content: "UX検定基礎の合格を目指す学習コンテンツ。全6章31レッスン、図解とドリルで段階的に学べます。" }],
        ["meta", { property: "og:image", content: "/ogp.png" }],
        ["meta", { name: "twitter:card", content: "summary_large_image" }],
        ["meta", { name: "twitter:title", content: "UX検定基礎 学習コンテンツ" }],
        ["meta", { name: "twitter:description", content: "UX検定基礎の合格を目指す学習コンテンツ。31レッスン+ドリル付き。" }],
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
                { text: "lesson01: UXとは（定義と構成要素）", link: "/lessons/lesson01/" },
                { text: "lesson02: UXが重視される背景", link: "/lessons/lesson02/" },
                { text: "lesson03: UXデザインとUXデザイナー", link: "/lessons/lesson03/" },
                { text: "lesson04: UXグロース", link: "/lessons/lesson04/" },
                { text: "lesson05: UXインテリジェンスとは", link: "/lessons/lesson05/" },
              ],
            },
            {
              text: "第2章 UX関連基礎知識",
              collapsed: true,
              items: [
                { text: "lesson06: 人間中心デザイン（HCD）", link: "/lessons/lesson06/" },
                { text: "lesson07: デザイン思考", link: "/lessons/lesson07/" },
                { text: "lesson08: アジャイル開発", link: "/lessons/lesson08/" },
                { text: "lesson09: リーン開発", link: "/lessons/lesson09/" },
                { text: "lesson10: パーパス", link: "/lessons/lesson10/" },
                { text: "lesson11: 行動経済学", link: "/lessons/lesson11/" },
                { text: "lesson12: 認知心理学", link: "/lessons/lesson12/" },
                { text: "lesson13: 文化人類学と人間工学", link: "/lessons/lesson13/" },
                { text: "lesson14: ユーザビリティ", link: "/lessons/lesson14/" },
                { text: "lesson15: アクセシビリティ", link: "/lessons/lesson15/" },
              ],
            },
            {
              text: "第3章 UXプロジェクト計画",
              collapsed: true,
              items: [
                { text: "lesson16: プロジェクトマネジメント", link: "/lessons/lesson16/" },
                { text: "lesson17: プロダクトマネジメント", link: "/lessons/lesson17/" },
              ],
            },
            {
              text: "第4章 ユーザー理解",
              collapsed: true,
              items: [
                { text: "lesson18: UXリサーチの全体像", link: "/lessons/lesson18/" },
                { text: "lesson19: 定量調査", link: "/lessons/lesson19/" },
                { text: "lesson20: 定性調査", link: "/lessons/lesson20/" },
                { text: "lesson21: 行動データ分析", link: "/lessons/lesson21/" },
              ],
            },
            {
              text: "第5章 ユーザー要求定義と具現化",
              collapsed: true,
              items: [
                { text: "lesson22: ユーザーモデリング", link: "/lessons/lesson22/" },
                { text: "lesson23: 理想の利用状況の想定", link: "/lessons/lesson23/" },
                { text: "lesson24: アイデア創出", link: "/lessons/lesson24/" },
                { text: "lesson25: 情報設計", link: "/lessons/lesson25/" },
                { text: "lesson26: プロトタイピング", link: "/lessons/lesson26/" },
                { text: "lesson27: UXライティング", link: "/lessons/lesson27/" },
              ],
            },
            {
              text: "第6章 UXデザイン評価・運用・組織化",
              collapsed: true,
              items: [
                { text: "lesson28: ユーザーテスト", link: "/lessons/lesson28/" },
                { text: "lesson29: エキスパートレビュー", link: "/lessons/lesson29/" },
                { text: "lesson30: 継続的なUX改善", link: "/lessons/lesson30/" },
                { text: "lesson31: 組織開発と人材育成", link: "/lessons/lesson31/" },
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
                { text: "3章 UXプロジェクト計画", link: "/quiz/chapter3/" },
                { text: "4章 ユーザー理解", link: "/quiz/chapter4/" },
                { text: "5章 ユーザー要求定義と具現化", link: "/quiz/chapter5/" },
                { text: "6章 UXデザイン評価・運用・組織化", link: "/quiz/chapter6/" },
                { text: "ランダム 5 問", link: "/quiz/random-5/" },
                { text: "ランダム 10 問", link: "/quiz/random-10/" },
                { text: "模擬試験ボリューム（100問）", link: "/quiz/random-100/" },
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
          // HTML は precache（CacheFirst）に含めない。含めると SW が古い HTML を
          // 返し続け、デプロイ後もハードリロードしないと最新版が出ない。
          // hashed な JS/CSS/画像等はファイル名が変わるので従来どおり precache する。
          globPatterns: ["**/*.{js,css,woff2,png,svg,ico,webp,json}"],
          navigateFallback: null,
          // ナビゲーション（HTML）は NetworkFirst。ネットワークを 5 秒待ち、
          // 取れなければキャッシュにフォールバック（オフライン耐性は維持）。
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "ux-cert-html",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      },
    }),
  ),
);
