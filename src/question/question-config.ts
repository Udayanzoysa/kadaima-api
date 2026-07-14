import { QuestionType } from '@prisma/client';

export type ContentFormat = 'plain' | 'html';
export type MatchMode = 'exact' | 'case_insensitive' | 'regex';

/**
 * Stored on Question.config. Sensitive keys must be stripped for in-progress attempts.
 */
export interface QuestionConfig {
  contentFormat?: ContentFormat;
  /** SHORT_TEXT accepted answers (any locale string that should match). */
  acceptedAnswers?: string[];
  matchMode?: MatchMode;
  /** NUMERIC */
  correctNumber?: number;
  tolerance?: number;
  min?: number;
  max?: number;
  /** SEQUENCE — choice IDs in the correct order */
  correctOrder?: string[];
  /** ESSAY */
  minWords?: number;
  minSentences?: number;
}

export function parseQuestionConfig(raw: unknown): QuestionConfig {
  if (!raw || typeof raw !== 'object') return {};
  return raw as QuestionConfig;
}

/** Safe subset for students while the attempt is in progress. */
export function publicQuestionConfig(raw: unknown): QuestionConfig {
  const c = parseQuestionConfig(raw);
  return {
    contentFormat: c.contentFormat ?? 'plain',
    min: c.min,
    max: c.max,
    minWords: c.minWords,
    minSentences: c.minSentences,
  };
}

export interface GradeInput {
  type: QuestionType;
  config: unknown;
  choices: Array<{ id: string; isCorrect: boolean }>;
  choiceId?: string | null;
  textResponse?: string | null;
}

export interface GradeResult {
  isCorrect: boolean;
  needsManualReview: boolean;
}

function normalize(s: string) {
  return s.trim().replace(/\s+/g, ' ');
}

function gradeShortText(config: QuestionConfig, text: string): boolean {
  const answers = (config.acceptedAnswers ?? [])
    .map((a) => normalize(a))
    .filter(Boolean);
  if (!answers.length || !text.trim()) return false;

  const mode = config.matchMode ?? 'case_insensitive';
  const value = normalize(text);

  if (mode === 'exact') {
    return answers.some((a) => a === value);
  }
  if (mode === 'regex') {
    return answers.some((pattern) => {
      try {
        return new RegExp(pattern, 'i').test(value);
      } catch {
        return false;
      }
    });
  }
  // case_insensitive
  const lower = value.toLowerCase();
  return answers.some((a) => a.toLowerCase() === lower);
}

function gradeNumeric(config: QuestionConfig, text: string): boolean {
  if (config.correctNumber === undefined || config.correctNumber === null) {
    return false;
  }
  const cleaned = text.trim().replace(/,/g, '');
  const num = Number(cleaned);
  if (Number.isNaN(num)) return false;
  if (config.min !== undefined && num < config.min) return false;
  if (config.max !== undefined && num > config.max) return false;
  const tolerance = config.tolerance ?? 0;
  return Math.abs(num - config.correctNumber) <= tolerance;
}

function gradeSequence(config: QuestionConfig, text: string): boolean {
  const expected = config.correctOrder ?? [];
  if (!expected.length || !text.trim()) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return false;
    if (parsed.length !== expected.length) return false;
    return expected.every((id, i) => parsed[i] === id);
  } catch {
    return false;
  }
}

export function gradeResponse(input: GradeInput): GradeResult {
  const config = parseQuestionConfig(input.config);
  const text = input.textResponse ?? '';

  switch (input.type) {
    case QuestionType.MCQ: {
      const correct = input.choices.find((c) => c.isCorrect);
      return {
        isCorrect: Boolean(input.choiceId && correct && correct.id === input.choiceId),
        needsManualReview: false,
      };
    }
    case QuestionType.SHORT_TEXT:
      return {
        isCorrect: gradeShortText(config, text),
        needsManualReview: false,
      };
    case QuestionType.NUMERIC:
      return {
        isCorrect: gradeNumeric(config, text),
        needsManualReview: false,
      };
    case QuestionType.SEQUENCE:
      return {
        isCorrect: gradeSequence(config, text),
        needsManualReview: false,
      };
    case QuestionType.ESSAY:
      return { isCorrect: false, needsManualReview: true };
    default:
      return { isCorrect: false, needsManualReview: false };
  }
}

export function typeRequiresChoices(type: QuestionType): boolean {
  return type === QuestionType.MCQ || type === QuestionType.SEQUENCE;
}

export function validateQuestionPayload(input: {
  type: QuestionType;
  choices?: Array<{ isCorrect?: boolean; choiceText?: { en?: string } }>;
  config?: QuestionConfig;
}): string | null {
  const type = input.type;
  const choices = input.choices ?? [];
  const config = input.config ?? {};

  if (type === QuestionType.MCQ) {
    if (choices.length < 2) return 'MCQ requires at least two choices.';
    if (!choices.some((c) => c.isCorrect)) return 'Mark one correct MCQ answer.';
  }

  if (type === QuestionType.SEQUENCE) {
    if (choices.length < 2) return 'Sequencing requires at least two items.';
    if (!config.correctOrder?.length) {
      // Allow order = current choices order when correctOrder omitted (filled by service).
    }
  }

  if (type === QuestionType.SHORT_TEXT) {
    if (!config.acceptedAnswers?.some((a) => a.trim())) {
      return 'Add at least one accepted short answer.';
    }
  }

  if (type === QuestionType.NUMERIC) {
    if (config.correctNumber === undefined || Number.isNaN(Number(config.correctNumber))) {
      return 'Set the correct numeric answer.';
    }
  }

  return null;
}
