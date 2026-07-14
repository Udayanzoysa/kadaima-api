import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { CreateAccessReviewDto } from './dto/create-access-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Access Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('access-reviews')
export class AccessReviewsController {
  constructor(private accessControlService: AccessControlService) {}

  @Get()
  @ApiOperation({
    summary: 'Retrieves logs of completed access reviews in the workspace',
  })
  @ApiResponse({ status: 200, description: 'Log of reviews returned.' })
  async getAccessReviews(@Req() req: any) {
    return this.accessControlService.getAccessReviews(req.user.workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Logs a completed access review assessment' })
  @ApiResponse({
    status: 201,
    description: 'Review logged and role status synchronized successfully.',
  })
  async createAccessReview(
    @Req() req: any,
    @Body() dto: CreateAccessReviewDto,
  ) {
    return this.accessControlService.createAccessReview(
      req.user.workspaceId,
      req.user.id,
      dto,
    );
  }
}
