import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { AttemptStatus, QuestionType } from '@prisma/client';
import { gradeResponse } from '../question/question-config';

@Injectable()
export class GradingService {
  constructor(private prisma: PrismaService) {}

  async submitAttempt(attemptId: string, dto: SubmitAttemptDto) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.findUnique({
        where: { id: attemptId },
        include: { quiz: true },
      });

      if (!attempt) {
        throw new NotFoundException('Quiz attempt not found');
      }

      if (attempt.status !== AttemptStatus.In_Progress) {
        throw new BadRequestException('This quiz attempt has already been finalized.');
      }

      const currentTime = new Date();
      let status: AttemptStatus = AttemptStatus.Submitted;

      if (
        attempt.secondsRemaining <= 0 ||
        currentTime > attempt.expiresAt
      ) {
        status = AttemptStatus.Timed_Out;
      }

      const links = await tx.quizQuestion.findMany({
        where: { quizId: attempt.quizId },
        include: {
          question: { include: { choices: true } },
        },
      });
      const questions = links.map((l) => l.question);

      const answerByQuestion = new Map(
        dto.responses.map((r) => [r.questionId, r] as const),
      );

      let totalPointsEarned = 0;
      let totalMaxPoints = 0;
      let pendingManualReview = 0;

      for (const question of questions) {
        const isEssay = question.type === QuestionType.ESSAY;
        if (!isEssay) {
          totalMaxPoints += question.points;
        }

        const res = answerByQuestion.get(question.id);
        const choiceId = res?.choiceId ?? null;
        const textResponse = res?.textResponse ?? null;
        const timeSpent = res?.timeSpent ?? 0;

        const grade = gradeResponse({
          type: question.type,
          config: question.config,
          choices: question.choices,
          choiceId,
          textResponse,
        });

        if (grade.needsManualReview) pendingManualReview += 1;

        if (
          grade.isCorrect &&
          !grade.needsManualReview &&
          status === AttemptStatus.Submitted
        ) {
          totalPointsEarned += question.points;
        }

        const existing = await tx.studentResponse.findUnique({
          where: {
            attemptId_questionId: {
              attemptId,
              questionId: question.id,
            },
          },
        });

        if (res || existing) {
          await tx.studentResponse.upsert({
            where: {
              attemptId_questionId: {
                attemptId,
                questionId: question.id,
              },
            },
            create: {
              attemptId,
              questionId: question.id,
              selectedChoiceId: choiceId ?? existing?.selectedChoiceId ?? null,
              textResponse: textResponse ?? existing?.textResponse ?? null,
              timeSpentSeconds: timeSpent || existing?.timeSpentSeconds || 0,
              isCorrect: grade.isCorrect,
              needsManualReview: grade.needsManualReview,
            },
            update: {
              selectedChoiceId: choiceId ?? existing?.selectedChoiceId ?? null,
              textResponse: textResponse ?? existing?.textResponse ?? null,
              timeSpentSeconds: timeSpent || existing?.timeSpentSeconds || 0,
              isCorrect: grade.isCorrect,
              needsManualReview: grade.needsManualReview,
            },
          });
        }
      }

      // Re-score from DB so draft-only answers still count.
      const finalResponses = await tx.studentResponse.findMany({
        where: { attemptId },
        include: {
          question: { include: { choices: true } },
        },
      });

      totalPointsEarned = 0;
      pendingManualReview = 0;
      totalMaxPoints = questions
        .filter((q) => q.type !== QuestionType.ESSAY)
        .reduce((sum, q) => sum + q.points, 0);

      for (const row of finalResponses) {
        const grade = gradeResponse({
          type: row.question.type,
          config: row.question.config,
          choices: row.question.choices,
          choiceId: row.selectedChoiceId,
          textResponse: row.textResponse,
        });

        if (row.question.type === QuestionType.ESSAY) {
          pendingManualReview += 1;
        }

        if (
          grade.isCorrect &&
          !grade.needsManualReview &&
          status === AttemptStatus.Submitted
        ) {
          totalPointsEarned += row.question.points;
        }

        if (
          row.isCorrect !== grade.isCorrect ||
          row.needsManualReview !== grade.needsManualReview
        ) {
          await tx.studentResponse.update({
            where: { id: row.id },
            data: {
              isCorrect: grade.isCorrect,
              needsManualReview: grade.needsManualReview,
            },
          });
        }
      }

      const finalScorePercentage =
        totalMaxPoints > 0
          ? Math.round((totalPointsEarned / totalMaxPoints) * 100)
          : 0;
      const isPassed =
        finalScorePercentage >= attempt.quiz.passingScorePercentage;

      const resultToken = attempt.resultToken ?? randomUUID();

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          submittedAt: currentTime,
          lastActivityAt: currentTime,
          status,
          finalScore: finalScorePercentage,
          isPassed,
          resultToken,
        },
      });

      return {
        score: finalScorePercentage,
        passed: isPassed,
        status,
        resultToken,
        pendingManualReview,
      };
    });
  }
}
