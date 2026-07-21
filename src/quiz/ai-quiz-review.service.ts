import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AttemptStatus } from '@prisma/client';
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';
import { SettingsService } from '../settings/settings.service';
import { QuizService } from './quiz.service';

export type ReviewLocale = 'en' | 'si' | 'ta';

export type AiQuizReviewItem = {
  questionId: string;
  questionNumber: number;
  concept: string;
  explanation: string;
  tip: string;
};

export type AiQuizReviewResult = {
  summary: string;
  items: AiQuizReviewItem[];
  locale: ReviewLocale;
  model?: string;
  skipped?: boolean;
  reason?: string;
};

type Localized = { en?: string; si?: string; ta?: string };

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          questionId: { type: SchemaType.STRING },
          questionNumber: { type: SchemaType.NUMBER },
          concept: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          tip: { type: SchemaType.STRING },
        },
        required: [
          'questionId',
          'questionNumber',
          'concept',
          'explanation',
          'tip',
        ],
      },
    },
  },
  required: ['summary', 'items'],
};

const LIVE_MODEL_RE = /live|native-audio/i;

const LANG_NAME: Record<ReviewLocale, string> = {
  en: 'English',
  si: 'Sinhala (සිංහල script)',
  ta: 'Tamil (தமிழ் script)',
};

function asLocalized(value: unknown): Localized {
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return {
      en: typeof o.en === 'string' ? o.en : '',
      si: typeof o.si === 'string' ? o.si : '',
      ta: typeof o.ta === 'string' ? o.ta : '',
    };
  }
  if (typeof value === 'string') return { en: value, si: '', ta: '' };
  return { en: '', si: '', ta: '' };
}

function pickText(value: unknown, locale: ReviewLocale): string {
  const t = asLocalized(value);
  return (t[locale] || t.en || t.si || t.ta || '').trim();
}

function normalizeLocale(raw?: string): ReviewLocale {
  const v = (raw || 'en').trim().toLowerCase();
  if (v === 'si' || v === 'ta' || v === 'en') return v;
  return 'en';
}

/** Prefer the quiz paper language(s); UI locale only when the paper is multilingual. */
function resolveReviewLocale(
  quiz: {
    language?: string | null;
    languages?: string[] | null;
    title?: unknown;
    questions?: Array<{ questionText?: unknown }>;
  },
  requestedRaw?: string,
): ReviewLocale {
  const rawLangs = Array.isArray(quiz.languages) ? quiz.languages : [];
  const fromQuiz = [
    ...(quiz.language ? [quiz.language] : []),
    ...rawLangs,
  ]
    .map((l) => normalizeLocale(String(l)))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  let langs = fromQuiz;
  if (!langs.length) {
    const sample = asLocalized(quiz.questions?.[0]?.questionText ?? quiz.title);
    const inferred: ReviewLocale[] = [];
    if (sample.si?.trim()) inferred.push('si');
    if (sample.ta?.trim()) inferred.push('ta');
    if (sample.en?.trim()) inferred.push('en');
    // Prefer non-English when that is clearly the paper language.
    if (inferred.length === 1) langs = inferred;
    else if (inferred.includes('si') && !inferred.includes('en')) langs = ['si'];
    else if (inferred.includes('ta') && !inferred.includes('en')) langs = ['ta'];
    else if (inferred.includes('si')) langs = ['si'];
    else if (inferred.includes('ta')) langs = ['ta'];
    else if (inferred.includes('en')) langs = ['en'];
  }

  if (langs.length === 1) return langs[0];
  if (langs.length > 1) {
    const requested = normalizeLocale(requestedRaw);
    if (langs.includes(requested)) return requested;
    return langs[0];
  }
  return normalizeLocale(requestedRaw);
}

@Injectable()
export class AiQuizReviewService {
  private readonly logger = new Logger(AiQuizReviewService.name);

  constructor(
    private readonly quizService: QuizService,
    private readonly settingsService: SettingsService,
  ) {}

  async reviewByResultToken(resultToken: string, localeRaw?: string) {
    const attempt = await this.quizService.getAttemptByResultToken(resultToken);
    const locale = resolveReviewLocale(attempt.quiz ?? {}, localeRaw);
    return this.buildReview(attempt, locale);
  }

