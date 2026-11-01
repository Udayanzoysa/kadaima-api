export type LocalizedHomepageText = {
  en: string;
  si: string;
  ta: string;
};

export type HomepageHeroConfig = {
  badge: LocalizedHomepageText;
  title: LocalizedHomepageText;
  description: LocalizedHomepageText;
  showSecondaryCta: boolean;
};

export type HomepageCategoryConfig = {
  courseId: string;
  visible: boolean;
  sortOrder: number;
  maxQuizzes: number;
  /** Empty = newest published quizzes up to maxQuizzes */
  quizIds: string[];
};

export type HomepagePromoConfig = {
  enabled: boolean;
  badge: LocalizedHomepageText;
  title: LocalizedHomepageText;
  description: LocalizedHomepageText;
  ctaLabel: LocalizedHomepageText;
  ctaHref: string;
};

export type HomepageConfig = {
  hero: HomepageHeroConfig;
  maxCategories: number;
  categories: HomepageCategoryConfig[];
  promoSection: HomepagePromoConfig;
};

const emptyLocalized = (): LocalizedHomepageText => ({
  en: '',
  si: '',
  ta: '',
});

export const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
  hero: {
    badge: emptyLocalized(),
    title: emptyLocalized(),
    description: emptyLocalized(),
    showSecondaryCta: true,
  },
  maxCategories: 3,
  categories: [],
  promoSection: {
    enabled: false,
    badge: emptyLocalized(),
    title: emptyLocalized(),
    description: emptyLocalized(),
    ctaLabel: emptyLocalized(),
    ctaHref: '/partner',
  },
};

function asLocalized(raw: unknown): LocalizedHomepageText {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<LocalizedHomepageText>;
  return {
    en: typeof obj.en === 'string' ? obj.en : '',
    si: typeof obj.si === 'string' ? obj.si : '',
    ta: typeof obj.ta === 'string' ? obj.ta : '',
  };
}

function asCategory(raw: unknown, index: number): HomepageCategoryConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<HomepageCategoryConfig>;
  const courseId = typeof obj.courseId === 'string' ? obj.courseId.trim() : '';
  if (!courseId) return null;
  const maxQuizzes =
    typeof obj.maxQuizzes === 'number' && Number.isFinite(obj.maxQuizzes)
      ? Math.max(1, Math.min(48, Math.floor(obj.maxQuizzes)))
      : 6;
  const sortOrder =
    typeof obj.sortOrder === 'number' && Number.isFinite(obj.sortOrder)
      ? Math.floor(obj.sortOrder)
      : index;
  const quizIds = Array.isArray(obj.quizIds)
    ? obj.quizIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  return {
    courseId,
    visible: obj.visible !== false,
    sortOrder,
    maxQuizzes,
    quizIds,
  };
}

export function mergeHomepage(raw: unknown): HomepageConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<HomepageConfig>;
  const heroRaw =
    obj.hero && typeof obj.hero === 'object' ? (obj.hero as Partial<HomepageHeroConfig>) : {};
  const promoRaw =
    obj.promoSection && typeof obj.promoSection === 'object'
      ? (obj.promoSection as Partial<HomepagePromoConfig>)
      : {};

  const maxCategories =
    typeof obj.maxCategories === 'number' && Number.isFinite(obj.maxCategories)
      ? Math.max(1, Math.min(20, Math.floor(obj.maxCategories)))
      : DEFAULT_HOMEPAGE_CONFIG.maxCategories;

  const categories = Array.isArray(obj.categories)
    ? obj.categories
        .map((c, i) => asCategory(c, i))
        .filter((c): c is HomepageCategoryConfig => Boolean(c))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c, i) => ({ ...c, sortOrder: i }))
    : [];

  return {
    hero: {
      badge: asLocalized(heroRaw.badge),
      title: asLocalized(heroRaw.title),
      description: asLocalized(heroRaw.description),
      showSecondaryCta: heroRaw.showSecondaryCta !== false,
    },
    maxCategories,
    categories,
    promoSection: {
      enabled: Boolean(promoRaw.enabled),
      badge: asLocalized(promoRaw.badge),
      title: asLocalized(promoRaw.title),
      description: asLocalized(promoRaw.description),
      ctaLabel: asLocalized(promoRaw.ctaLabel),
      ctaHref:
        typeof promoRaw.ctaHref === 'string' && promoRaw.ctaHref.trim()
          ? promoRaw.ctaHref.trim()
          : DEFAULT_HOMEPAGE_CONFIG.promoSection.ctaHref,
    },
  };
}

/** English title keyword → kind for default ordering when seeding. */
export function courseKindFromEnTitle(title: unknown): string {
  const en =
    title && typeof title === 'object' && 'en' in (title as object)
      ? String((title as { en?: string }).en ?? '')
      : String(title ?? '');
  const t = en.toLowerCase();
  if (t.includes('scholarship')) return 'scholarship';
  if (t.includes('ordinary') || t.includes('(o/l)') || /\bo\/l\b/.test(t)) return 'ol';
  if (t.includes('advanced') || t.includes('(a/l)') || /\ba\/l\b/.test(t)) return 'al';
  if (t.includes('driving') || t.includes('licence') || t.includes('license')) return 'driving';
  return 'other';
}

/** Seed order: O/L → A/L → Driving → other → Scholarship last. */
export function seedRankForKind(kind: string): number {
  if (kind === 'ol') return 0;
  if (kind === 'al') return 1;
  if (kind === 'driving') return 2;
  if (kind === 'other') return 3;
  if (kind === 'scholarship') return 4;
  return 5;
}
