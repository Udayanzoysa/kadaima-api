import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, Role } from '@prisma/client';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audit } from '../audit/audit-log.decorator';
import { BackupService } from './backup.service';
import { CreateBackupDto, RestoreBackupDto } from './dto/backup.dto';

const restoreUploadDir = join(process.cwd(), 'uploads', 'backups', 'incoming');

@ApiTags('Database Backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('status')
  @ApiOperation({ summary: 'Backup system health (tools, retention, DB hint)' })
  getStatus() {
    return this.backupService.getStatus();
  }

  @Get()
  @ApiOperation({ summary: 'List master database backups' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.backupService.list(
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Post()
  @Audit('BACKUP', AuditAction.CREATE)
  @ApiOperation({ summary: 'Create a master pg_dump backup (async)' })
  create(@Body() dto: CreateBackupDto, @Req() req: any) {
    return this.backupService.createBackup(req.user?.id ?? null, dto.label);
  }

  @Post('restore/upload')
  @Audit('BACKUP', AuditAction.UPDATE)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'confirmationPhrase'],
      properties: {
        file: { type: 'string', format: 'binary' },
        confirmationPhrase: { type: 'string', example: 'RESTORE' },
      },
    },
  })
  @ApiOperation({
    summary: 'Restore DB from an uploaded .dump (server migration)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(restoreUploadDir)) {
            mkdirSync(restoreUploadDir, { recursive: true });
          }
          cb(null, restoreUploadDir);
        },
        filename: (_req, file, cb) => {
          const safe = `${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_')}`;
          cb(null, safe);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        if (['.dump', '.backup', '.pgdump'].includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('Only .dump / .backup files are allowed') as any, false);
        }
      },
    }),
  )
  restoreUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: RestoreBackupDto,
    @Req() req: any,
  ) {
    return this.backupService.restoreFromUpload(
      file,
      dto.confirmationPhrase,
      req.user?.id,
    );
  }

  @Get(':id/download')
  @Audit('BACKUP', AuditAction.CREATE)
  @ApiOperation({ summary: 'Download a ready .dump file (streamed)' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { stream, fileName, sizeBytes } =
      await this.backupService.openDownloadStream(id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName.replace(/"/g, '')}"`,
    );
    if (sizeBytes != null) {
      res.setHeader('Content-Length', String(sizeBytes));
    }
    stream.pipe(res);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one backup (poll while RUNNING)' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.backupService.getOne(id);
  }

  @Post(':id/restore')
  @Audit('BACKUP', AuditAction.UPDATE)
  @ApiOperation({
    summary: 'Restore DB from a catalogued backup (type RESTORE to confirm)',
  })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestoreBackupDto,
    @Req() req: any,
  ) {
    return this.backupService.restoreFromBackup(
      id,
      dto.confirmationPhrase,
      req.user?.id,
    );
  }

  @Delete(':id')
  @Audit('BACKUP', AuditAction.DELETE)
  @ApiOperation({ summary: 'Delete a backup file + catalog row' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.backupService.deleteBackup(id);
  }
}