  async reviewByAttemptId(attemptId: string, localeRaw?: string) {
    const attempt = await this.quizService.getAttemptForStudent(attemptId);
    const locale = resolveReviewLocale(attempt.quiz ?? {}, localeRaw);
    return this.buildReview(attempt, locale);
  }

  private async buildReview(
    attempt: Awaited<ReturnType<QuizService['getAttemptForStudent']>>,
    locale: ReviewLocale,
  ): Promise<AiQuizReviewResult> {
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status === AttemptStatus.In_Progress) {
      throw new BadRequestException(
        'Finish the quiz before requesting an AI review.',
      );
    }

    const questions = attempt.quiz?.questions ?? [];
    const responses = attempt.responses ?? [];

    type ChoiceRow = {
      id: string;
      choiceText?: unknown;
      isCorrect?: boolean;
    };
    type QuestionRow = {
      id: string;
      questionText?: unknown;
      config?: unknown;
      choices?: ChoiceRow[];
    };

    const incorrect = (questions as QuestionRow[])
      .map((question, index) => {
        const response = responses.find((r) => r.questionId === question.id);
        const isCorrect = Boolean(response?.isCorrect);
        const needsManual = Boolean(response?.needsManualReview);
        if (isCorrect || needsManual) return null;

        const choices = question.choices ?? [];
        const selected = choices.find((c) => c.id === response?.selectedChoiceId);
        const correct = choices.find((c) => c.isCorrect);

        let studentAnswer = pickText(selected?.choiceText, locale);
        if (!studentAnswer && response?.textResponse) {
          studentAnswer = String(response.textResponse);
        }
        if (!studentAnswer) studentAnswer = '(no answer)';

        let correctAnswer = pickText(correct?.choiceText, locale);
        if (!correctAnswer && question.config) {
          const cfg = question.config as Record<string, unknown>;
          if (Array.isArray(cfg.acceptedAnswers) && cfg.acceptedAnswers[0]) {
            correctAnswer = String(cfg.acceptedAnswers[0]);
          } else if (cfg.correctNumber != null) {
            correctAnswer = String(cfg.correctNumber);
          }
        }
        if (!correctAnswer) correctAnswer = '(see mark scheme)';

        return {
          questionId: question.id,
          questionNumber: index + 1,
          questionText: pickText(question.questionText, locale),
          studentAnswer,
          correctAnswer,
          choices: choices.map((c, i) => ({
            label: String.fromCharCode(65 + i),
            text: pickText(c.choiceText, locale),
            isCorrect: Boolean(c.isCorrect),
            selected: c.id === response?.selectedChoiceId,
          })),
        };
      })
      .filter(Boolean) as Array<{
      questionId: string;
      questionNumber: number;
      questionText: string;
      studentAnswer: string;
      correctAnswer: string;
      choices: Array<{
        label: string;
        text: string;
        isCorrect: boolean;
        selected: boolean;
      }>;
    }>;

    const total = questions.length;
    const wrongCount = incorrect.length;
    const score = attempt.finalScore ?? 0;

    if (wrongCount === 0) {
      const summary =
        locale === 'si'
          ? 'ඉතා හොඳයි! සියලු ප්‍රශ්නවලට නිවැරදිව පිළිතුරු දී ඇත. දුර්වල ක්ෂේත්‍ර සඳහා සමාලෝචනයක් අවශ්‍ය නොවේ.'
          : locale === 'ta'
            ? 'அற்புதம்! எல்லா கேள்விகளுக்கும் சரியாக பதிலளித்துள்ளீர்கள். தவறுகள் இல்லாததால் கூடுதல் பகுப்பாய்வு தேவையில்லை.'
            : 'Great job! You answered every question correctly. No mistake review is needed.';
      return {
        summary,
        items: [],
        locale,
        skipped: true,
        reason: 'all_correct',
      };
    }

