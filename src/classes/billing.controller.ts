import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import type { Response } from 'express';
import { Audit } from '../audit/audit-log.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import {
  ApproveManualPaymentSubmissionDto,
  CreateClassFeePlanDto,
  CreateInvoiceAdjustmentDto,
  CreateInvoiceCheckoutDto,
  CreateManualPaymentSubmissionDto,
  GenerateClassInvoicesDto,
  ListClassInvoicesQueryDto,
  ListManualSubmissionsQueryDto,
  RecordInvoicePaymentDto,
  RefundTuitionPaymentDto,
  RejectManualPaymentSubmissionDto,
  StudentInvoicesQueryDto,
} from './dto/class-billing.dto';

@ApiTags('Class Tuition Billing, Fee Plans, Checkout & Receipts')
@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('classes/:classId/fee-plans')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary:
      'Create a new versioned tuition fee plan for a class batch (without rewriting existing invoices)',
  })
  createFeePlan(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateClassFeePlanDto,
    @Req() req: any,
  ) {
    return this.billingService.createFeePlan(classId, dto, req.user);
  }

  @Get('classes/:classId/fee-plans')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get active tuition fee plan and version history for a class batch',
  })
  listFeePlans(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
  ) {
    return this.billingService.listFeePlans(classId, req.user);
  }

  @Post('classes/:classId/invoices/generate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Audit('CLASSES', AuditAction.CREATE)
  @ApiOperation({
    summary:
      'Idempotently generate monthly per-student tuition invoices with price snapshots',
  })
  generateClassInvoices(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: GenerateClassInvoicesDto,
    @Req() req: any,
  ) {
    return this.billingService.generateClassInvoices(classId, dto, req.user);
  }

  @Get('classes/:classId/invoices')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get teacher/admin class billing ledger for a period with status counts and financial totals',
  })
  listClassInvoices(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: ListClassInvoicesQueryDto,
    @Req() req: any,
  ) {
    return this.billingService.listClassInvoices(classId, query, req.user);
  }

  @Get('classes/:classId/invoices/export')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Export class tuition billing ledger as CSV',
  })
  async exportClassInvoicesCsv(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: ListClassInvoicesQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { fileName, csv } = await this.billingService.exportClassInvoicesCsv(
      classId,
      query,
      req.user,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    res.send(csv);
  }

  @Get('students/me/invoices')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get signed-in student tuition invoices and balances',
  })
  getStudentInvoices(
    @Query() query: StudentInvoicesQueryDto,
    @Req() req: any,
  ) {
    return this.billingService.getStudentInvoices(req.user, query);
  }

  @Get('invoices/:invoiceId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get single tuition invoice detail with adjustments, payment allocations, and audit events',
  })
  getInvoiceById(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: any,
  ) {
    return this.billingService.getInvoiceById(invoiceId, req.user);
  }

  @Post('invoices/:invoiceId/adjustments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({
    summary:
      'Apply a discount, scholarship waiver, surcharge, or void to a tuition invoice with mandatory justification',
  })
  createInvoiceAdjustment(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CreateInvoiceAdjustmentDto,
    @Req() req: any,
  ) {
    return this.billingService.createInvoiceAdjustment(
      invoiceId,
      dto,
      req.user,
    );
  }

  @Post('invoices/:invoiceId/payments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({
    summary:
      'Record a partial or full tuition payment allocation (only teacher/admin confirmed SUCCEEDED payments reduce balance)',
  })
  recordInvoicePayment(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: RecordInvoicePaymentDto,
    @Req() req: any,
  ) {
    return this.billingService.recordInvoicePayment(invoiceId, dto, req.user);
  }

  // ============================================================================
  // PHASE 6 — Online Gateway Checkout, Signed Webhooks, Manual Cash/Bank & Receipts
  // ============================================================================

  @Post('invoices/:invoiceId/checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Initiate a server-calculated PayHere checkout session for a student tuition invoice (never marks paid on creation)',
  })
  createInvoiceCheckout(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CreateInvoiceCheckoutDto,
    @Req() req: any,
  ) {
    return this.billingService.createInvoiceCheckout(invoiceId, dto, req.user);
  }

  @Get('payments/:paymentId/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get tuition payment status, test-mode flag, and receipt metadata (read-only; polling never confirms funds)',
  })
  getPaymentStatus(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Req() req: any,
  ) {
    return this.billingService.getPaymentStatus(paymentId, req.user);
  }

  @Post('payments/webhooks/:gateway')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Server-to-server gateway webhook endpoint (MD5 signature-verified and idempotent)',
  })
  handleGatewayWebhook(
    @Param('gateway') gateway: string,
    @Body() body: Record<string, string>,
  ) {
    return this.billingService.handleGatewayWebhook(gateway, body);
  }

  @Post('invoices/:invoiceId/manual-payment-submissions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Submit a manual bank transfer slip or cash payment reference for teacher verification (remains Pending until approved)',
  })
  submitManualPayment(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CreateManualPaymentSubmissionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    return this.billingService.submitManualPayment(
      invoiceId,
      dto,
      file,
      req.user,
    );
  }

  @Get('classes/:classId/manual-payment-submissions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'List manual cash/bank payment submissions for a class batch (teacher/admin read access required)',
  })
  listManualPaymentSubmissions(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: ListManualSubmissionsQueryDto,
    @Req() req: any,
  ) {
    return this.billingService.listManualPaymentSubmissions(
      classId,
      query,
      req.user,
    );
  }

  @Post('manual-payments/:submissionId/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({
    summary:
      'Approve a pending manual cash/bank payment submission, confirm allocation, and issue an official receipt',
  })
  approveManualPaymentSubmission(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: ApproveManualPaymentSubmissionDto,
    @Req() req: any,
  ) {
    return this.billingService.approveManualPaymentSubmission(
      submissionId,
      dto,
      req.user,
    );
  }

  @Post('manual-payments/:submissionId/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({
    summary:
      'Reject a pending manual cash/bank payment submission with a mandatory review reason',
  })
  rejectManualPaymentSubmission(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: RejectManualPaymentSubmissionDto,
    @Req() req: any,
  ) {
    return this.billingService.rejectManualPaymentSubmission(
      submissionId,
      dto,
      req.user,
    );
  }

  @Post('payments/:paymentId/refund')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Audit('CLASSES', AuditAction.UPDATE)
  @ApiOperation({
    summary:
      'Record a partial/full refund or chargeback against a confirmed tuition payment and recompute invoice balance',
  })
  refundTuitionPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: RefundTuitionPaymentDto,
    @Req() req: any,
  ) {
    return this.billingService.refundTuitionPayment(paymentId, dto, req.user);
  }

  @Get('payments/:paymentId/receipt')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get official tuition receipt JSON and printable HTML for a confirmed payment',
  })
  getPaymentReceipt(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Req() req: any,
  ) {
    return this.billingService.getPaymentReceipt(paymentId, req.user);
  }

  @Get('classes/:classId/payment-summary')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get class payment channel summary, pending manual verifications count, and refunded total',
  })
  getClassPaymentSummary(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('period') period: string | undefined,
    @Req() req: any,
  ) {
    return this.billingService.getClassPaymentSummary(
      classId,
      period,
      req.user,
    );
  }
}

