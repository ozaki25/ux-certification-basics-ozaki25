import DefaultTheme from "vitepress/theme";
import { enhanceAppWithTabs } from "vitepress-plugin-tabs/client";
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import type { EnhanceAppContext, Theme } from "vitepress";
import QuizCard from "./components/QuizCard.vue";
import QuizPage from "./components/QuizPage.vue";
import QuizTop from "./components/QuizTop.vue";
import QuizReview from "./components/QuizReview.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: EnhanceAppContext) {
    enhanceAppWithTabs(app);
    app.component("QuizCard", QuizCard);
    app.component("QuizPage", QuizPage);
    app.component("QuizTop", QuizTop);
    app.component("QuizReview", QuizReview);
    if (typeof window !== "undefined") {
      try {
        inject();
        injectSpeedInsights();
      } catch {
        // analytics の失敗でサイト全体を壊さない
      }
    }
  },
} satisfies Theme;
