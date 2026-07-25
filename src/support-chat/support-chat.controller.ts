import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { CreateChatLeadDto } from './dto/chat-lead.dto';
import { SupportChatService } from './support-chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, Subject } from '@prisma/client';

/** Public, unauthenticated endpoint for the "Ask Kadaima Expert" website chat widget. */
@ApiTags('Public Support Chat')
@Controller('support/chat')
export class SupportChatController {
  constructor(private readonly supportChatService: SupportChatService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a message to the Kadaima Expert chat widget and get an AI reply' })
  async sendMessage(@Body() dto: SendChatMessageDto) {
    const reply = await this.supportChatService.getReply(
      dto.message,
      dto.history,
      dto.lead,
    );
    return { reply };
  }

  @Post('leads')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit user details to start chat session and create a lead' })
  async createLead(@Body() dto: CreateChatLeadDto) {
    return this.supportChatService.saveLead(dto);
  }

  @Get('leads')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, subject: Subject.LEADS })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrieve chatbot leads list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getLeads(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.supportChatService.listLeads(
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }
}
