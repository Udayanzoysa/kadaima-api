import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SettingsService } from '../settings/settings.service';

const SYSTEM_PROMPT = `You are "Kadaima Expert", a friendly support assistant for Kadaima — Sri Lanka's online exam and quiz portal for Scholarship, O/L, A/L, and International students.

Help with:
- Finding and taking quizzes
- Unlocking premium / paid quizzes and subscriptions
- Account login, registration, and profile basics
- How attempts, results, and progress work
- General study guidance related to the platform

Rules:
- Keep answers short and clear (2–6 sentences unless the student asks for detail).
- Reply in the same language the student used (English, Sinhala, or Tamil).
- If you are unsure, say so and suggest the Contact page or checking the Quiz catalog.
- Do not invent payment confirmations, grades, or account data you cannot see.
- Do not discuss unrelated topics at length; gently steer back to Kadaima help.`;

/** Live / native-audio model ids cannot be used with generateContent text chat. */
const LIVE_MODEL_RE = /live|native-audio/i;

@Injectable()
export class SupportChatService {
  private readonly logger = new Logger(SupportChatService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async getReply(studentMessage: string): Promise<string> {
    const trimmed = studentMessage.trim();
    if (!trimmed) {
      return 'Please type a question and I will help.';
    }

    const cfg = await this.settingsService.getAiChatConfig();
    if (!cfg.enabled) {
      return (
        'Kadaima Expert is temporarily disabled by an administrator. ' +
        'Please try again later or visit the Contact page.'
      );
    }

    if (!cfg.apiKey) {
      this.logger.warn('AI API key missing — configure it under Settings → AI Chat');
      return (
        'Kadaima Expert is almost ready, but the Gemini API key is not configured yet. ' +
        'A super admin can set it under Settings → AI Chat.'
      );
    }

    let primaryModel = cfg.model || 'gemini-3-flash-preview';
    if (LIVE_MODEL_RE.test(primaryModel)) {
      this.logger.warn(
        `Model "${primaryModel}" is a Live/voice model; using gemini-3-flash-preview for text chat.`,
      );
      primaryModel = 'gemini-3-flash-preview';
    }

    const fallbackModels = cfg.fallbacks
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m && !LIVE_MODEL_RE.test(m));
    const modelCandidates = [...new Set([primaryModel, ...fallbackModels])];

    const genAI = new GoogleGenerativeAI(cfg.apiKey);
    const failures: string[] = [];

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 512,
          },
        });
        const result = await model.generateContent(trimmed);
        const text = result.response.text()?.trim();
        if (text) {
          return text;
        }
        failures.push(`${modelName}: empty response`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${modelName}: ${message}`);
        this.logger.warn(`Gemini chat failed on ${modelName}: ${message}`);
      }
    }

    this.logger.error(`All Gemini models failed: ${failures.join(' | ')}`);
    return (
      'Sorry — I could not reach the AI service right now. ' +
      'Please try again in a moment, or use Contact us for direct help.'
    );
  }
}
