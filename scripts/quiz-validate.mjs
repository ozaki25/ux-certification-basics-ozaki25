#!/usr/bin/env node
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const lessonsDir = resolve(repoRoot, "docs/lessons");
const dataDir = resolve(repoRoot, "docs/quiz/data");

const validDifficulties = new Set(["easy", "normal", "hard"]);
const idPattern = /^q\d{3,4}$/;

const lessonDirs = new Set(
  readdirSync(lessonsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^lesson\d+$/.test(e.name))
    .map((e) => e.name),
);

const errors = [];
const seenIds = new Map();
let totalCount = 0;
const perChapter = {};
const perDifficulty = { easy: 0, normal: 0, hard: 0 };

for (let ch = 1; ch <= 6; ch++) {
  const file = resolve(dataDir, `chapter${ch}.ts`);
  if (!existsSync(file)) {
    errors.push(`[chapter${ch}] file missing: ${file}`);
    continue;
  }

  const mod = await import(file);
  const quizzes = mod[`chapter${ch}`];

  if (!Array.isArray(quizzes)) {
    errors.push(`[chapter${ch}] export 'chapter${ch}' is not an array`);
    continue;
  }

  perChapter[ch] = quizzes.length;
  totalCount += quizzes.length;

  for (const [i, q] of quizzes.entries()) {
    const at = `[chapter${ch}#${i}]`;

    if (typeof q.id !== "string" || !idPattern.test(q.id)) {
      errors.push(`${at} invalid id: ${JSON.stringify(q.id)}`);
    } else if (seenIds.has(q.id)) {
      errors.push(`${at} duplicate id '${q.id}' (also in ${seenIds.get(q.id)})`);
    } else {
      seenIds.set(q.id, `chapter${ch}#${i}`);
    }

    if (typeof q.lesson !== "string" || !lessonDirs.has(q.lesson)) {
      errors.push(`${at} lesson '${q.lesson}' does not exist in docs/lessons/`);
    }

    if (!validDifficulties.has(q.difficulty)) {
      errors.push(`${at} invalid difficulty: ${JSON.stringify(q.difficulty)}`);
    } else {
      perDifficulty[q.difficulty]++;
    }

    if (typeof q.question !== "string" || q.question.trim().length === 0) {
      errors.push(`${at} question is empty`);
    }

    if (!Array.isArray(q.choices) || q.choices.length !== 4) {
      errors.push(`${at} choices must have exactly 4 items (got ${q.choices?.length ?? "?"})`);
    } else {
      const distinct = new Set(q.choices.map((c) => c.trim()));
      if (distinct.size !== 4) {
        errors.push(`${at} choices contain duplicates`);
      }
      for (const [j, c] of q.choices.entries()) {
        if (typeof c !== "string" || c.trim().length === 0) {
          errors.push(`${at} choice[${j}] is empty`);
        }
      }
    }

    if (![0, 1, 2, 3].includes(q.answer)) {
      errors.push(`${at} answer must be 0-3 (got ${q.answer})`);
    }

    if (typeof q.explanation !== "string" || q.explanation.trim().length === 0) {
      errors.push(`${at} explanation is empty`);
    }
  }
}

console.log("=== Quiz validation ===");
console.log(`Total: ${totalCount} questions`);
for (let ch = 1; ch <= 6; ch++) {
  console.log(`  chapter${ch}: ${perChapter[ch] ?? 0}`);
}
console.log(
  `Difficulty: easy=${perDifficulty.easy} normal=${perDifficulty.normal} hard=${perDifficulty.hard}`,
);

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log("\n✓ All quizzes valid.");
