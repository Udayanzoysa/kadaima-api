import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateTeacherInquiryDto } from './dto/teacher-inquiry.dto';
import { TeachersService } from './teachers.service';

@ApiTags('Public Teacher Pages')
@Controller('public/teachers')
export class PublicTeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published teacher landing page by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.teachersService.getPublicBySlug(slug);
  }

  @Get(':slug/quizzes')
  @ApiOperation({ summary: 'List published quizzes for a teacher slug only' })
  @ApiQuery({ name: 'guestSessionId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  listQuizzes(
    @Param('slug') slug: string,
    @Query('guestSessionId') guestSessionId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.teachersService.listPublicQuizzes(slug, guestSessionId, userId);
  }

  @Post(':slug/inquiries')
  @ApiOperation({
    summary: 'Submit a student inquiry / ask on a published teacher page',
  })
  createInquiry(
    @Param('slug') slug: string,
    @Body() dto: CreateTeacherInquiryDto,
  ) {
    return this.teachersService.createPublicInquiry(slug, dto);
  }
}
