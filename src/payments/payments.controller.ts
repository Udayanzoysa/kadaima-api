import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SlipSubmissionStatus } from '@prisma/client';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PayHereCheckoutDto } from './dto/payhere-checkout.dto';
import {
  CreateVoucherDto,
  RedeemVoucherDto,
  ReviewSlipDto,
  UpdateVoucherDto,
} from './dto/unlock-methods.dto';
import { PaymentsService } from './payments.service';

class SandboxCompleteDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  orderId: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  guestSessionId: string;
}

class PublicSlipFieldsDto {
  @ApiProperty()
  @IsUUID()
  quizId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  guestSessionId?: string;

  @ApiProperty({ required: false, description: 'Bank transfer / deposit reference number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankReference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

const slipUploadDir = join(process.cwd(), 'uploads', 'slips');
if (!existsSync(slipUploadDir)) {
  mkdirSync(slipUploadDir, { recursive: true });
}

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  // ---- Public unlock methods ----

  @Post('public/payments/payhere/checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create PayHere checkout payload for a locked quiz (login required)' })
  checkout(@Body() dto: PayHereCheckoutDto, @Req() req: any) {
    return this.paymentsService.createPayHereCheckout({
      ...dto,
      userId: req.user.id,
    });
  }

  @Post('public/payments/payhere/sandbox-complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark PayHere sandbox payment complete (localhost helper)' })
  sandboxComplete(@Body() dto: SandboxCompleteDto) {
    return this.paymentsService.completeSandboxPayment(
      dto.orderId,
      dto.guestSessionId,
    );
  }

  @Post('public/payments/voucher/redeem')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Redeem a voucher code to unlock a quiz (login required)' })
  redeemVoucher(@Body() dto: RedeemVoucherDto, @Req() req: any) {
    return this.paymentsService.redeemVoucher({
      ...dto,
      userId: req.user.id,
    });
  }

  @Post('public/payments/slips')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload a bank slip for admin review (login required)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'quizId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        quizId: { type: 'string' },
        guestSessionId: { type: 'string' },
        bankReference: { type: 'string' },
        note: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: slipUploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
          return cb(new Error('Only image or PDF uploads are allowed') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  submitSlip(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: PublicSlipFieldsDto,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Slip file is required.');
    return this.paymentsService.submitSlip({
      quizId: body.quizId,
      guestSessionId: body.guestSessionId || null,
      userId: req.user.id,
      slipImageUrl: `/uploads/slips/${file.filename}`,
      bankReference: body.bankReference,
      note: body.note,
    });
  }

  @Post('payments/payhere/notify')
  @ApiExcludeEndpoint()
  @HttpCode(200)
  notify(@Body() body: Record<string, string>) {
    return this.paymentsService.handlePayHereNotify(body);
  }

  // ---- Admin ----

  @Get('payments/admin/ledger')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unified payment / unlock ledger for admin' })
  adminLedger() {
    return this.paymentsService.listAdminLedger();
  }

  @Get('payments/admin/vouchers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List unlock vouchers' })
  listVouchers() {
    return this.paymentsService.listVouchers();
  }

  @Post('payments/admin/vouchers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create an unlock voucher' })
  createVoucher(@Body() dto: CreateVoucherDto) {
    return this.paymentsService.createVoucher(dto);
  }

  @Patch('payments/admin/vouchers/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update voucher (active / limits / expiry)' })
  updateVoucher(@Param('id') id: string, @Body() dto: UpdateVoucherDto) {
    return this.paymentsService.updateVoucher(id, dto);
  }

  @Get('payments/admin/slips')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List bank slip submissions' })
  @ApiQuery({ name: 'status', required: false, enum: SlipSubmissionStatus })
  listSlips(@Query('status') status?: SlipSubmissionStatus) {
    return this.paymentsService.listSlips(status);
  }

  @Post('payments/admin/slips/:id/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Approve a bank slip and unlock the quiz' })
  approveSlip(@Param('id') id: string) {
    return this.paymentsService.approveSlip(id);
  }

  @Post('payments/admin/slips/:id/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Reject a bank slip submission' })
  rejectSlip(@Param('id') id: string, @Body() dto: ReviewSlipDto) {
    return this.paymentsService.rejectSlip(id, dto.note);
  }
}
