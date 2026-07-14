import { Body, Controller, Get, Param, Post, Put, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { QuizService } from './quiz.service';
import { StartGuestAttemptDto } from './dto/start-guest-attempt.dto';
import { SaveGuestProgressDto } from './dto/save-guest-progress.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { GradingService } from '../grading/grading.service';
import { SubmitAttemptDto } from '../grading/dto/submit-attempt.dto';

@ApiTags('Public Quizzes')
@Controller('public/quizzes')
export class PublicQuizController {
  constructor(
    private quizService: QuizService,
    private gradingService: GradingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List published quizzes (no auth)' })
  listPublished() {
    return this.quizService.listPublishedQuizzes();
  }

  @Get('in-progress')
  @ApiOperation({ summary: 'List in-progress guest attempts for a guest session' })
  @ApiQuery({ name: 'guestSessionId', required: true })
  listInProgress(@Query('guestSessionId') guestSessionId: string) {
    return this.quizService.listGuestInProgress(guestSessionId);
  }

  @Get('my-attempts')
  @ApiOperation({ summary: 'List completed guest attempts for My Attempts review' })
  @ApiQuery({ name: 'guestSessionId', required: true })
  listMyAttempts(@Query('guestSessionId') guestSessionId: string) {
    return this.quizService.listGuestCompleted(guestSessionId);
  }

  @Get('results/:resultToken')
  @ApiOperation({ summary: 'Get a finalized quiz result by public token (no auth)' })
  getResult(@Param('resultToken') resultToken: string) {
    return this.quizService.getAttemptByResultToken(resultToken);
  }

  @Get('attempts/:attemptId')
  @ApiOperation({ summary: 'Get a guest attempt with saved answers (no auth)' })
  @ApiQuery({ name: 'guestSessionId', required: true })
  getGuestAttempt(
    @Param('attemptId') attemptId: string,
    @Query('guestSessionId') guestSessionId: string,
  ) {
    return this.quizService.getGuestAttempt(attemptId, guestSessionId);
  }

  @Put('attempts/:attemptId/progress')
  @ApiOperation({ summary: 'Save draft answers for an in-progress guest attempt' })
  saveProgress(
    @Param('attemptId') attemptId: string,
    @Body() dto: SaveGuestProgressDto,
  ) {
    return this.quizService.saveGuestProgress(
      attemptId,
      dto.guestSessionId,
      dto.responses,
    );
  }

  @Post('attempts/:attemptId/heartbeat')
  @ApiOperation({
    summary:
      'Guest resilient timer heartbeat (requires guestSessionId in body)',
  })
  handleGuestHeartbeat(
    @Param('attemptId') attemptId: string,
    @Body() body: HeartbeatDto,
  ) {
    if (!body.guestSessionId) {
      throw new BadRequestException('guestSessionId is required.');
    }
    return this.quizService.processHeartbeat(attemptId, body, {
      guestSessionId: body.guestSessionId,
    });
  }

  @Post('attempts/:attemptId/submit')
  @ApiOperation({ summary: 'Submit and grade a guest quiz attempt (no auth)' })
  submitGuestAttempt(
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.gradingService.submitAttempt(attemptId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a published quiz with questions (answers hidden, no auth)' })
  getPublished(@Param('id') id: string) {
    return this.quizService.getPublishedQuizForGuest(id);
  }

  @Post(':id/guest-attempts')
  @ApiOperation({ summary: 'Start a guest quiz attempt after lead capture (no auth)' })
  startGuestAttempt(@Param('id') quizId: string, @Body() dto: StartGuestAttemptDto) {
    return this.quizService.startGuestAttempt(quizId, dto);
  }
}
