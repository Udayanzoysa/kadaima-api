import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const AI_CHAT_MODELS = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
] as const;

export type AiChatModel = (typeof AI_CHAT_MODELS)[number];

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['gemini'], example: 'gemini' })
  @IsOptional()
  @IsIn(['gemini'])
  provider?: 'gemini';

  @ApiPropertyOptional({
    enum: AI_CHAT_MODELS,
    example: 'gemini-3-flash-preview',
    description:
      'Text-chat model for Kadaima Expert + WhatsApp. Gemini 3 Flash Live is voice-only (Live API) and is not used here.',
  })
  @IsOptional()
  @IsIn(AI_CHAT_MODELS)
  model?: AiChatModel;

  @ApiPropertyOptional({
    description: 'Gemini API key. Leave blank to keep the current key.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional({
    example: 'gemini-2.0-flash-lite,gemini-2.5-flash',
    description: 'Comma-separated fallback model ids',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fallbacks?: string;
}
