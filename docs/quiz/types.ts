export type ChapterId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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

export type StoredAnswer = { correct: boolean; ts: number; selectedIndex?: number | null };
export type StoredAnswers = Record<string, StoredAnswer>;

export type ChapterMeta = {
  id: ChapterId;
  title: string;
  lessonRange: [string, string];
};

export const chapters: ChapterMeta[] = [
  { id: 1, title: "UXインテリジェンスの理念", lessonRange: ["lesson01", "lesson05"] },
  { id: 2, title: "UX関連基礎知識", lessonRange: ["lesson06", "lesson15"] },
  { id: 3, title: "UXプロジェクト計画", lessonRange: ["lesson16", "lesson17"] },
  { id: 4, title: "ユーザー理解", lessonRange: ["lesson18", "lesson21"] },
  { id: 5, title: "ユーザー要求定義と具現化", lessonRange: ["lesson22", "lesson27"] },
  { id: 6, title: "UXデザイン評価・運用・組織化", lessonRange: ["lesson28", "lesson31"] },
  { id: 7, title: "AI時代のUX能力", lessonRange: ["lesson32", "lesson35"] },
];
