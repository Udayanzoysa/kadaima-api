import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai';
import { QuestionType } from '@prisma/client';
import { readFile } from 'fs/promises';

export type AiDraftChoice = {
  choiceText: { en: string; si: string; ta: string };
  isCorrect: boolean;
};

export type AiDraftQuestion = {
  questionText: { en: string; si: string; ta: string };
  type: QuestionType;
  points: number;
  status: 'Draft';
  imageUrl: null;
  config: Record<string, unknown>;
  choices: AiDraftChoice[];
  confidence?: number;
};

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          questionText: {
            type: SchemaType.OBJECT,
            properties: {
              en: { type: SchemaType.STRING },
              si: { type: SchemaType.STRING },
              ta: { type: SchemaType.STRING },
            },
            required: ['en', 'si', 'ta'],
          },
          type: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['MCQ', 'SHORT_TEXT', 'NUMERIC'],
          },
          points: { type: SchemaType.NUMBER },
          choices: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                choiceText: {
                  type: SchemaType.OBJECT,
                  properties: {
                    en: { type: SchemaType.STRING },
                    si: { type: SchemaType.STRING },
                    ta: { type: SchemaType.STRING },
                  },
                  required: ['en', 'si', 'ta'],
                },
                isCorrect: { type: SchemaType.BOOLEAN },
              },
              required: ['choiceText', 'isCorrect'],
            },
          },
          acceptedAnswers: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          correctNumber: { type: SchemaType.NUMBER },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['questionText', 'type', 'points'],
      },
    },
  },
  required: ['questions'],
};

const SYSTEM_PROMPT = `You are an expert exam paper parser for Sri Lankan school exams
(Grade 5 Scholarship, G.C.E. O/L, G.C.E. A/L, and similar).

Extract assessment questions from the attached exam paper PDF.

Rules:
1. Return ONLY questions you can clearly identify. Skip instructions, covers, and blank pages.
2. Prefer MCQ when options A/B/C/D (or 1/2/3/4) exist. Use SHORT_TEXT for open answers. Use NUMERIC for numeric-only answers.
3. For MCQ: include every option you see. Mark exactly one choice as isCorrect when the paper (or answer key) indicates it. If the correct answer is unknown, still include choices and set isCorrect=false on all (teacher will fix).
4. Provide questionText and choiceText in en, si, and ta. If the paper is only in one language, put that text in the matching locale and copy a clear English version into en when possible; leave other locales as "" if you cannot translate confidently.
5. Extract at most 40 questions.
6. Set confidence from 0 to 1 for each question.
7. Do not invent content that is not in the paper.`;

@Injectable()
export class AiQuestionImportService {
  constructor(private config: ConfigService) {}

  async importFromPdf(file: Express.Multer.File): Promise<{
    questions: AiDraftQuestion[];
    provider: string;
    model: string;
    sourceFileName: string;
  }> {
    if (!file) {
      throw new BadRequestException('PDF file is required');
    }
    if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
      throw new BadRequestException('Only PDF files are supported');
    }

    const provider = (this.config.get<string>('AI_PROVIDER') || 'gemini').toLowerCase();
    if (provider !== 'gemini') {
      throw new BadRequestException(`AI provider "${provider}" is not configured yet. Use gemini.`);
    }

    const apiKey = this.config.get<string>('AI_API_KEY') || process.env.AI_API_KEY || '';
    if (!apiKey.trim()) {
      throw new ServiceUnavailableException(
        'AI is not configured. Set AI_API_KEY (Gemini API key) in the API .env file.',
      );
    }

    const primaryModel =
      this.config.get<string>('AI_MODEL') ||
      process.env.AI_MODEL ||
      'gemini-2.0-flash';
    const fallbackModels = (
      this.config.get<string>('AI_MODEL_FALLBACKS') ||
      process.env.AI_MODEL_FALLBACKS ||
      'gemini-2.0-flash-lite,gemini-2.5-flash,gemini-flash-lite-latest'
    )
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const modelCandidates = [...new Set([primaryModel, ...fallbackModels])];

    const bytes = file.buffer?.length
      ? file.buffer
      : await readFile(file.path);

    // Gemini inline PDF limit is effectively ~20MB; reject early with a clear message.
    if (bytes.length > 18 * 1024 * 1024) {
      throw new BadRequestException(
        'PDF is too large for AI import (max ~18MB). Split the paper or compress the scan.',
      );
    }

