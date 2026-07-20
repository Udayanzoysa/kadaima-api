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
  @ApiQuery({ name: 'guestSessionId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({
    name: 'teacherSlug',
    required: false,
    description: 'When set, only quizzes created by that public teacher',
  })
  @ApiQuery({
    name: 'courseId',
    required: false,
    description: 'Filter quizzes to a single course',
  })
  @ApiQuery({
    name: 'moduleId',
    required: false,
    description: 'Filter quizzes to a single module',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Search by course / module / quiz title (en, si, ta)',
  })
  listPublished(
    @Query('guestSessionId') guestSessionId?: string,
    @Query('userId') userId?: string,
    @Query('teacherSlug') teacherSlug?: string,
    @Query('courseId') courseId?: string,
    @Query('moduleId') moduleId?: string,
    @Query('q') q?: string,
  ) {
    return this.quizService.listPublishedQuizzes(
      guestSessionId,
      userId,
      teacherSlug,
      { courseId, moduleId, q },
    );
  }

  @Get('catalog-index')
  @ApiOperation({
    summary:
      'Lightweight searchable index of published courses & modules (for home sidebar search)',
  })
  getCatalogIndex() {
    return this.quizService.getPublishedCatalogIndex();
  }

  @Get('in-progress')
  @ApiOperation({
    summary: 'List in-progress attempts for a guest session and/or logged-in student',
  })
  @ApiQuery({ name: 'guestSessionId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  listInProgress(
    @Query('guestSessionId') guestSessionId?: string,
    @Query('userId') userId?: string,
  ) {
    if (!guestSessionId && !userId) {
      throw new BadRequestException('guestSessionId or userId is required.');
    }
    return this.quizService.listInProgressAttempts({
      guestSessionId,
      studentId: userId,
    });
  }

  @Get('my-attempts')
  @ApiOperation({
    summary: 'List completed attempts for a guest session and/or logged-in student',
  })
  @ApiQuery({ name: 'guestSessionId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  listMyAttempts(
    @Query('guestSessionId') guestSessionId?: string,
    @Query('userId') userId?: string,
  ) {
    if (!guestSessionId && !userId) {
      throw new BadRequestException('guestSessionId or userId is required.');
    }
    return this.quizService.listCompletedAttempts({
      guestSessionId,
      studentId: userId,
    });
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

  @Get(':id/access')
  @ApiOperation({ summary: 'Check whether a guest/user has unlocked a quiz' })
  @ApiQuery({ name: 'guestSessionId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  getAccess(
    @Param('id') id: string,
    @Query('guestSessionId') guestSessionId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.quizService.getQuizAccess(id, guestSessionId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a published quiz with questions (answers hidden, no auth)' })
  @ApiQuery({ name: 'guestSessionId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  getPublished(
    @Param('id') id: string,
    @Query('guestSessionId') guestSessionId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.quizService.getPublishedQuizForGuest(id, guestSessionId, userId);
  }

  @Post(':id/guest-attempts')
  @ApiOperation({ summary: 'Start a guest quiz attempt after lead capture (no auth)' })
  startGuestAttempt(@Param('id') quizId: string, @Body() dto: StartGuestAttemptDto) {
    return this.quizService.startGuestAttempt(quizId, dto);
  }
}
