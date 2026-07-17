import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { SupportChatService } from './support-chat.service';

/** Public, unauthenticated endpoint for the "Ask Kadaima Expert" website chat widget. */
@ApiTags('Public Support Chat')
@Controller('support/chat')
export class SupportChatController {
  constructor(private readonly supportChatService: SupportChatService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a message to the Kadaima Expert chat widget and get an AI reply' })
  async sendMessage(@Body() dto: SendChatMessageDto) {
    const reply = await this.supportChatService.getReply(dto.message);
    return { reply };
  }
}
