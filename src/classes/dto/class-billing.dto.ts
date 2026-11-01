import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClassFeeFrequency,
  ClassOverdueAccessPolicy,
  ClassProrationPolicy,
  SlipSubmissionStatus,
  TuitionAdjustmentType,
  TuitionInvoiceStatus,
  TuitionPaymentChannel,
  TuitionPaymentStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LocalizedTextDto } from '../../quiz/dto/localized-text.dto';

export class CreateClassFeePlanDto {
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name?: LocalizedTextDto | null;

  @ApiProperty({
    description:
      'Monthly or batch tuition fee in integer minor units (e.g., LKR 2,500.00 = 250000 cents)',
    example: 250000,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountMinor!: number;

  @ApiPropertyOptional({ default: 'LKR', example: 'LKR' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({
    enum: ClassFeeFrequency,
    default: ClassFeeFrequency.MONTHLY,
  })
  @IsOptional()
  @IsEnum(ClassFeeFrequency)
  frequency?: ClassFeeFrequency;

  @ApiPropertyOptional({
    description: 'Day of the billing month when invoice is due (1..28)',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dueDay?: number;

  @ApiPropertyOptional({
    description: 'Grace days after due date before invoice is treated as overdue',
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  graceDays?: number;

  @ApiPropertyOptional({
    enum: ClassProrationPolicy,
    default: ClassProrationPolicy.FULL_MONTH,
  })
  @IsOptional()
  @IsEnum(ClassProrationPolicy)
  prorationPolicy?: ClassProrationPolicy;

  @ApiPropertyOptional({
    enum: ClassOverdueAccessPolicy,
    default: ClassOverdueAccessPolicy.ALLOW_WITH_WARNING,
  })
  @IsOptional()
  @IsEnum(ClassOverdueAccessPolicy)
  overdueAccessPolicy?: ClassOverdueAccessPolicy;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  activeFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  activeTo?: string | null;
}

export class GenerateClassInvoicesDto {
  @ApiProperty({
    description: 'Billing period in YYYY-MM format',
    example: '2026-10',
  })
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'periodYyyyMm must be in YYYY-MM format.',
  })
  periodYyyyMm!: string;

  @ApiPropertyOptional({
    description:
      'Optional subset of enrolled student IDs to generate invoices for; defaults to all ACTIVE enrollments in the class',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListClassInvoicesQueryDto {
  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'period must be in YYYY-MM format.',
  })
  period?: string;

  @ApiPropertyOptional({ enum: TuitionInvoiceStatus })
  @IsOptional()
  @IsEnum(TuitionInvoiceStatus)
  status?: TuitionInvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class StudentInvoicesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'period must be in YYYY-MM format.',
  })
  period?: string;
}

export class CreateInvoiceAdjustmentDto {
  @ApiProperty({ enum: TuitionAdjustmentType })
  @IsEnum(TuitionAdjustmentType)
  type!: TuitionAdjustmentType;

  @ApiPropertyOptional({
    description:
      'Adjustment amount in integer minor units (e.g., 50000 = LKR 500.00). Optional for WAIVER (defaults to full remaining balance) or VOID.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountMinor?: number;

  @ApiProperty({
    description: 'Mandatory audit justification for the adjustment/waiver/void',
    maxLength: 500,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RecordInvoicePaymentDto {
  @ApiProperty({
    description: 'Payment amount in integer minor units (e.g., 100000 = LKR 1,000.00)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor!: number;

  @ApiPropertyOptional({
    enum: TuitionPaymentChannel,
    default: TuitionPaymentChannel.CASH,
  })
  @IsOptional()
  @IsEnum(TuitionPaymentChannel)
  channel?: TuitionPaymentChannel;

  @ApiPropertyOptional({
    description:
      'Payment status. Only SUCCEEDED (confirmed funds verified by teacher/admin) reduces invoice balance; PENDING never marks an invoice paid.',
    enum: TuitionPaymentStatus,
    default: TuitionPaymentStatus.SUCCEEDED,
  })
  @IsOptional()
  @IsEnum(TuitionPaymentStatus)
  status?: TuitionPaymentStatus;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalReference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ============================================================================
// PHASE 6 — Online Gateway Checkout, Manual Bank/Cash Submissions & Refunds
// ============================================================================

export class CreateInvoiceCheckoutDto {
  @ApiPropertyOptional({
    description:
      'Optional partial checkout amount in integer minor units; defaults to full remaining balanceMinor',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  amountMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}

export class CreateManualPaymentSubmissionDto {
  @ApiPropertyOptional({
    enum: TuitionPaymentChannel,
    default: TuitionPaymentChannel.BANK_TRANSFER,
  })
  @IsOptional()
  @IsEnum(TuitionPaymentChannel)
  channel?: TuitionPaymentChannel;

  @ApiProperty({
    description: 'Submitted payment amount in integer minor units (e.g. 250000 = LKR 2,500.00)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  amountMinor!: number;

  @ApiProperty({
    description: 'Unique bank deposit / transfer / cash receipt reference number',
    maxLength: 128,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  referenceNumber!: string;

  @ApiProperty({
    description: 'Payment date in YYYY-MM-DD format',
    example: '2026-10-31',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'paidDate must be formatted as YYYY-MM-DD.',
  })
  paidDate!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListManualSubmissionsQueryDto {
  @ApiPropertyOptional({ enum: SlipSubmissionStatus })
  @IsOptional()
  @IsEnum(SlipSubmissionStatus)
  status?: SlipSubmissionStatus;
}

export class ApproveManualPaymentSubmissionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectManualPaymentSubmissionDto {
  @ApiProperty({
    description: 'Mandatory reason for rejecting the manual payment submission',
    maxLength: 500,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RefundTuitionPaymentDto {
  @ApiPropertyOptional({
    description:
      'Optional partial refund amount in integer minor units; defaults to full remaining refundable amount',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountMinor?: number;

  @ApiProperty({
    description: 'Mandatory audit justification for refund or chargeback',
    maxLength: 500,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'When true, records a gateway CHARGEBACK instead of a voluntary REFUND',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isChargeback?: boolean;
}


