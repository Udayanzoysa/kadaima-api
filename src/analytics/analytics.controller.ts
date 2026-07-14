import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Quiz Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('quizzes')
  @ApiOperation({ summary: 'Get class-wide quiz performance analytics' })
  @ApiQuery({ name: 'quizId', required: false })
  getQuizAnalytics(@Query('quizId') quizId?: string) {
    return this.analyticsService.getQuizAnalytics(quizId);
  }

  @Get('difficult-questions')
  @ApiOperation({ summary: 'Get questions with failure rate above 70%' })
  getDifficultQuestions() {
    return this.analyticsService.getDifficultQuestions();
  }
}
