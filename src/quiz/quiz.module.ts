import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { PublicQuizController } from './public-quiz.controller';
import { QuizService } from './quiz.service';
import { QuestionController } from '../question/question.controller';
import { QuestionService } from '../question/question.service';
import { GradingModule } from '../grading/grading.module';

@Module({
  imports: [GradingModule],
  controllers: [QuizController, PublicQuizController, QuestionController],
  providers: [QuizService, QuestionService],
  exports: [QuizService, QuestionService],
})
export class QuizModule {}
