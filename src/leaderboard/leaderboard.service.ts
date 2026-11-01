import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttemptStatus } from '@prisma/client';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(moduleId?: string, timeframe?: 'weekly' | 'all_time') {
    const whereCondition: any = {
      status: AttemptStatus.Submitted,
      isPassed: true,
      submittedAt: { not: null },
    };

    if (moduleId) {
      whereCondition.moduleId = moduleId;
    }

    if (timeframe === 'weekly') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      whereCondition.submittedAt = { ...whereCondition.submittedAt, gte: sevenDaysAgo };
    }

    const attempts = await this.prisma.quizAttempt.findMany({
      where: whereCondition,
      include: {
        student: { select: { name: true, firstName: true, lastName: true, email: true } },
        guestLead: { select: { studentName: true } },
        quiz: { select: { title: true, _count: { select: { quizQuestions: true } } } },
        module: { select: { title: true } },
      },
      orderBy: { finalScore: 'desc' },
      take: 200,
    });

    const enriched = attempts.map(attempt => {
      const timeTakenSeconds = (attempt.submittedAt!.getTime() - attempt.startedAt.getTime()) / 1000;
      let userName = 'Unknown';
      if (attempt.student) {
        userName = attempt.student.name || `${attempt.student.firstName || ''} ${attempt.student.lastName || ''}`.trim() || attempt.student.email || 'Student';
      } else if (attempt.guestLead) {
        userName = attempt.guestLead.studentName;
      }
      
      const moduleNameRaw = attempt.module?.title || attempt.quiz?.title;
      let moduleName = 'Unknown Module';
      if (moduleNameRaw) {
          if (typeof moduleNameRaw === 'string') {
              moduleName = moduleNameRaw;
          } else if (typeof moduleNameRaw === 'object') {
              // Extract 'en' if localized
              moduleName = (moduleNameRaw as any).en || (moduleNameRaw as any).si || (moduleNameRaw as any).ta || 'Unknown Module';
          }
      }

      return {
        attemptId: attempt.id,
        userId: attempt.studentId || attempt.guestLeadId,
        userName,
        moduleId: attempt.moduleId,
        moduleName,
        score: attempt.finalScore,
        maxScore: attempt.quiz?._count?.quizQuestions || 0,
        timeTakenSeconds,
        status: attempt.isPassed ? 'PASSED' : 'FAILED',
        completedAt: attempt.submittedAt,
      };
    });

    // Sort by: 1. score desc, 2. time taken asc, 3. completedAt asc
    enriched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.timeTakenSeconds !== b.timeTakenSeconds) return a.timeTakenSeconds - b.timeTakenSeconds;
      return a.completedAt!.getTime() - b.completedAt!.getTime();
    });

    return enriched.slice(0, 100).map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
  }
}
