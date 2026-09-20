import { tokenize } from "./metrics";
import type { Grader, GradeInput, PlayerGrade } from "./types";

/**
 * Deterministic stand-in for local development and tests. It produces FAKE scores, so
 * main.ts only uses it when GRADER=mock is set explicitly and logs a warning.
 */
export class MockGrader implements Grader {
  readonly model = "mock";
  readonly version = "mock";

  async grade(input: GradeInput): Promise<Record<string, PlayerGrade>> {
    const grades: Record<string, PlayerGrade> = {};
    for (const label of input.gradeLabels) {
      const words = input.turns
        .filter((turn) => turn.speaker === label)
        .reduce((sum, turn) => sum + tokenize(turn.text).length, 0);
      const base = Math.min(90, 50 + words);
      grades[label] = {
        grammar: base, vocabulary: base - 5, conversation: base + 5 > 100 ? 100 : base + 5,
        targetLanguagePct: 100, followUpQuestions: 0, challengeCompleted: false,
        bonusObjectivesMet: [], mistakes: [], strongMoments: [], tips: [],
      };
    }
    return grades;
  }
}
