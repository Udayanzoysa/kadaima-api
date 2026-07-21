import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { PublicQuizController } from './public-quiz.controller';
import { QuizService } from './quiz.service';
import { AiQuizReviewService } from './ai-quiz-review.service';
import { QuestionController } from '../question/question.controller';
import { QuestionService } from '../question/question.service';
import { AiQuestionImportService } from '../question/ai-question-import.service';
import { GradingModule } from '../grading/grading.module';
import { SettingsModule } from '../settings/settings.module';
import { AbilityFactory } from '../auth/casl/ability.factory';
import { PoliciesGuard } from '../auth/guards/policies.guard';

@Module({
  imports: [GradingModule, SettingsModule],
  controllers: [QuizController, PublicQuizController, QuestionController],
  providers: [
    QuizService,
    QuestionService,
    AiQuestionImportService,
    AiQuizReviewService,
    AbilityFactory,
    PoliciesGuard,
  ],
  exports: [QuizService, QuestionService],
})
export class QuizModule {}
