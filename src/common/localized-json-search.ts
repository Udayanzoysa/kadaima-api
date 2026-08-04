import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Escape LIKE wildcards so a literal % or _ is not treated as a pattern. */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Allowed physical tables for localized-title ILIKE search.
 * Keep this as a whitelist — table names cannot be parameterized.
 */
const LOCALIZED_TITLE_TABLES = {
  quizzes: 'quizzes',
  courses: 'courses',
  modules: 'modules',
} as const;

export type LocalizedTitleTable = keyof typeof LOCALIZED_TITLE_TABLES;

/**
 * Case-insensitive search across localized JSON `title` slots (en/si/ta).
 * Returns matching row ids, or null when the search term is blank.
 */
export async function findIdsByLocalizedTitle(
  prisma: PrismaService,
  table: LocalizedTitleTable,
  search: string | null | undefined,
): Promise<string[] | null> {
  const term = search?.trim();
  if (!term) return null;

  const like = `%${escapeLikePattern(term)}%`;
  const tableSql = Prisma.raw(`"${LOCALIZED_TITLE_TABLES[table]}"`);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id
    FROM ${tableSql}
    WHERE
      title->>'en' ILIKE ${like}
      OR title->>'si' ILIKE ${like}
      OR title->>'ta' ILIKE ${like}
  `;

  return rows.map((r) => r.id);
}
