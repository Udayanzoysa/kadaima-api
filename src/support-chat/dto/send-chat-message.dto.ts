import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}
