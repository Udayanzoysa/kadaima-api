import { IsIn, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBillingSettingsDto {
  @ApiProperty({ example: 500, description: 'Monthly student subscription fee in LKR' })
  @IsNumber()
  @Min(0)
  monthlyStudentFeeLkr: number;

  @ApiProperty({
    enum: ['MIXED', 'MONTHLY_ONLY', 'QUIZ_ONLY'],
    example: 'MIXED',
    description:
      'MIXED = monthly unlocks unpriced locked quizzes; priced quizzes need separate pay. MONTHLY_ONLY = sub unlocks all locks. QUIZ_ONLY = per-quiz pay only.',
  })
  @IsIn(['MIXED', 'MONTHLY_ONLY', 'QUIZ_ONLY'])
  paymentMode: 'MIXED' | 'MONTHLY_ONLY' | 'QUIZ_ONLY';
}
