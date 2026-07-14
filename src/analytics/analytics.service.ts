import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getQuizAnalytics(quizId?: string) {
    if (quizId) {
      const rows = await this.prisma.$queryRaw<
        Array<{
          quiz_id: string;
          quiz_title_en: string;
          total_attempts: bigint;
          average_class_score: number | null;
          highest_score: number | null;
          lowest_score: number | null;
          passing_rate_percentage: number | null;
        }>
      >`
        SELECT * FROM view_quiz_analytics WHERE quiz_id = ${quizId}::uuid
      `;
      return rows[0] ?? null;
    }

    return this.prisma.$queryRaw`
      SELECT * FROM view_quiz_analytics ORDER BY total_attempts DESC
    `;
  }

  async getDifficultQuestions() {
    return this.prisma.$queryRaw<
      Array<{
        question_id: string;
        failure_rate_percentage: number;
        average_seconds_spent: number;
      }>
    >`
      SELECT
        question_id,
        COUNT(CASE WHEN is_correct = false THEN 1 END) * 100.0 / COUNT(id) AS failure_rate_percentage,
        ROUND(AVG(time_spent_seconds), 1) AS average_seconds_spent
      FROM student_responses
      GROUP BY question_id
      HAVING COUNT(id) > 5
        AND (COUNT(CASE WHEN is_correct = false THEN 1 END) * 100.0 / COUNT(id)) > 70.0
    `;
  }
}
