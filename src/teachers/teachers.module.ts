import { Module } from '@nestjs/common';
import { QuizModule } from '../quiz/quiz.module';
import { PublicTeachersController } from './public-teachers.controller';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [QuizModule],
  controllers: [TeachersController, PublicTeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
