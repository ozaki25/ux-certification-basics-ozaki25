export type ChapterId = 1 | 2 | 3 | 4 | 5 | 6;

export type Difficulty = "easy" | "normal" | "hard";

export type Quiz = {
  id: string;
  lesson: string;
  difficulty: Difficulty;
  question: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
};

export const STORAGE_KEY = "quiz-answers";
export const STREAK_KEY = "quiz-streak-dates";

export type StoredAnswer = { correct: boolean; ts: number; selectedIndex?: number | null };
export type StoredAnswers = Record<string, StoredAnswer>;

export type ChapterMeta = {
  id: ChapterId;
  title: string;
  lessonRange: [string, string];
};

export const chapters: ChapterMeta[] = [
  { id: 1, title: "UXインテリジェンスの理念", lessonRange: ["lesson01", "lesson03"] },
  { id: 2, title: "UX関連基礎知識", lessonRange: ["lesson04", "lesson08"] },
  { id: 3, title: "UXプロジェクトの計画", lessonRange: ["lesson09", "lesson11"] },
  { id: 4, title: "ユーザー理解と要求定義", lessonRange: ["lesson12", "lesson16"] },
  { id: 5, title: "UXデザインの具現化と評価", lessonRange: ["lesson17", "lesson21"] },
  { id: 6, title: "UX運用・グロースと組織化", lessonRange: ["lesson22", "lesson24"] },
];