    const base64 = bytes.toString('base64');
    const genAI = new GoogleGenerativeAI(apiKey);
    const parts = [
      { text: SYSTEM_PROMPT },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64,
        },
      },
      {
        text: 'Extract the questions from this exam paper PDF into the JSON schema.',
      },
    ];

    const { rawText, modelName } = await this.generateWithFallback(
      genAI,
      modelCandidates,
      parts,
    );

    const questions = this.normalizeQuestions(rawText);
    if (!questions.length) {
      throw new BadRequestException(
        'No questions could be extracted from this PDF. Try a clearer scan or a digital PDF.',
      );
    }

    return {
      questions,
      provider: 'gemini',
      model: modelName,
      sourceFileName: file.originalname,
    };
  }

  private async generateWithFallback(
    genAI: GoogleGenerativeAI,
    modelCandidates: string[],
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
  ): Promise<{ rawText: string; modelName: string }> {
    const failures: string[] = [];

    for (const modelName of modelCandidates) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await model.generateContent(parts);
          return { rawText: result.response.text(), modelName };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const retryMs = this.parseRetryMs(message);
          const kind = this.classifyGeminiError(message);

          if (kind === 'quota' && attempt === 0 && retryMs > 0 && retryMs <= 20000) {
            await this.sleep(retryMs);
            continue;
          }

          failures.push(`${modelName}: ${kind}`);
          // Try next model for quota/denied/not-found; stop on other errors.
          if (kind === 'other') {
            throw new BadRequestException(this.formatGeminiUserError(message, failures));
          }
          break;
        }
      }
    }

    throw new ServiceUnavailableException(
      this.formatGeminiUserError(
        failures.map((f) => f).join('; ') || 'Gemini request failed',
        failures,
      ),
    );
  }

  private classifyGeminiError(message: string): 'quota' | 'denied' | 'not_found' | 'other' {
    const lower = message.toLowerCase();
    if (lower.includes('429') || lower.includes('quota') || lower.includes('rate-limit')) {
      return 'quota';
    }
    if (lower.includes('403') || lower.includes('denied access')) {
      return 'denied';
    }
    if (lower.includes('404') || lower.includes('not found')) {
      return 'not_found';
    }
    return 'other';
  }

  private parseRetryMs(message: string): number {
    const match = message.match(/retry in\s+([\d.]+)\s*s/i);
    if (!match) return 0;
    return Math.ceil(Number(match[1]) * 1000);
  }

  private formatGeminiUserError(message: string, failures: string[]): string {
    const kind = this.classifyGeminiError(message);
    if (kind === 'quota' || failures.some((f) => f.includes('quota'))) {
      return (
        'Gemini API quota exceeded for this API key/project (free-tier limit is 0 or exhausted). ' +
        'Create a new key at https://aistudio.google.com/apikey (or enable billing), ' +
        'set AI_API_KEY in .env, and restart the API. ' +
        `Tried: ${failures.join(', ') || 'primary model'}.`
      );
    }
    if (kind === 'denied' || failures.some((f) => f.includes('denied'))) {
      return (
        'This Gemini project was denied access to the model. ' +
        'Create a fresh API key in Google AI Studio and update AI_API_KEY. ' +
        `Tried: ${failures.join(', ') || 'primary model'}.`
      );
    }
    return `AI analysis failed: ${message}`;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeQuestions(rawText: string): AiDraftQuestion[] {
    let parsed: { questions?: unknown[] };
    try {
      parsed = JSON.parse(rawText) as { questions?: unknown[] };
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) return [];
      try {
        parsed = JSON.parse(match[0]) as { questions?: unknown[] };
      } catch {
        return [];
      }
    }

    const items = Array.isArray(parsed.questions) ? parsed.questions : [];
    const out: AiDraftQuestion[] = [];

    for (const item of items.slice(0, 40)) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const questionText = this.asLocalized(row.questionText);
      if (!questionText.en.trim() && !questionText.si.trim() && !questionText.ta.trim()) {
        continue;
      }
      if (!questionText.en.trim()) {
        questionText.en = questionText.si.trim() || questionText.ta.trim();
      }

      const type = this.asType(row.type);
      const points = Math.max(1, Math.round(Number(row.points) || 1));
      const confidence = Number(row.confidence);
      const choicesRaw = Array.isArray(row.choices) ? row.choices : [];

      let choices: AiDraftChoice[] = choicesRaw
        .map((c) => {
          if (!c || typeof c !== 'object') return null;
          const choice = c as Record<string, unknown>;
          const choiceText = this.asLocalized(choice.choiceText);
          if (!choiceText.en.trim()) {
            choiceText.en = choiceText.si.trim() || choiceText.ta.trim();
          }
          if (!choiceText.en.trim() && !choiceText.si.trim() && !choiceText.ta.trim()) {
            return null;
          }
          return {
            choiceText,
            isCorrect: Boolean(choice.isCorrect),
          };
        })
        .filter((c): c is AiDraftChoice => Boolean(c));

      if (type === QuestionType.MCQ) {
        if (choices.length < 2) continue;
        const correctCount = choices.filter((c) => c.isCorrect).length;
        if (correctCount > 1) {
          let kept = false;
          choices = choices.map((c) => {
            if (c.isCorrect && !kept) {
              kept = true;
              return c;
            }
            return { ...c, isCorrect: false };
          });
        }
      } else {
        choices = [];
      }

      const config: Record<string, unknown> = { contentFormat: 'plain' };
      if (type === QuestionType.SHORT_TEXT) {
        const accepted = Array.isArray(row.acceptedAnswers)
          ? row.acceptedAnswers.map(String).filter((s) => s.trim())
          : [];
        config.acceptedAnswers = accepted.length
          ? accepted
          : [questionText.en].filter(Boolean);
        config.matchMode = 'case_insensitive';
      }
      if (type === QuestionType.NUMERIC && typeof row.correctNumber === 'number') {
        config.correctNumber = row.correctNumber;
        config.tolerance = 0;
      }

      out.push({
        questionText,
        type,
        points,
        status: 'Draft',
        imageUrl: null,
        config,
        choices,
        confidence: Number.isFinite(confidence) ? confidence : undefined,
      });
    }

    return out;
  }

  private asLocalized(value: unknown): { en: string; si: string; ta: string } {
    if (!value || typeof value !== 'object') {
      return { en: '', si: '', ta: '' };
    }
    const v = value as Record<string, unknown>;
    return {
      en: String(v.en ?? ''),
      si: String(v.si ?? ''),
      ta: String(v.ta ?? ''),
    };
  }

  private asType(value: unknown): QuestionType {
    const t = String(value || 'MCQ').toUpperCase();
    if (t === 'SHORT_TEXT') return QuestionType.SHORT_TEXT;
    if (t === 'NUMERIC') return QuestionType.NUMERIC;
    return QuestionType.MCQ;
  }
}
