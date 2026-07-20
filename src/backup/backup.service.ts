import { createHash } from 'crypto';
import { createReadStream, existsSync, mkdirSync, promises as fs } from 'fs';
import { basename, join } from 'path';
import { spawn, spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DatabaseBackupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DbConnectionInfo = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly retentionCount: number;
  private readonly cronEnabled: boolean;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.backupDir = join(process.cwd(), 'uploads', 'backups');
    this.retentionCount = Number(this.config.get('BACKUP_RETENTION_COUNT') ?? 14);
    this.cronEnabled =
      String(this.config.get('BACKUP_CRON_ENABLED') ?? 'false').toLowerCase() ===
      'true';
  }

  onModuleInit() {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /** Daily 02:30 server time — only when BACKUP_CRON_ENABLED=true */
  @Cron('30 2 * * *')
  async handleScheduledBackup() {
    if (!this.cronEnabled) return;
    if (this.busy) {
      this.logger.warn('Skipping scheduled backup — another job is running');
      return;
    }
    try {
      await this.createBackup(null, 'Scheduled daily backup');
    } catch (err) {
      this.logger.error('Scheduled backup failed', err as Error);
    }
  }

  getStatus() {
    const tools = this.detectTools();
    return {
      backupDir: this.backupDir,
      retentionCount: this.retentionCount,
      cronEnabled: this.cronEnabled,
      busy: this.busy,
      tools,
      database: this.safeDbHint(),
      note:
        'Master backups use PostgreSQL pg_dump (custom compressed format). ' +
        'Media files under /uploads are NOT included — back up the uploads volume separately when moving servers.',
    };
  }

  async list(page = 1, pageSize = 20) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [rows, total] = await Promise.all([
      this.prisma.databaseBackup.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          createdBy: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.databaseBackup.count(),
    ]);

    return {
      rows: rows.map((r) => this.serialize(r)),
      total,
      page: Math.max(page, 1),
      pageSize: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  async getOne(id: string) {
    const row = await this.prisma.databaseBackup.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('Backup not found');
    return this.serialize(row);
  }

  async createBackup(userId: string | null, label?: string) {
    this.claimBusy();
    const tools = this.detectTools();
    if (!tools.pgDump) {
      this.busy = false;
      throw new ServiceUnavailableException(
        'pg_dump is not installed in the API container. Rebuild the image with postgresql-client.',
      );
    }

    let row;
    try {
      row = await this.prisma.databaseBackup.create({
        data: {
          label: label?.trim() || `Manual backup ${new Date().toISOString()}`,
          status: DatabaseBackupStatus.PENDING,
          createdById: userId || undefined,
        },
      });
    } catch (err) {
      this.busy = false;
      throw err;
    }

    // Fire-and-forget — client polls GET /backup/:id
    setImmediate(() => {
      void this.runDump(row.id);
    });

    return this.getOne(row.id);
  }

  async deleteBackup(id: string) {
    const row = await this.prisma.databaseBackup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Backup not found');
    if (
      row.status === DatabaseBackupStatus.RUNNING ||
      row.status === DatabaseBackupStatus.RESTORING ||
      row.status === DatabaseBackupStatus.PENDING
    ) {
      throw new ConflictException('Cannot delete a backup while it is in progress');
    }
    if (row.filePath && existsSync(row.filePath)) {
      await fs.unlink(row.filePath).catch(() => undefined);
    }
    await this.prisma.databaseBackup.delete({ where: { id } });
    return { ok: true };
  }

  async openDownloadStream(id: string) {
    const row = await this.prisma.databaseBackup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Backup not found');
    if (row.status !== DatabaseBackupStatus.READY || !row.filePath) {
      throw new BadRequestException('Backup file is not ready');
    }
    if (!existsSync(row.filePath)) {
      throw new NotFoundException('Backup file missing on disk');
    }
    return {
      stream: createReadStream(row.filePath),
      fileName: row.fileName || basename(row.filePath),
      sizeBytes: row.sizeBytes ? Number(row.sizeBytes) : undefined,
    };
  }

  /**
   * Restore from an existing catalogued backup.
   * Requires confirmationPhrase === 'RESTORE'
   */
  async restoreFromBackup(id: string, confirmationPhrase: string, userId: string) {
    this.assertRestorePhrase(confirmationPhrase);
    const row = await this.prisma.databaseBackup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Backup not found');
    if (row.status !== DatabaseBackupStatus.READY || !row.filePath) {
      throw new BadRequestException('Backup is not ready to restore');
    }
    if (!existsSync(row.filePath)) {
      throw new NotFoundException('Backup file missing on disk');
    }

    return this.startRestore(row.filePath, userId, row.id);
  }

  /**
   * Restore from an uploaded .dump / .backup file (server migration).
   */
  async restoreFromUpload(
    file: Express.Multer.File,
    confirmationPhrase: string,
    userId: string,
  ) {
    this.assertRestorePhrase(confirmationPhrase);
    const pathOnDisk = file?.path;
    if (!pathOnDisk || !existsSync(pathOnDisk)) {
      throw new BadRequestException('Backup file is required');
    }
    const name = (file.originalname || 'upload.dump').toLowerCase();
    if (!name.endsWith('.dump') && !name.endsWith('.backup') && !name.endsWith('.pgdump')) {
      await fs.unlink(pathOnDisk).catch(() => undefined);
      throw new BadRequestException('Upload a PostgreSQL custom-format dump (.dump)');
    }
    return this.startRestore(pathOnDisk, userId, null);
  }

  // ─── internals ─────────────────────────────────────────────

  private assertRestorePhrase(phrase: string) {
    if ((phrase || '').trim() !== 'RESTORE') {
      throw new BadRequestException(
        'Type RESTORE exactly to confirm. This replaces the live database.',
      );
    }
  }

  private async startRestore(
    dumpPath: string,
    userId: string,
    sourceBackupId: string | null,
  ) {
    const tools = this.detectTools();
    if (!tools.pgRestore) {
      throw new ServiceUnavailableException(
        'pg_restore is not installed in the API container. Rebuild the image with postgresql-client.',
      );
    }

    // Safety snapshot before destructive restore (best-effort)
    let safetyId: string | null = null;
    try {
      const safety = await this.createBackup(
        userId,
        `Pre-restore safety ${new Date().toISOString()}`,
      );
      safetyId = safety.id;
      await this.waitUntilNotPending(safety.id, 180_000);
    } catch (err) {
      this.logger.warn(
        `Could not create pre-restore safety backup: ${(err as Error).message}`,
      );
    }

    this.claimBusy();

    if (sourceBackupId) {
      await this.prisma.databaseBackup.update({
        where: { id: sourceBackupId },
        data: { status: DatabaseBackupStatus.RESTORING },
      });
    }

    setImmediate(() => {
      void this.runRestore(dumpPath, sourceBackupId);
    });

    return {
      ok: true,
      message:
        'Restore started. The API may briefly error while tables are replaced. Refresh after ~30–60s.',
      safetyBackupId: safetyId,
      sourceBackupId,
    };
  }

  private claimBusy() {
    if (this.busy) {
      throw new ConflictException('A backup or restore is already in progress');
    }
    this.busy = true;
  }

  private async waitUntilNotPending(id: string, timeoutMs: number) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const row = await this.prisma.databaseBackup.findUnique({ where: { id } });
      if (!row) return;
      if (
        row.status === DatabaseBackupStatus.READY ||
        row.status === DatabaseBackupStatus.FAILED
      ) {
        if (row.status === DatabaseBackupStatus.FAILED) {
          throw new BadRequestException(
            row.errorMessage || 'Pre-restore safety backup failed',
          );
        }
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new ConflictException(
      'Timed out waiting for pre-restore safety backup. Try again when the system is idle.',
    );
  }

  private async runDump(id: string) {
    const fileName = `kadaima-${id.slice(0, 8)}-${Date.now()}.dump`;
    const filePath = join(this.backupDir, fileName);
    const conn = this.parseDatabaseUrl();

    try {
      await this.prisma.databaseBackup.update({
        where: { id },
        data: {
          status: DatabaseBackupStatus.RUNNING,
          startedAt: new Date(),
          fileName,
          filePath,
          errorMessage: null,
        },
      });

      await this.execPgTool('pg_dump', [
        '--format=custom',
        '--compress=6',
        '--no-owner',
        '--no-acl',
        '--file',
        filePath,
        '--dbname',
        this.buildPgUri(conn),
      ]);

      const stat = await fs.stat(filePath);
      const checksum = await this.sha256File(filePath);
      const pgVersion = await this.readPgVersion(conn);

      await this.prisma.databaseBackup.update({
        where: { id },
        data: {
          status: DatabaseBackupStatus.READY,
          sizeBytes: BigInt(stat.size),
          checksumSha256: checksum,
          pgVersion,
          finishedAt: new Date(),
        },
      });

      await this.enforceRetention();
      this.logger.log(`Backup ready: ${fileName} (${stat.size} bytes)`);
    } catch (err) {
      const message = (err as Error).message || String(err);
      this.logger.error(`Backup failed: ${message}`);
      await this.prisma.databaseBackup
        .update({
          where: { id },
          data: {
            status: DatabaseBackupStatus.FAILED,
            errorMessage: message.slice(0, 4000),
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
      if (existsSync(filePath)) {
        await fs.unlink(filePath).catch(() => undefined);
      }
    } finally {
      this.busy = false;
    }
  }

  private async runRestore(dumpPath: string, sourceBackupId: string | null) {
    const conn = this.parseDatabaseUrl();
    try {
      // --clean drops objects before recreate; --if-exists softens missing-object errors
      await this.execPgTool('pg_restore', [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--dbname',
        this.buildPgUri(conn),
        dumpPath,
      ]);
      this.logger.log(`Restore completed from ${dumpPath}`);
      if (sourceBackupId) {
        await this.prisma.databaseBackup
          .update({
            where: { id: sourceBackupId },
            data: { status: DatabaseBackupStatus.READY },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      const message = (err as Error).message || String(err);
      this.logger.error(`Restore failed: ${message}`);
      if (sourceBackupId) {
        await this.prisma.databaseBackup
          .update({
            where: { id: sourceBackupId },
            data: {
              status: DatabaseBackupStatus.FAILED,
              errorMessage: `Restore failed: ${message}`.slice(0, 4000),
            },
          })
          .catch(() => undefined);
      }
    } finally {
      this.busy = false;
    }
  }

  private async enforceRetention() {
    if (this.retentionCount < 1) return;
    const ready = await this.prisma.databaseBackup.findMany({
      where: { status: DatabaseBackupStatus.READY },
      orderBy: { createdAt: 'desc' },
      select: { id: true, filePath: true },
    });
    const excess = ready.slice(this.retentionCount);
    for (const row of excess) {
      if (row.filePath && existsSync(row.filePath)) {
        await fs.unlink(row.filePath).catch(() => undefined);
      }
      await this.prisma.databaseBackup.delete({ where: { id: row.id } }).catch(() => undefined);
    }
  }

  private execPgTool(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => {
        reject(
          new Error(
            `${bin} failed to start: ${err.message}. Is postgresql-client installed?`,
          ),
        );
      });
      child.on('close', (code) => {
        // pg_restore often exits 1 with non-fatal warnings; treat only hard failures
        if (code === 0) {
          resolve();
          return;
        }
        if (bin === 'pg_restore' && code === 1) {
          // Warnings during --clean are common; verify by checking stderr for FATAL
          if (/FATAL|could not connect|password authentication failed/i.test(stderr)) {
            reject(new Error(stderr.trim() || `${bin} exited with code ${code}`));
            return;
          }
          this.logger.warn(`pg_restore exited 1 (warnings):\n${stderr.slice(0, 2000)}`);
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `${bin} exited with code ${code}`));
      });
    });
  }

  private async sha256File(path: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(createReadStream(path), hash);
    return hash.digest('hex');
  }

  private async readPgVersion(conn: DbConnectionInfo): Promise<string | null> {
    try {
      const out = await this.execCapture('psql', [
        '--dbname',
        this.buildPgUri(conn),
        '-tAc',
        'SHOW server_version',
      ]);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  private execCapture(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { env: { ...process.env } });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => (stdout += c.toString()));
      child.stderr.on('data', (c) => (stderr += c.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `${bin} exit ${code}`));
      });
    });
  }

  private detectTools() {
    return {
      pgDump: this.commandExists('pg_dump'),
      pgRestore: this.commandExists('pg_restore'),
      psql: this.commandExists('psql'),
    };
  }

  private commandExists(bin: string): boolean {
    try {
      const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
      return r.status === 0;
    } catch {
      return false;
    }
  }

  parseDatabaseUrl(): DbConnectionInfo {
    const raw = this.config.get<string>('DATABASE_URL');
    if (!raw) throw new ServiceUnavailableException('DATABASE_URL is not set');
    try {
      const u = new URL(raw);
      return {
        host: u.hostname,
        port: u.port || '5432',
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, '').split('?')[0],
      };
    } catch {
      throw new ServiceUnavailableException('Invalid DATABASE_URL');
    }
  }

  private buildPgUri(conn: DbConnectionInfo): string {
    const user = encodeURIComponent(conn.user);
    const pass = encodeURIComponent(conn.password);
    return `postgresql://${user}:${pass}@${conn.host}:${conn.port}/${conn.database}`;
  }

  private safeDbHint() {
    try {
      const c = this.parseDatabaseUrl();
      return `${c.host}:${c.port}/${c.database}`;
    } catch {
      return null;
    }
  }

  private serialize(row: any) {
    return {
      id: row.id,
      label: row.label,
      status: row.status,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes != null ? Number(row.sizeBytes) : null,
      checksumSha256: row.checksumSha256,
      pgVersion: row.pgVersion,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy
        ? {
            id: row.createdBy.id,
            email: row.createdBy.email,
            name: row.createdBy.name,
          }
        : null,
      downloadReady: row.status === DatabaseBackupStatus.READY && !!row.filePath,
    };
  }
}
