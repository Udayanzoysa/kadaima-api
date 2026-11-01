import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ClassBatchStatus,
  ClassEnrollmentStatus,
  ClassQuizAssignmentStatus,
  LessonResourceAccessPolicy,
  LessonResourceScanStatus,
  LessonResourceType,
  LessonStatus,
  Prisma,
  QuizStatus,
  Role,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassesService, RequestActor } from './classes.service';
import {
  CreateClassQuizAssignmentDto,
  CreateLessonDto,
  CreateLessonResourceDto,
  MarkLessonProgressDto,
  RequestResourceAccessDto,
  UpdateClassQuizAssignmentDto,
  UpdateLessonDto,
} from './dto/class-learning.dto';

const PRIVATE_STORAGE_DIR = join(
  process.cwd(),
  'private-storage',
  'lesson-resources',
);

const MAX_RESOURCE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_MAP: Record<
  string,
  { ext: string; allowedTypes: LessonResourceType[] }
> = {
  'application/pdf': {
    ext: 'pdf',
    allowedTypes: [LessonResourceType.PDF, LessonResourceType.DOCUMENT],
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    allowedTypes: [LessonResourceType.DOCUMENT],
  },
  'application/msword': {
    ext: 'doc',
    allowedTypes: [LessonResourceType.DOCUMENT],
  },
  'text/plain': {
    ext: 'txt',
    allowedTypes: [LessonResourceType.DOCUMENT],
  },
  'image/png': {
    ext: 'png',
    allowedTypes: [LessonResourceType.IMAGE],
  },
  'image/jpeg': {
    ext: 'jpg',
    allowedTypes: [LessonResourceType.IMAGE],
  },
  'image/webp': {
    ext: 'webp',
    allowedTypes: [LessonResourceType.IMAGE],
  },
};

export function sanitizeRichTextString(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(javascript|vbscript|data:text\/html)\s*:/gi, 'blocked:');
}

export function toSanitizedLocalizedJson(value: {
  en?: string;
  si?: string;
  ta?: string;
}): Prisma.InputJsonValue {
  const en = sanitizeRichTextString(value.en).trim();
  const si = sanitizeRichTextString(value.si).trim() || en;
  const ta = sanitizeRichTextString(value.ta).trim() || en;
  return { en, si, ta } as Prisma.InputJsonValue;
}

export function assertSafeExternalUrl(rawUrl?: string | null): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    throw new BadRequestException('External URL is required for this resource.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('Invalid URL format.');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException(
      'Only HTTPS URLs are permitted for external lesson resources.',
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '169.254.169.254' ||
    host.endsWith('.internal')
  ) {
    throw new BadRequestException('Unsafe or private host in external URL.');
  }

  return parsed.toString();
}

export function assertSafeFileBuffer(
  buffer: Buffer,
  mimeType: string,
  resourceType: LessonResourceType,
): { ext: string; checksumSha256: string } {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Uploaded file is empty.');
  }
  if (buffer.length > MAX_RESOURCE_FILE_BYTES) {
    throw new BadRequestException(
      'Uploaded file exceeds the 25 MB maximum size limit.',
    );
  }

  const spec = ALLOWED_MIME_MAP[mimeType];
  if (!spec || !spec.allowedTypes.includes(resourceType)) {
    throw new BadRequestException(
      `Unsupported file MIME type "${mimeType}" for resource type ${resourceType}.`,
    );
  }

  // Reject disguised Windows PE (MZ) or Linux ELF binaries or inline HTML scripts
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new BadRequestException(
      'Executable binary files are strictly prohibited.',
    );
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    throw new BadRequestException(
      'Executable ELF files are strictly prohibited.',
    );
  }

  const headUtf8 = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8');
  if (/<script[\s>]/i.test(headUtf8)) {
    throw new BadRequestException(
      'File failed security inspection (embedded script detected).',
    );
  }

  const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
  return { ext: spec.ext, checksumSha256 };
}

