export type SeoConfig = {
  siteName: string;
  metaTitle: string;
  metaDescription: string;
  googleAnalyticsId: string;
  ogImageUrl: string;
  keywords: string;
};

export const DEFAULT_SEO_CONFIG: SeoConfig = {
  siteName: 'Kadaima',
  metaTitle: "Kadaima | Sri Lanka's Leading Online Exam & Quiz Portal",
  metaDescription:
    'Master your exams with Kadaima. Access a wide range of online practice tests, quizzes, and assessments tailored for Sri Lankan students. Start learning today!',
  googleAnalyticsId: 'G-80G4MMHK8B',
  ogImageUrl: '',
  keywords: 'online exam, quiz portal, scholarship, O/L, A/L, Sri Lanka, Kadaima',
};

export function mergeSeo(raw: unknown): SeoConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<SeoConfig>;
  return {
    siteName: (obj.siteName ?? DEFAULT_SEO_CONFIG.siteName).trim() || DEFAULT_SEO_CONFIG.siteName,
    metaTitle:
      (obj.metaTitle ?? DEFAULT_SEO_CONFIG.metaTitle).trim() || DEFAULT_SEO_CONFIG.metaTitle,
    metaDescription:
      (obj.metaDescription ?? DEFAULT_SEO_CONFIG.metaDescription).trim() ||
      DEFAULT_SEO_CONFIG.metaDescription,
    googleAnalyticsId: (obj.googleAnalyticsId ?? DEFAULT_SEO_CONFIG.googleAnalyticsId)
      .trim()
      .toUpperCase(),
    ogImageUrl: (obj.ogImageUrl ?? '').trim(),
    keywords: (obj.keywords ?? DEFAULT_SEO_CONFIG.keywords).trim(),
  };
}
