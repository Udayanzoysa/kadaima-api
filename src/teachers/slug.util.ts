const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'brand',
  'dashboard',
  'default',
  'forgot-password',
  'login',
  'me',
  'quiz',
  'quizzes',
  'register',
  'reset-password',
  'results',
  'settings',
  'student',
  't',
  'teacher',
  'teachers',
  'users',
]);

export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function assertValidSlug(slug: string): string {
  const normalized = normalizeSlug(slug);
  if (!normalized || normalized.length < 2) {
    throw new Error('Slug must be at least 2 characters.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error('Slug may only contain lowercase letters, numbers, and hyphens.');
  }
  if (RESERVED_SLUGS.has(normalized)) {
    throw new Error('This slug is reserved. Please choose another.');
  }
  return normalized;
}

export function slugFromName(name: string, fallback: string): string {
  const base = normalizeSlug(name) || normalizeSlug(fallback.split('@')[0] || 'teacher');
  return base || 'teacher';
}