interface SignedResourceTokenPayload {
  r: string; // resourceId
  u: string; // userId
  c: string | null; // classId
  exp: number; // unix seconds
}

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly classesService: ClassesService,
  ) {}

  private getSigningSecret(): string {
    return (
      process.env.JWT_SECRET ||
      process.env.RESOURCE_SIGNING_SECRET ||
      'kadaima-lms-private-resource-signing-key'
    );
  }

  public createSignedResourceToken(params: {
    resourceId: string;
    userId: string;
    classId?: string | null;
    ttlSeconds?: number;
  }): { token: string; expiresAt: string } {
    const ttl = params.ttlSeconds ?? 300; // 5 minutes short-lived token
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const payload: SignedResourceTokenPayload = {
      r: params.resourceId,
      u: params.userId,
      c: params.classId ?? null,
      exp,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const sigHex = createHmac('sha256', this.getSigningSecret())
      .update(payloadB64)
      .digest('hex');

    return {
      token: `${payloadB64}.${sigHex}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  public verifySignedResourceToken(
    token: string,
    expectedResourceId: string,
    actorId: string,
  ): SignedResourceTokenPayload {
    if (!token || !token.includes('.')) {
      throw new ForbiddenException('Missing or malformed resource access token.');
    }
    const [payloadB64, sigHex] = token.split('.');
    if (!payloadB64 || !sigHex) {
      throw new ForbiddenException('Invalid resource access token format.');
    }

    const expectedSigHex = createHmac('sha256', this.getSigningSecret())
      .update(payloadB64)
      .digest('hex');

    const sigBuf = Buffer.from(sigHex, 'utf8');
    const expBuf = Buffer.from(expectedSigHex, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new ForbiddenException('Invalid resource access token signature.');
    }

    let payload: SignedResourceTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as SignedResourceTokenPayload;
    } catch {
      throw new ForbiddenException('Corrupted resource access token payload.');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSec) {
      throw new ForbiddenException(
        'Resource access URL has expired. Please reopen the resource from your lesson.',
      );
    }

    if (payload.r !== expectedResourceId) {
      throw new ForbiddenException(
        'Resource access token does not match the requested resource.',
      );
    }

    // Non-negotiable: token is bound to the specific authenticated user who requested it
    if (payload.u !== actorId) {
      throw new ForbiddenException(
        'Copied resource URL cannot be used by another user account.',
      );
    }

    return payload;
  }

  /**
   * Verifies that a teacher or Super Admin can author lessons for a given Course.
   */
  private async assertTeacherCourseAuthorAccess(
    courseId: string,
    actor: RequestActor,
  ): Promise<void> {
    if (actor.role === Role.SUPER_ADMIN) return;
    if (actor.team === 'Student') {
      throw new ForbiddenException('Students cannot create or modify lessons.');
    }

    // Teacher must own or be an instructor on at least one non-archived batch of this course,
    // or be an active Teacher/Admin in the system
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      include: {
        teacherProfile: { select: { id: true } },
        customRole: { select: { name: true } },
      },
    });
    if (!user) {
      throw new ForbiddenException('User account not found.');
    }

    const isTeacherOrAdmin =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.CUSTOMER_ADMIN ||
      user.team === 'Teacher' ||
      Boolean(user.teacherProfile) ||
      user.customRole?.name === 'Teacher' ||
      user.customRole?.name === 'Owner' ||
      user.customRole?.name === 'Admin';

    if (!isTeacherOrAdmin) {
      throw new ForbiddenException(
        'Only authorized teachers or administrators can manage lesson content.',
      );
    }

    const assignedBatch = await this.prisma.classBatch.findFirst({
      where: {
        courseId,
        OR: [
          { primaryTeacherId: actor.id },
          {
            teachers: {
              some: {
                teacherId: actor.id,
                permissionScope: { in: ['OWNER', 'INSTRUCTOR'] },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (!assignedBatch && user.role !== Role.CUSTOMER_ADMIN) {
      throw new ForbiddenException(
        'You must be an assigned instructor on a class batch of this course to edit its lessons.',
      );
    }
  }

  private isLessonVisibleToStudent(lesson: {
    status: LessonStatus;
    publishAt: Date | null;
  }): boolean {
    const now = Date.now();
    if (lesson.status === LessonStatus.Published) {
      return !lesson.publishAt || lesson.publishAt.getTime() <= now;
    }
    if (lesson.status === LessonStatus.Scheduled) {
      return Boolean(lesson.publishAt && lesson.publishAt.getTime() <= now);
    }
    return false;
  }

  /**
   * Formats a LessonResource for API responses — NEVER leaks `storageKey`!
   */
  public formatResourceForClient(resource: any) {
    return {
      id: resource.id,
      lessonId: resource.lessonId,
      title: resource.title,
      type: resource.type as LessonResourceType,
      fileName: resource.fileName ?? null,
      externalUrl: resource.externalUrl ?? null,
      noteText: resource.noteText ?? null,
      mimeType: resource.mimeType ?? null,
      sizeBytes: resource.sizeBytes ?? null,
      accessPolicy: resource.accessPolicy as LessonResourceAccessPolicy,
      sortOrder: resource.sortOrder ?? 0,
      scanStatus: resource.scanStatus as LessonResourceScanStatus,
      hasPrivateFile: Boolean(resource.storageKey),
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  public formatLessonForClient(lesson: any) {
    return {
      id: lesson.id,
      moduleId: lesson.moduleId,
      title: lesson.title,
      summary: lesson.summary ?? null,
      body: lesson.body ?? null,
      sortOrder: lesson.sortOrder,
      status: lesson.status as LessonStatus,
      publishAt: lesson.publishAt,
      estimatedMinutes: lesson.estimatedMinutes ?? null,
      resources: (lesson.resources ?? []).map((r: any) =>
        this.formatResourceForClient(r),
      ),
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    };
  }

  // ==========================================================================
  // Lesson CRUD
  // ==========================================================================

  async createLesson(
    moduleId: string,
    dto: CreateLessonDto,
    actor: RequestActor,
  ) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!mod) {
      throw new NotFoundException('Module not found.');
    }

    await this.assertTeacherCourseAuthorAccess(mod.courseId, actor);

    if (!dto.title?.en || dto.title.en.trim().length < 2) {
      throw new BadRequestException(
        'Lesson title in English is required (minimum 2 characters).',
      );
    }

    const created = await this.prisma.lesson.create({
      data: {
        moduleId: mod.id,
        title: toSanitizedLocalizedJson(dto.title),
        summary: dto.summary ? toSanitizedLocalizedJson(dto.summary) : undefined,
        body: dto.body ? toSanitizedLocalizedJson(dto.body) : undefined,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? LessonStatus.Draft,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
        estimatedMinutes: dto.estimatedMinutes ?? null,
        createdById: actor.id,
      },
      include: {
        resources: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: created.id,
      description: `Created lesson "${dto.title.en.trim()}" in module ${moduleId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatLessonForClient(created);
  }

  async listModuleLessons(moduleId: string, actor: RequestActor) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
    });
    if (!mod) {
      throw new NotFoundException('Module not found.');
    }

    // Check if actor is a teacher/admin or an actively enrolled student in a batch of this course
    let isTeacherView = actor.role === Role.SUPER_ADMIN;
    if (!isTeacherView && actor.team !== 'Student') {
      try {
        await this.assertTeacherCourseAuthorAccess(mod.courseId, actor);
        isTeacherView = true;
      } catch {
        isTeacherView = false;
      }
    }

    if (!isTeacherView) {
      const activeEnrollment = await this.prisma.classEnrollment.findFirst({
        where: {
          studentId: actor.id,
          status: ClassEnrollmentStatus.ACTIVE,
          classBatch: {
            courseId: mod.courseId,
            status: ClassBatchStatus.Published,
          },
        },
      });
      if (!activeEnrollment) {
        throw new ForbiddenException(
          'You do not have access to lessons in this module.',
        );
      }
    }

    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        resources: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    const filtered = isTeacherView
      ? lessons
      : lessons.filter((l) => this.isLessonVisibleToStudent(l));

    return filtered.map((l) => this.formatLessonForClient(l));
  }

  async updateLesson(
    lessonId: string,
    dto: UpdateLessonDto,
    actor: RequestActor,
  ) {
    const existing = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!existing) {
      throw new NotFoundException('Lesson not found.');
    }

    await this.assertTeacherCourseAuthorAccess(existing.module.courseId, actor);

    if (dto.title !== undefined && (!dto.title.en || dto.title.en.trim().length < 2)) {
      throw new BadRequestException(
        'Lesson title in English is required (minimum 2 characters).',
      );
    }

    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(dto.title ? { title: toSanitizedLocalizedJson(dto.title) } : {}),
        ...(dto.summary !== undefined
          ? {
              summary: dto.summary
                ? toSanitizedLocalizedJson(dto.summary)
                : Prisma.DbNull,
            }
          : {}),
        ...(dto.body !== undefined
          ? {
              body: dto.body
                ? toSanitizedLocalizedJson(dto.body)
                : Prisma.DbNull,
            }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.publishAt !== undefined
          ? { publishAt: dto.publishAt ? new Date(dto.publishAt) : null }
          : {}),
        ...(dto.estimatedMinutes !== undefined
          ? { estimatedMinutes: dto.estimatedMinutes }
          : {}),
      },
      include: {
        resources: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    void this.auditService.log({
      action: AuditAction.UPDATE,
      subject: 'CLASSES',
      targetId: lessonId,
      description: `Updated lesson ${lessonId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatLessonForClient(updated);
  }

  async deleteLesson(lessonId: string, actor: RequestActor) {
    const existing = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true, resources: true },
    });
    if (!existing) {
      throw new NotFoundException('Lesson not found.');
    }

    await this.assertTeacherCourseAuthorAccess(existing.module.courseId, actor);

    // Clean up private files on disk
    for (const res of existing.resources) {
      if (res.storageKey) {
        const fullPath = join(PRIVATE_STORAGE_DIR, res.storageKey);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
          } catch {
            // ignore unlink errors
          }
        }
      }
    }

    await this.prisma.lesson.delete({ where: { id: lessonId } });

    void this.auditService.log({
      action: AuditAction.DELETE,
      subject: 'CLASSES',
      targetId: lessonId,
      description: `Deleted lesson ${lessonId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return { deleted: true, id: lessonId };
  }

  // ==========================================================================
  // Lesson Resources & Private File Streaming
  // ==========================================================================

  async addLessonResource(
    lessonId: string,
    dto: CreateLessonResourceDto,
    file: Express.Multer.File | undefined,
    actor: RequestActor,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found.');
    }

    await this.assertTeacherCourseAuthorAccess(lesson.module.courseId, actor);

    if (!dto.title?.en || dto.title.en.trim().length < 2) {
      throw new BadRequestException(
        'Resource title in English is required (minimum 2 characters).',
      );
    }

    const isFileType =
      dto.type === LessonResourceType.PDF ||
      dto.type === LessonResourceType.DOCUMENT ||
      dto.type === LessonResourceType.IMAGE;

    let storageKey: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;
    let checksumSha256: string | null = null;
    let externalUrl: string | null = null;
    let noteText: Prisma.InputJsonValue | undefined;

    if (isFileType) {
      if (!file || !file.buffer?.length) {
        throw new BadRequestException(
          `A file upload is required for resource type ${dto.type}.`,
        );
      }
      const validated = assertSafeFileBuffer(
        file.buffer,
        file.mimetype,
        dto.type,
      );
      fs.mkdirSync(PRIVATE_STORAGE_DIR, { recursive: true });
      storageKey = `${randomUUID()}.${validated.ext}`;
      fs.writeFileSync(join(PRIVATE_STORAGE_DIR, storageKey), file.buffer);
      fileName =
        (file.originalname || `resource.${validated.ext}`)
          .replace(/[^\w.\- ()]/g, '_')
          .slice(0, 200) || `resource.${validated.ext}`;
      mimeType = file.mimetype;
      sizeBytes = file.buffer.length;
      checksumSha256 = validated.checksumSha256;
    } else if (
      dto.type === LessonResourceType.VIDEO_EMBED ||
      dto.type === LessonResourceType.EXTERNAL_LINK
    ) {
      externalUrl = assertSafeExternalUrl(dto.externalUrl);
    } else if (dto.type === LessonResourceType.TEACHER_NOTE) {
      if (!dto.noteText?.en?.trim()) {
        throw new BadRequestException(
          'Teacher note content in English is required.',
        );
      }
      noteText = toSanitizedLocalizedJson(dto.noteText);
    }

    const created = await this.prisma.lessonResource.create({
      data: {
        lessonId: lesson.id,
        title: toSanitizedLocalizedJson(dto.title),
        type: dto.type,
        storageKey,
        fileName,
        externalUrl,
        noteText,
        mimeType,
        sizeBytes,
        accessPolicy:
          dto.accessPolicy ?? LessonResourceAccessPolicy.DOWNLOADABLE,
        sortOrder: dto.sortOrder ?? 0,
        scanStatus: LessonResourceScanStatus.CLEAN,
        checksumSha256,
        createdById: actor.id,
      },
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: created.id,
      description: `Added ${dto.type} resource to lesson ${lessonId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatResourceForClient(created);
  }

  async removeLessonResource(
    lessonId: string,
    resourceId: string,
    actor: RequestActor,
  ) {
    const resource = await this.prisma.lessonResource.findFirst({
      where: { id: resourceId, lessonId },
      include: { lesson: { include: { module: true } } },
    });
    if (!resource) {
      throw new NotFoundException('Lesson resource not found.');
    }

    await this.assertTeacherCourseAuthorAccess(
      resource.lesson.module.courseId,
      actor,
    );

    if (resource.storageKey) {
      const fullPath = join(PRIVATE_STORAGE_DIR, resource.storageKey);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore unlink errors
        }
      }
    }

    await this.prisma.lessonResource.delete({ where: { id: resourceId } });

    void this.auditService.log({
      action: AuditAction.DELETE,
      subject: 'CLASSES',
      targetId: resourceId,
      description: `Removed resource ${resourceId} from lesson ${lessonId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return { deleted: true, id: resourceId };
  }

  /**
   * Verifies that `actor` is authorized to access `resource` (either as course teacher/admin
   * or as an ACTIVE enrolled student in a published class batch of that course).
   */
  private async verifyResourceAccessAuthorization(
    resource: {
      id: string;
      scanStatus: LessonResourceScanStatus;
      lesson: {
        id: string;
        status: LessonStatus;
        publishAt: Date | null;
        module: { courseId: string };
      };
    },
    actor: RequestActor,
    classId?: string | null,
  ): Promise<void> {
    if (resource.scanStatus === LessonResourceScanStatus.QUARANTINED) {
      throw new ForbiddenException(
        'This resource has been quarantined by security scan.',
      );
    }

    const courseId = resource.lesson.module.courseId;

    if (actor.role === Role.SUPER_ADMIN) return;

    if (actor.team !== 'Student') {
      try {
        await this.assertTeacherCourseAuthorAccess(courseId, actor);
        return;
      } catch {
        // fall through to student enrollment check
      }
    }

    // Student must have an ACTIVE enrollment in a Published batch of this course
    if (!this.isLessonVisibleToStudent(resource.lesson)) {
      throw new ForbiddenException('This lesson is not yet published.');
    }

    const enrollment = await this.prisma.classEnrollment.findFirst({
      where: {
        studentId: actor.id,
        status: ClassEnrollmentStatus.ACTIVE,
        ...(classId ? { classId } : {}),
        classBatch: {
          courseId,
          status: ClassBatchStatus.Published,
        },
      },
    });

    if (!enrollment) {
      throw new ForbiddenException(
        'You must be an actively enrolled student in this class to access lesson materials.',
      );
    }
  }

  async generateResourceAccessUrl(
    lessonId: string,
    resourceId: string,
    dto: RequestResourceAccessDto,
    actor: RequestActor,
  ) {
    const resource = await this.prisma.lessonResource.findFirst({
      where: { id: resourceId, lessonId },
      include: {
        lesson: {
          include: { module: true },
        },
      },
    });
    if (!resource) {
      throw new NotFoundException('Lesson resource not found.');
    }

    await this.verifyResourceAccessAuthorization(
      resource,
      actor,
      dto.classId ?? null,
    );

    const { token, expiresAt } = this.createSignedResourceToken({
      resourceId: resource.id,
      userId: actor.id,
      classId: dto.classId ?? null,
      ttlSeconds: 300, // 5 minutes
    });

    return {
      resourceId: resource.id,
      type: resource.type,
      accessPolicy: resource.accessPolicy,
      fileName: resource.fileName,
      mimeType: resource.mimeType,
      externalUrl: resource.externalUrl,
      noteText: resource.noteText,
      token,
      streamPath: resource.storageKey
        ? `/lessons/resources/${resource.id}/stream?token=${encodeURIComponent(token)}`
        : null,
      expiresAt,
    };
  }

  async openResourceStream(
    resourceId: string,
    token: string,
    actor: RequestActor,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    disposition: 'inline' | 'attachment';
  }> {
    const payload = this.verifySignedResourceToken(
      token,
      resourceId,
      actor.id,
    );

    const resource = await this.prisma.lessonResource.findUnique({
      where: { id: resourceId },
      include: {
        lesson: {
          include: { module: true },
        },
      },
    });
    if (!resource || !resource.storageKey) {
      throw new NotFoundException('Private resource file not found.');
    }

    // Re-verify live enrollment / teacher status at stream time (handles mid-session suspension!)
    await this.verifyResourceAccessAuthorization(
      resource,
      actor,
      payload.c,
    );

    const fullPath = join(PRIVATE_STORAGE_DIR, resource.storageKey);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Resource file is missing from private storage.');
    }

    const buffer = fs.readFileSync(fullPath);
    const disposition =
      resource.accessPolicy === LessonResourceAccessPolicy.VIEW_ONLY
        ? 'inline'
        : 'attachment';

    return {
      buffer,
      mimeType: resource.mimeType || 'application/octet-stream',
      fileName: resource.fileName || 'lesson-resource',
      disposition,
    };
  }

  // ==========================================================================
  // Lesson Progress & Class Learning View
  // ==========================================================================

  async markLessonProgress(
    lessonId: string,
    dto: MarkLessonProgressDto,
    actor: RequestActor,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found.');
    }

    const enrollment = await this.prisma.classEnrollment.findUnique({
      where: {
        classId_studentId: {
          classId: dto.classId,
          studentId: actor.id,
        },
      },
      include: { classBatch: true },
    });

    if (
      !enrollment ||
      enrollment.status !== ClassEnrollmentStatus.ACTIVE ||
      enrollment.classBatch.status === ClassBatchStatus.Draft
    ) {
      throw new ForbiddenException(
        'You must be an actively enrolled student in this class to track lesson progress.',
      );
    }

    if (enrollment.classBatch.courseId !== lesson.module.courseId) {
      throw new BadRequestException(
        'This lesson does not belong to the course of the specified class batch.',
      );
    }

    if (!this.isLessonVisibleToStudent(lesson)) {
      throw new ForbiddenException('Cannot complete an unpublished lesson.');
    }

    const completed = dto.completed ?? true;

    if (completed) {
      const record = await this.prisma.lessonProgress.upsert({
        where: {
          classId_studentId_lessonId: {
            classId: dto.classId,
            studentId: actor.id,
            lessonId: lesson.id,
          },
        },
        update: {
          completedAt: new Date(),
        },
        create: {
          classId: dto.classId,
          studentId: actor.id,
          lessonId: lesson.id,
          completedAt: new Date(),
        },
      });
      return {
        lessonId: lesson.id,
        classId: dto.classId,
        completed: true,
        completedAt: record.completedAt,
      };
    }

    await this.prisma.lessonProgress.deleteMany({
      where: {
        classId: dto.classId,
        studentId: actor.id,
        lessonId: lesson.id,
      },
    });

    return {
      lessonId: lesson.id,
      classId: dto.classId,
      completed: false,
      completedAt: null,
    };
  }

  async getClassLearning(classId: string, actor: RequestActor) {
    // Verifies either teacher/admin access OR active student enrollment in `classId`
    const batch = await this.classesService.getClassById(classId, actor);

    const isStudentView = Boolean((batch as any).myEnrollment);

    const [modules, progressRows, quizAssignments, studentAttempts] =
      await Promise.all([
        this.prisma.module.findMany({
          where: { courseId: batch.courseId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            lessons: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              include: {
                resources: {
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                },
              },
            },
          },
        }),
        isStudentView
          ? this.prisma.lessonProgress.findMany({
              where: { classId, studentId: actor.id },
            })
          : Promise.resolve([]),
        this.prisma.classQuizAssignment.findMany({
          where: {
            classId,
            ...(isStudentView
              ? { status: ClassQuizAssignmentStatus.Published }
              : {}),
          },
          orderBy: [{ createdAt: 'desc' }],
          include: {
            quiz: {
              select: {
                id: true,
                title: true,
                description: true,
                language: true,
                languages: true,
                durationMinutes: true,
                passingScorePercentage: true,
                maxAttempts: true,
                requiresUnlock: true,
                priceLkr: true,
                status: true,
              },
            },
          },
        }),
        isStudentView
          ? this.prisma.quizAttempt.findMany({
              where: { studentId: actor.id },
              orderBy: [{ startedAt: 'desc' }],
              select: {
                id: true,
                quizId: true,
                status: true,
                finalScore: true,
                isPassed: true,
                resultToken: true,
                submittedAt: true,
              },
            })
          : Promise.resolve([]),
      ]);

    const progressMap = new Map<string, Date>();
    for (const p of progressRows) {
      progressMap.set(p.lessonId, p.completedAt);
    }

    const formattedAssignments = quizAssignments.map((qa) =>
      this.formatQuizAssignment(qa, studentAttempts),
    );

    let totalPublishedLessons = 0;
    let completedLessons = 0;
    let continueLessonId: string | null = null;

    const formattedModules = modules.map((mod) => {
      const visibleLessons = isStudentView
        ? mod.lessons.filter((l) => this.isLessonVisibleToStudent(l))
        : mod.lessons;

      const mappedLessons = visibleLessons.map((lesson) => {
        const isPublished = this.isLessonVisibleToStudent(lesson);
        const completedAt = progressMap.get(lesson.id) ?? null;
        const isCompleted = Boolean(completedAt);

        if (isPublished) {
          totalPublishedLessons += 1;
          if (isCompleted) {
            completedLessons += 1;
          } else if (!continueLessonId) {
            continueLessonId = lesson.id;
          }
        }

        const attachedQuizzes = formattedAssignments.filter(
          (qa) => qa.lessonId === lesson.id,
        );

        return {
          ...this.formatLessonForClient(lesson),
          isCompleted,
          completedAt,
          quizAssignments: attachedQuizzes,
        };
      });

      return {
        id: mod.id,
        courseId: mod.courseId,
        title: mod.title,
        description: mod.description,
        status: mod.status,
        sortOrder: mod.sortOrder,
        lessons: mappedLessons,
      };
    });

    const completionPercentage =
      totalPublishedLessons > 0
        ? Math.round((completedLessons / totalPublishedLessons) * 100)
        : 0;

    return {
      classId: batch.id,
      courseId: batch.courseId,
      courseTitle: batch.course?.title,
      progressSummary: {
        completedLessons,
        totalPublishedLessons,
        completionPercentage,
        continueLessonId,
      },
      modules: formattedModules,
      quizAssignments: formattedAssignments,
    };
  }

  // ==========================================================================
  // Class Quiz Assignments (Reusing Canonical Kadaima Quizzes)
  // ==========================================================================

  private formatQuizAssignment(
    qa: any,
    studentAttempts: Array<{
      id: string;
      quizId: string;
      status: string;
      finalScore: number;
      isPassed: boolean;
      resultToken: string | null;
      submittedAt: Date | null;
    }> = [],
  ) {
    const now = Date.now();
    const fromMs = qa.availableFrom ? new Date(qa.availableFrom).getTime() : null;
    const dueMs = qa.dueAt ? new Date(qa.dueAt).getTime() : null;

    let availabilityState: 'UPCOMING' | 'OPEN' | 'PAST_DUE' = 'OPEN';
    if (fromMs && now < fromMs) {
      availabilityState = 'UPCOMING';
    } else if (dueMs && now > dueMs) {
      availabilityState = 'PAST_DUE';
    }

    const attemptsForQuiz = studentAttempts.filter(
      (a) => a.quizId === qa.quizId,
    );
    const submittedAttempts = attemptsForQuiz.filter(
      (a) => a.status === 'Submitted' || a.status === 'Timed_Out',
    );
    const bestScore =
      submittedAttempts.length > 0
        ? Math.max(...submittedAttempts.map((a) => a.finalScore))
        : null;
    const latestSubmitted = submittedAttempts[0] ?? null;

    return {
      id: qa.id,
      classId: qa.classId,
      lessonId: qa.lessonId ?? null,
      quizId: qa.quizId,
      displayTitle: qa.displayTitle ?? qa.quiz?.title ?? { en: 'Quiz' },
      availableFrom: qa.availableFrom,
      dueAt: qa.dueAt,
      status: qa.status as ClassQuizAssignmentStatus,
      availabilityState,
      quiz: qa.quiz
        ? {
            id: qa.quiz.id,
            title: qa.quiz.title,
            description: qa.quiz.description,
            language: qa.quiz.language,
            languages: qa.quiz.languages,
            durationMinutes: qa.quiz.durationMinutes,
            passingScorePercentage: qa.quiz.passingScorePercentage,
            maxAttempts: qa.quiz.maxAttempts,
            requiresUnlock: qa.quiz.requiresUnlock,
            priceLkr: qa.quiz.priceLkr ? Number(qa.quiz.priceLkr) : null,
            status: qa.quiz.status,
          }
        : null,
      studentAttemptSummary: {
        attemptCount: attemptsForQuiz.length,
        bestScore,
        isPassed: submittedAttempts.some((a) => a.isPassed),
        latestAttemptId: latestSubmitted?.id ?? null,
        latestResultToken: latestSubmitted?.resultToken ?? null,
      },
      createdAt: qa.createdAt,
      updatedAt: qa.updatedAt,
    };
  }

  private validateAssignmentWindow(
    availableFrom?: string | Date | null,
    dueAt?: string | Date | null,
  ) {
    if (!availableFrom || !dueAt) return;
    const from = new Date(availableFrom);
    const due = new Date(dueAt);
    if (Number.isNaN(from.getTime()) || Number.isNaN(due.getTime())) {
      throw new BadRequestException('Invalid availableFrom or dueAt date.');
    }
    if (from.getTime() > due.getTime()) {
      throw new BadRequestException(
        'Quiz availableFrom date must not be after dueAt date.',
      );
    }
  }

  async createQuizAssignment(
    classId: string,
    dto: CreateClassQuizAssignmentDto,
    actor: RequestActor,
  ) {
    const batch = await this.classesService.requireWriteAccess(classId, actor);
    this.validateAssignmentWindow(dto.availableFrom, dto.dueAt);

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: dto.quizId },
      select: {
        id: true,
        courseId: true,
        title: true,
        status: true,
      },
    });
    if (!quiz) {
      throw new NotFoundException('Referenced Kadaima quiz was not found.');
    }
    if (quiz.status === QuizStatus.Archived) {
      throw new BadRequestException('Cannot assign an archived quiz.');
    }

    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: dto.lessonId },
        include: { module: true },
      });
      if (!lesson || lesson.module.courseId !== batch.courseId) {
        throw new BadRequestException(
          'Specified lesson does not belong to this class batch course.',
        );
      }
    }

    const existing = await this.prisma.classQuizAssignment.findUnique({
      where: {
        classId_quizId: {
          classId: batch.id,
          quizId: dto.quizId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'This quiz is already assigned to this class batch.',
      );
    }

    const created = await this.prisma.classQuizAssignment.create({
      data: {
        classId: batch.id,
        lessonId: dto.lessonId ?? null,
        quizId: dto.quizId,
        displayTitle: dto.displayTitle
          ? toSanitizedLocalizedJson(dto.displayTitle)
          : undefined,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        status: dto.status ?? ClassQuizAssignmentStatus.Published,
        assignedById: actor.id,
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            description: true,
            language: true,
            languages: true,
            durationMinutes: true,
            passingScorePercentage: true,
            maxAttempts: true,
            requiresUnlock: true,
            priceLkr: true,
            status: true,
          },
        },
      },
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: created.id,
      description: `Assigned quiz ${dto.quizId} to class ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatQuizAssignment(created);
  }

  async listClassQuizAssignments(classId: string, actor: RequestActor) {
    const batch = await this.classesService.getClassById(classId, actor);
    const isStudentView = Boolean((batch as any).myEnrollment);

    const [rows, studentAttempts] = await Promise.all([
      this.prisma.classQuizAssignment.findMany({
        where: {
          classId,
          ...(isStudentView
            ? { status: ClassQuizAssignmentStatus.Published }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              description: true,
              language: true,
              languages: true,
              durationMinutes: true,
              passingScorePercentage: true,
              maxAttempts: true,
              requiresUnlock: true,
              priceLkr: true,
              status: true,
            },
          },
        },
      }),
      isStudentView
        ? this.prisma.quizAttempt.findMany({
            where: { studentId: actor.id },
            orderBy: [{ startedAt: 'desc' }],
            select: {
              id: true,
              quizId: true,
              status: true,
              finalScore: true,
              isPassed: true,
              resultToken: true,
              submittedAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return rows.map((qa) => this.formatQuizAssignment(qa, studentAttempts));
  }

  async updateQuizAssignment(
    classId: string,
    assignmentId: string,
    dto: UpdateClassQuizAssignmentDto,
    actor: RequestActor,
  ) {
    const batch = await this.classesService.requireWriteAccess(classId, actor);

    const existing = await this.prisma.classQuizAssignment.findFirst({
      where: { id: assignmentId, classId: batch.id },
    });
    if (!existing) {
      throw new NotFoundException('Quiz assignment not found for this class.');
    }

    const nextFrom =
      dto.availableFrom !== undefined
        ? dto.availableFrom
        : existing.availableFrom?.toISOString() ?? null;
    const nextDue =
      dto.dueAt !== undefined
        ? dto.dueAt
        : existing.dueAt?.toISOString() ?? null;
    this.validateAssignmentWindow(nextFrom, nextDue);

    const updated = await this.prisma.classQuizAssignment.update({
      where: { id: assignmentId },
      data: {
        ...(dto.lessonId !== undefined ? { lessonId: dto.lessonId } : {}),
        ...(dto.displayTitle !== undefined
          ? {
              displayTitle: dto.displayTitle
                ? toSanitizedLocalizedJson(dto.displayTitle)
                : Prisma.DbNull,
            }
          : {}),
        ...(dto.availableFrom !== undefined
          ? {
              availableFrom: dto.availableFrom
                ? new Date(dto.availableFrom)
                : null,
            }
          : {}),
        ...(dto.dueAt !== undefined
          ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            description: true,
            language: true,
            languages: true,
            durationMinutes: true,
            passingScorePercentage: true,
            maxAttempts: true,
            requiresUnlock: true,
            priceLkr: true,
            status: true,
          },
        },
      },
    });

    return this.formatQuizAssignment(updated);
  }

  async removeQuizAssignment(
    classId: string,
    assignmentId: string,
    actor: RequestActor,
  ) {
    await this.classesService.requireWriteAccess(classId, actor);

    const existing = await this.prisma.classQuizAssignment.findFirst({
      where: { id: assignmentId, classId },
    });
    if (!existing) {
      throw new NotFoundException('Quiz assignment not found for this class.');
    }

    await this.prisma.classQuizAssignment.delete({
      where: { id: assignmentId },
    });

    return { deleted: true, id: assignmentId };
  }

  async listStudentClassQuizzes(actor: RequestActor) {
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        studentId: actor.id,
        status: ClassEnrollmentStatus.ACTIVE,
        classBatch: {
          status: ClassBatchStatus.Published,
        },
      },
      select: {
        classId: true,
        classBatch: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) return [];

    const classTitleMap = new Map<string, any>();
    for (const e of enrollments) {
      classTitleMap.set(e.classId, e.classBatch.title);
    }

    const [assignments, studentAttempts] = await Promise.all([
      this.prisma.classQuizAssignment.findMany({
        where: {
          classId: { in: classIds },
          status: ClassQuizAssignmentStatus.Published,
        },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              description: true,
              language: true,
              languages: true,
              durationMinutes: true,
              passingScorePercentage: true,
              maxAttempts: true,
              requiresUnlock: true,
              priceLkr: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId: actor.id },
        orderBy: [{ startedAt: 'desc' }],
        select: {
          id: true,
          quizId: true,
          status: true,
          finalScore: true,
          isPassed: true,
          resultToken: true,
          submittedAt: true,
        },
      }),
    ]);

    return assignments.map((qa) => ({
      ...this.formatQuizAssignment(qa, studentAttempts),
      classTitle: classTitleMap.get(qa.classId) ?? { en: 'Class' },
    }));
  }
}

