import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GradingService } from './grading.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Quiz Grading')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('grading')
export class GradingController {
  constructor(private gradingService: GradingService) {}

  @Post('attempts/:attemptId/submit')
  @ApiOperation({
    summary: 'Submit and auto-grade a quiz attempt with anti-cheat validation',
  })
  submitAttempt(
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.gradingService.submitAttempt(attemptId, dto);
  }
}
