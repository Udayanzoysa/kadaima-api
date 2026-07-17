import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  PORT: Joi.number().default(4000),
  FRONTEND_URL: Joi.string().uri().optional(),

  RESET_TOKEN_TTL: Joi.number().integer().min(60).default(600),
  SUPPORT_EMAIL: Joi.string().email().allow('').optional(),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().integer().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SMTP_FROM: Joi.string().allow('').optional(),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),

  SMS_GATEWAY_PROVIDER: Joi.string().valid('HUTCH', 'NOTIFY_LK').default('HUTCH'),
  NOTIFY_USER_ID: Joi.string().allow('').optional(),
  NOTIFY_API_KEY: Joi.string().allow('').optional(),
  NOTIFY_SENDER_ID: Joi.string().allow('').optional(),
  NOTIFY_API_URL: Joi.string().uri().allow('').optional(),
  HUTCH_API_URL: Joi.string().uri().allow('').optional(),
  HUTCH_USERNAME: Joi.string().allow('').optional(),
  HUTCH_API_KEY: Joi.string().allow('').optional(),
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),

  // AI question import (Gemini default)
  AI_PROVIDER: Joi.string().valid('gemini', 'openai').default('gemini'),
  AI_API_KEY: Joi.string().allow('').optional(),
  AI_MODEL: Joi.string().allow('').optional(),
  AI_MODEL_FALLBACKS: Joi.string().allow('').optional(),
}).unknown(true);