    const cfg = await this.settingsService.getAiChatConfig();
    if (!cfg.enabled) {
      return {
        summary:
          locale === 'si'
            ? 'AI සමාලෝචනය තාවකාලිකව අක්‍රියයි. පරිපාලකයෙකුට Settings → AI Chat තුළ සක්‍රිය කළ හැක.'
            : locale === 'ta'
              ? 'AI மதிப்பாய்வு தற்காலிகமாக முடக்கப்பட்டுள்ளது. நிர்வாகி Settings → AI Chat இல் இயக்கலாம்.'
              : 'AI review is temporarily disabled. An admin can enable it under Settings → AI Chat.',
        items: [],
        locale,
        skipped: true,
        reason: 'ai_disabled',
      };
    }
    if (!cfg.apiKey?.trim()) {
      return {
        summary:
          locale === 'si'
            ? 'AI සමාලෝචනය සකසා නැත. Super admin කෙනෙකුට Gemini API key එක Settings → AI Chat තුළ එක් කළ යුතුය.'
            : locale === 'ta'
              ? 'AI மதிப்பாய்வு அமைக்கப்படவில்லை. Super admin Gemini API key ஐ Settings → AI Chat இல் சேர்க்க வேண்டும்.'
              : 'AI review is not configured yet. A super admin must set the Gemini API key under Settings → AI Chat.',
        items: [],
        locale,
        skipped: true,
        reason: 'missing_api_key',
      };
    }

    let primaryModel = cfg.model || 'gemini-3-flash-preview';
    if (LIVE_MODEL_RE.test(primaryModel)) {
      primaryModel = 'gemini-3-flash-preview';
    }
    const fallbackModels = cfg.fallbacks
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m && !LIVE_MODEL_RE.test(m));
    const modelCandidates = [...new Set([primaryModel, ...fallbackModels])];

    const systemPrompt = `You are "Kadaima Virtual Teacher", a supportive AI tutor for Sri Lankan students (Scholarship, O/L, A/L, driving exams).

Analyze ONLY the incorrect quiz answers. For each item:
1. Identify the likely conceptual misunderstanding (short concept name).
2. Explain constructively why the student's answer was wrong and why the correct answer is right.
3. Give one memorable tip/rule for next time.

Rules:
- Write ALL text (summary, concept, explanation, tip) in ${LANG_NAME[locale]} only.
- Be encouraging, clear, and age-appropriate. No shaming.
- Keep each explanation to 2–4 sentences. Tips to 1 sentence.
- Use the provided questionId and questionNumber exactly.
- Do not invent facts beyond the question content.
- summary: 1–2 sentences overview of weak spots.`;

    const userPayload = {
      locale,
      scorePercent: score,
      totalQuestions: total,
      incorrectCount: wrongCount,
      incorrectItems: incorrect,
    };

    const genAI = new GoogleGenerativeAI(cfg.apiKey);
    const failures: string[] = [];

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        });

        const result = await model.generateContent(
          `Review these incorrect answers and return JSON only:\n${JSON.stringify(userPayload)}`,
        );
        const raw = result.response.text()?.trim();
        if (!raw) {
          failures.push(`${modelName}: empty response`);
          continue;
        }

        const parsed = JSON.parse(raw) as {
          summary?: string;
          items?: Array<Partial<AiQuizReviewItem>>;
        };

        const allowedIds = new Set(incorrect.map((i) => i.questionId));
        const items: AiQuizReviewItem[] = (parsed.items ?? [])
          .filter((item) => item.questionId && allowedIds.has(String(item.questionId)))
          .map((item) => {
            const fallback = incorrect.find((i) => i.questionId === item.questionId)!;
            return {
              questionId: String(item.questionId),
              questionNumber: Number(item.questionNumber) || fallback.questionNumber,
              concept: String(item.concept || '').trim() || 'Concept review',
              explanation: String(item.explanation || '').trim(),
              tip: String(item.tip || '').trim(),
            };
          })
          .filter((item) => item.explanation);

        if (!items.length) {
          failures.push(`${modelName}: no usable items`);
          continue;
        }

        return {
          summary: String(parsed.summary || '').trim() ||
            (locale === 'si'
              ? 'වැරදි ප්‍රශ්න සඳහා පුද්ගලික සමාලෝචනයක් මෙන්න.'
              : locale === 'ta'
                ? 'தவறான கேள்விகளுக்கான தனிப்பட்ட மதிப்பாய்வு இதோ.'
                : 'Here is a personalized review of your incorrect answers.'),
          items,
          locale,
          model: modelName,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${modelName}: ${message}`);
        this.logger.warn(`AI quiz review failed on ${modelName}: ${message}`);
      }
    }

    this.logger.error(`All Gemini models failed for quiz review: ${failures.join(' | ')}`);
    throw new ServiceUnavailableException(
      'AI review is temporarily unavailable. Please try again in a moment.',
    );
  }
}
