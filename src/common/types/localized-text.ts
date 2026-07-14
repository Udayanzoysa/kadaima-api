export type SupportedLocale = 'en' | 'si' | 'ta';

export type LocalizedText = Record<SupportedLocale, string>;

export function isLocalizedText(value: unknown): value is LocalizedText {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.en === 'string' && typeof obj.si === 'string' && typeof obj.ta === 'string';
}

export function getLocalizedValue(text: unknown, locale: SupportedLocale = 'en'): string {
  if (!isLocalizedText(text)) return '';
  return text[locale] || text.en || '';
}
