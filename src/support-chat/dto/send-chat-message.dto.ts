import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateChatLeadDto } from './chat-lead.dto';

export class ChatHistoryMessageDto {
  @IsString()
  role: string;

  @IsString()
  text: string;
}

export class SendChatMessageDto {
  @ApiProperty({ example: 'How do I unlock a Scholarship quiz?' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @ApiProperty({
    required: false,
    description: 'Client-generated id to group messages into one conversation (kept in-memory only, not persisted).',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateChatLeadDto)
  lead?: CreateChatLeadDto;

  @ApiProperty({ required: false, type: [ChatHistoryMessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryMessageDto)
  history?: ChatHistoryMessageDto[];
}
