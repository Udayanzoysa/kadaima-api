import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptStatus,
  AttendanceStatus,
  AuditAction,
  ClassBatchStatus,
  ClassEnrollmentStatus,
  ClassLocationType,
  ClassQuizAssignmentStatus,
  ClassSessionStatus,
  ClassTeacherScope,
  ContentLanguage,
  LessonStatus,
  Prisma,
  Role,
  SlipSubmissionStatus,
  TuitionInvoiceStatus,
  TuitionPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { findIdsByLocalizedTitle } from '../common/localized-json-search';
import {
  CreateClassBatchDto,
  ListClassBatchesQueryDto,
  UpdateClassBatchDto,
} from './dto/class-batch.dto';
import {
  CreateClassEnrollmentDto,
  CreateClassInvitationDto,
  JoinClassByCodeDto,
  ListClassEnrollmentsQueryDto,
  StudentRespondEnrollmentDto,
  UpdateClassEnrollmentDto,
} from './dto/class-enrollment.dto';
import {
  CreateClassScheduleDto,
  StudentTimetableQueryDto,
  UpdateClassScheduleDto,
} from './dto/class-schedule.dto';

export interface RequestActor {
  id: string;
  email?: string;
  role: Role | string;
  team?: string | null;
  workspaceId?: string | null;
}

export interface TimetableOccurrence {
  occurrenceKey: string;
  scheduleId: string;
  classId: string;
  classTitle: Record<string, string>;
  courseId: string;
  courseTitle: Record<string, string>;
  grade: string | null;
  subject: string | null;
  academicYear: number;
  teacher: {
    id: string;
    name: string;
    email: string;
  };
  weekday: number;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  timezone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  locationType: ClassLocationType;
  locationValue: string | null;
}

const DEFAULT_TIMEZONE = 'Asia/Colombo';

function toJson(value: { en: string; si: string; ta: string }): Prisma.InputJsonValue {
  return {
    en: value.en?.trim() || '',
    si: value.si?.trim() || value.en?.trim() || '',
    ta: value.ta?.trim() || value.en?.trim() || '',
  } as Prisma.InputJsonValue;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  if (
    !Number.isInteger(h) ||
    !Number.isInteger(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    throw new BadRequestException(`Invalid HH:mm time: ${hhmm}`);
  }
  return h * 60 + m;
}

export function assertValidTimeRange(start: string, end: string): void {
  const startMin = parseMinutes(start);
  const endMin = parseMinutes(end);
  if (startMin >= endMin) {
    throw new BadRequestException(
      'Schedule start time must be earlier than end time.',
    );
  }
}

export function assertValidTimezone(tz: string): string {
  const trimmed = (tz || DEFAULT_TIMEZONE).trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    throw new BadRequestException(`Invalid IANA timezone: ${trimmed}`);
  }
}

/**
 * Converts a local calendar date (YYYY-MM-DD) + HH:mm in a target IANA timezone
 * into a UTC Date instant without external timezone libraries.
 */
export function localDateTimeToUtc(
  ymd: string,
  hhmm: string,
  timeZone: string,
): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);

  // First guess: treat components as UTC
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(guessUtcMs));
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }
  const normalizedHour = map.hour === 24 ? 0 : map.hour;
  const zonedAsUtcMs = Date.UTC(
    map.year,
    (map.month || 1) - 1,
    map.day || 1,
    normalizedHour || 0,
    map.minute || 0,
    map.second || 0,
    0,
  );
  const offsetMs = zonedAsUtcMs - guessUtcMs;
  return new Date(guessUtcMs - offsetMs);
}

/** Formats a UTC Date into YYYY-MM-DD and weekday (0..6) in the target timezone. */
export function getZonedDateInfo(
  utcDate: Date,
  timeZone: string,
): { ymd: string; weekday: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(utcDate);
  let year = '';
  let month = '';
  let day = '';
  let wkShort = '';
  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
    if (p.type === 'weekday') wkShort = p.value;
  }
  const wkMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    ymd: `${year}-${month}-${day}`,
    weekday: wkMap[wkShort] ?? utcDate.getUTCDay(),
  };
}

function formatTeacherDisplayName(u: {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const full =
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
    u.name?.trim() ||
    u.email;
  return {
    id: u.id,
    name: full,
    email: u.email,
  };
}

export function normalizeInviteCode(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function hashInviteCode(raw: string): string {
  const normalized = normalizeInviteCode(raw);
  return createHash('sha256').update(normalized).digest('hex');
}

export function generateInviteCode(): {
  plaintext: string;
  tokenHash: string;
  codeHint: string;
} {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(8);
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += alphabet[bytes[i] % alphabet.length];
    part2 += alphabet[bytes[i + 4] % alphabet.length];
  }
  const plaintext = `KDM-${part1}-${part2}`;
  return {
    plaintext,
    tokenHash: hashInviteCode(plaintext),
    codeHint: `KDM-${part1}-••••`,
  };
}

const ALLOWED_ENROLLMENT_TRANSITIONS: Record<
  ClassEnrollmentStatus,
  ClassEnrollmentStatus[]
> = {
  [ClassEnrollmentStatus.INVITED]: [
    ClassEnrollmentStatus.ACTIVE,
    ClassEnrollmentStatus.PENDING,
    ClassEnrollmentStatus.REJECTED,
    ClassEnrollmentStatus.LEFT,
  ],
  [ClassEnrollmentStatus.PENDING]: [
    ClassEnrollmentStatus.ACTIVE,
    ClassEnrollmentStatus.REJECTED,
  ],
  [ClassEnrollmentStatus.ACTIVE]: [
    ClassEnrollmentStatus.SUSPENDED,
    ClassEnrollmentStatus.LEFT,
  ],
  [ClassEnrollmentStatus.SUSPENDED]: [
    ClassEnrollmentStatus.ACTIVE,
    ClassEnrollmentStatus.LEFT,
  ],
  [ClassEnrollmentStatus.REJECTED]: [
    ClassEnrollmentStatus.ACTIVE,
    ClassEnrollmentStatus.PENDING,
    ClassEnrollmentStatus.INVITED,
  ],
  [ClassEnrollmentStatus.LEFT]: [
    ClassEnrollmentStatus.ACTIVE,
    ClassEnrollmentStatus.INVITED,
  ],
};

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private isSuperAdmin(actor: RequestActor): boolean {
    return actor.role === Role.SUPER_ADMIN;
  }

  private async assertTeacherOrAdmin(actor: RequestActor): Promise<void> {
    if (this.isSuperAdmin(actor)) return;

    if (actor.team === 'Student') {
      throw new ForbiddenException(
        'Students cannot create or manage class batches.',
      );
    }

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
    const isTeacher =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.CUSTOMER_ADMIN ||
      user.team === 'Teacher' ||
      Boolean(user.teacherProfile) ||
      user.customRole?.name === 'Teacher' ||
      user.customRole?.name === 'Owner' ||
      user.customRole?.name === 'Admin';

    if (!isTeacher) {
      throw new ForbiddenException(
        'Only authorized teachers or administrators can manage classes.',
      );
    }
  }

  private async ensureCourseExists(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true },
    });
    if (!course) {
      throw new NotFoundException('Referenced course was not found.');
    }
    return course;
  }

  private validateDateBounds(
    startDate?: string | Date | null,
    endDate?: string | Date | null,
  ) {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid class start or end date.');
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'Class startDate must not be after endDate.',
      );
    }
  }

  private validateLocalizedTitle(title?: { en?: string; si?: string; ta?: string }) {
    if (!title || !title.en || title.en.trim().length < 2) {
      throw new BadRequestException(
        'Class title in English is required (minimum 2 characters).',
      );
    }
  }

  /**
   * Fetch a batch and verify the actor has teacher/admin write permission on it.
   */
  async requireWriteAccess(
    classId: string,
    actor: RequestActor,
    options?: { allowArchived?: boolean },
  ) {
    await this.assertTeacherOrAdmin(actor);

    const batch = await this.prisma.classBatch.findUnique({
      where: { id: classId },
      include: {
        teachers: true,
      },
    });
    if (!batch) {
      throw new NotFoundException('Class batch not found.');
    }

    if (!this.isSuperAdmin(actor)) {
      const isPrimary = batch.primaryTeacherId === actor.id;
      const coTeacher = batch.teachers.find((t) => t.teacherId === actor.id);
      const canWrite =
        isPrimary ||
        coTeacher?.permissionScope === ClassTeacherScope.OWNER ||
        coTeacher?.permissionScope === ClassTeacherScope.INSTRUCTOR;

      if (!canWrite) {
        throw new ForbiddenException(
          'You do not have permission to modify this class batch.',
        );
      }
    }

    if (!options?.allowArchived && batch.status === ClassBatchStatus.Archived) {
      throw new BadRequestException(
        'Archived class batches cannot be modified unless restored first.',
      );
    }

    return batch;
  }

  /**
   * Fetch a batch and verify the actor is an assigned teacher (including ASSISTANT) or Super Admin.
   * Students and unassigned teachers are rejected with 403 Forbidden.
   */
  async requireTeacherReadAccess(classId: string, actor: RequestActor) {
    await this.assertTeacherOrAdmin(actor);

    const batch = await this.prisma.classBatch.findUnique({
      where: { id: classId },
      include: {
        teachers: true,
      },
    });
    if (!batch) {
      throw new NotFoundException('Class batch not found.');
    }

    if (!this.isSuperAdmin(actor)) {
      const isPrimary = batch.primaryTeacherId === actor.id;
      const isCoTeacher = batch.teachers.some((t) => t.teacherId === actor.id);
      if (!isPrimary && !isCoTeacher) {
        throw new ForbiddenException(
          'You do not have permission to view this class roster or invitations.',
        );
      }
    }

    return batch;
  }

  async createClass(dto: CreateClassBatchDto, actor: RequestActor) {
    await this.assertTeacherOrAdmin(actor);
    this.validateLocalizedTitle(dto.title);
    this.validateDateBounds(dto.startDate, dto.endDate);
    await this.ensureCourseExists(dto.courseId);

    const primaryTeacherId =
      this.isSuperAdmin(actor) && dto.primaryTeacherId
        ? dto.primaryTeacherId
        : actor.id;

    const primaryTeacher = await this.prisma.user.findUnique({
      where: { id: primaryTeacherId },
      select: { id: true, workspaceId: true },
    });
    if (!primaryTeacher) {
      throw new BadRequestException('Assigned primary teacher was not found.');
    }

    const languages =
      dto.languages && dto.languages.length > 0
        ? Array.from(new Set(dto.languages))
        : [ContentLanguage.en];

    const coTeachers = (dto.coTeachers ?? []).filter(
      (ct) => ct.teacherId !== primaryTeacherId,
    );

    const created = await this.prisma.classBatch.create({
      data: {
        courseId: dto.courseId,
        workspaceId: primaryTeacher.workspaceId ?? actor.workspaceId ?? null,
        primaryTeacherId,
        title: toJson(dto.title),
        description: dto.description ? toJson(dto.description) : undefined,
        grade: dto.grade?.trim() || null,
        subject: dto.subject?.trim() || null,
        academicYear: dto.academicYear,
        languages,
        capacity: dto.capacity ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        status: dto.status ?? ClassBatchStatus.Draft,
        ...(coTeachers.length
          ? {
              teachers: {
                create: coTeachers.map((ct) => ({
                  teacherId: ct.teacherId,
                  permissionScope:
                    ct.permissionScope ?? ClassTeacherScope.INSTRUCTOR,
                })),
              },
            }
          : {}),
      },
      include: this.defaultBatchInclude(),
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: created.id,
      description: `Created class batch "${dto.title.en.trim()}"`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatBatchResponse(created);
  }

  async listClasses(query: ListClassBatchesQueryDto, actor: RequestActor) {
    await this.assertTeacherOrAdmin(actor);

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));

    const where: Prisma.ClassBatchWhereInput = {};

    if (!this.isSuperAdmin(actor)) {
      where.OR = [
        { primaryTeacherId: actor.id },
        { teachers: { some: { teacherId: actor.id } } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.courseId) {
      where.courseId = query.courseId;
    }
    if (query.academicYear) {
      where.academicYear = query.academicYear;
    }
    if (query.grade?.trim()) {
      where.grade = { contains: query.grade.trim(), mode: 'insensitive' };
    }
    if (query.subject?.trim()) {
      where.subject = { contains: query.subject.trim(), mode: 'insensitive' };
    }

    if (query.search?.trim()) {
      const matchIds = await findIdsByLocalizedTitle(
        this.prisma,
        'class_batches',
        query.search.trim(),
      );
      where.id = { in: matchIds ?? [] };
    }

    const [total, rows] = await Promise.all([
      this.prisma.classBatch.count({ where }),
      this.prisma.classBatch.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.defaultBatchInclude(),
      }),
    ]);

    return {
      items: rows.map((r) => this.formatBatchResponse(r)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getClassById(classId: string, actor: RequestActor) {
    const batch = await this.prisma.classBatch.findUnique({
      where: { id: classId },
      include: this.defaultBatchInclude(),
    });
    if (!batch) {
      throw new NotFoundException('Class batch not found.');
    }

    if (this.isSuperAdmin(actor)) {
      return this.formatBatchResponse(batch);
    }

    const isAssignedTeacher =
      batch.primaryTeacherId === actor.id ||
      batch.teachers.some((t) => t.teacherId === actor.id);

    if (isAssignedTeacher) {
      return this.formatBatchResponse(batch);
    }

    // Student check: must have an ACTIVE enrollment in this batch
    const enrollment = await this.prisma.classEnrollment.findUnique({
      where: {
        classId_studentId: {
          classId: batch.id,
          studentId: actor.id,
        },
      },
      select: { id: true, status: true, joinedAt: true },
    });

    if (
      !enrollment ||
      enrollment.status !== ClassEnrollmentStatus.ACTIVE ||
      batch.status === ClassBatchStatus.Draft
    ) {
      throw new ForbiddenException(
        'You do not have access to this class batch.',
      );
    }

    return {
      ...this.formatBatchResponse(batch),
      myEnrollment: enrollment,
    };
  }

  async updateClass(
    classId: string,
    dto: UpdateClassBatchDto,
    actor: RequestActor,
  ) {
    // Allow restoring an Archived class only when status is explicitly being changed from Archived
    const isRestoring =
      dto.status !== undefined && dto.status !== ClassBatchStatus.Archived;
    const existing = await this.requireWriteAccess(classId, actor, {
      allowArchived: isRestoring,
    });

    if (dto.title !== undefined) {
      this.validateLocalizedTitle(dto.title);
    }

    const nextStart =
      dto.startDate !== undefined
        ? dto.startDate
        : existing.startDate?.toISOString() ?? null;
    const nextEnd =
      dto.endDate !== undefined
        ? dto.endDate
        : existing.endDate?.toISOString() ?? null;
    this.validateDateBounds(nextStart, nextEnd);

    if (dto.courseId) {
      await this.ensureCourseExists(dto.courseId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.coTeachers !== undefined) {
        const cleanCoTeachers = dto.coTeachers.filter(
          (ct) => ct.teacherId !== existing.primaryTeacherId,
        );
        await tx.classTeacher.deleteMany({ where: { classId } });
        if (cleanCoTeachers.length) {
          await tx.classTeacher.createMany({
            data: cleanCoTeachers.map((ct) => ({
              classId,
              teacherId: ct.teacherId,
              permissionScope:
                ct.permissionScope ?? ClassTeacherScope.INSTRUCTOR,
            })),
          });
        }
      }

      return tx.classBatch.update({
        where: { id: classId },
        data: {
          ...(dto.courseId ? { courseId: dto.courseId } : {}),
          ...(dto.title ? { title: toJson(dto.title) } : {}),
          ...(dto.description !== undefined
            ? {
                description: dto.description
                  ? toJson(dto.description)
                  : Prisma.DbNull,
              }
            : {}),
          ...(dto.grade !== undefined
            ? { grade: dto.grade?.trim() || null }
            : {}),
          ...(dto.subject !== undefined
            ? { subject: dto.subject?.trim() || null }
            : {}),
          ...(dto.academicYear !== undefined
            ? { academicYear: dto.academicYear }
            : {}),
          ...(dto.languages !== undefined
            ? { languages: Array.from(new Set(dto.languages)) }
            : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          ...(dto.startDate !== undefined
            ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
            : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: this.defaultBatchInclude(),
      });
    });

    void this.auditService.log({
      action: AuditAction.UPDATE,
      subject: 'CLASSES',
      targetId: classId,
      description: `Updated class batch ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatBatchResponse(updated);
  }

  async archiveClass(classId: string, actor: RequestActor) {
    await this.requireWriteAccess(classId, actor, { allowArchived: true });

    const archived = await this.prisma.classBatch.update({
      where: { id: classId },
      data: { status: ClassBatchStatus.Archived },
      include: this.defaultBatchInclude(),
    });

    void this.auditService.log({
      action: AuditAction.CHANGE_STATUS,
      subject: 'CLASSES',
      targetId: classId,
      description: `Archived class batch ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatBatchResponse(archived);
  }

  /**
   * Duplicates a class batch's configuration and schedules (never students or payments).
   */
  async duplicateClass(classId: string, actor: RequestActor) {
    await this.requireWriteAccess(classId, actor, { allowArchived: true });

    const source = await this.prisma.classBatch.findUnique({
      where: { id: classId },
      include: {
        teachers: true,
        schedules: true,
      },
    });
    if (!source) {
      throw new NotFoundException('Source class batch not found.');
    }

    const rawTitle = (source.title ?? {}) as Record<string, string>;
    const copyTitle = {
      en: `${rawTitle.en || 'Untitled Class'} (Copy)`,
      si: rawTitle.si ? `${rawTitle.si} (පිටපත)` : `${rawTitle.en || 'Untitled'} (Copy)`,
      ta: rawTitle.ta ? `${rawTitle.ta} (நகல்)` : `${rawTitle.en || 'Untitled'} (Copy)`,
    };

    const duplicated = await this.prisma.classBatch.create({
      data: {
        courseId: source.courseId,
        workspaceId: source.workspaceId,
        primaryTeacherId: source.primaryTeacherId,
        title: copyTitle as Prisma.InputJsonValue,
        description: source.description ?? undefined,
        grade: source.grade,
        subject: source.subject,
        academicYear: source.academicYear,
        languages: source.languages,
        capacity: source.capacity,
        startDate: source.startDate,
        endDate: source.endDate,
        status: ClassBatchStatus.Draft,
        ...(source.teachers.length
          ? {
              teachers: {
                create: source.teachers.map((t) => ({
                  teacherId: t.teacherId,
                  permissionScope: t.permissionScope,
                })),
              },
            }
          : {}),
        ...(source.schedules.length
          ? {
              schedules: {
                create: source.schedules.map((s) => ({
                  weekday: s.weekday,
                  localStartTime: s.localStartTime,
                  localEndTime: s.localEndTime,
                  timezone: s.timezone,
                  locationType: s.locationType,
                  locationValue: s.locationValue,
                  effectiveFrom: s.effectiveFrom,
                  effectiveTo: s.effectiveTo,
                  createdById: actor.id,
                  updatedById: actor.id,
                })),
              },
            }
          : {}),
      },
      include: this.defaultBatchInclude(),
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: duplicated.id,
      description: `Duplicated class batch from ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatBatchResponse(duplicated);
  }

  // ==========================================================================
  // Schedules CRUD
  // ==========================================================================

  private async assertNoOverlappingSchedule(params: {
    classId: string;
    weekday: number;
    localStartTime: string;
    localEndTime: string;
    excludeScheduleId?: string;
  }) {
    const startMin = parseMinutes(params.localStartTime);
    const endMin = parseMinutes(params.localEndTime);

    const existingSlots = await this.prisma.classSchedule.findMany({
      where: {
        classId: params.classId,
        weekday: params.weekday,
        ...(params.excludeScheduleId
          ? { id: { not: params.excludeScheduleId } }
          : {}),
      },
    });

    for (const slot of existingSlots) {
      const slotStart = parseMinutes(slot.localStartTime);
      const slotEnd = parseMinutes(slot.localEndTime);
      if (startMin < slotEnd && endMin > slotStart) {
        throw new ConflictException(
          `Schedule overlaps with existing slot on weekday ${params.weekday} (${slot.localStartTime}–${slot.localEndTime}).`,
        );
      }
    }
  }

  async addSchedule(
    classId: string,
    dto: CreateClassScheduleDto,
    actor: RequestActor,
  ) {
    await this.requireWriteAccess(classId, actor);
    assertValidTimeRange(dto.localStartTime, dto.localEndTime);
    const timezone = assertValidTimezone(dto.timezone || DEFAULT_TIMEZONE);
    this.validateDateBounds(dto.effectiveFrom, dto.effectiveTo);

    await this.assertNoOverlappingSchedule({
      classId,
      weekday: dto.weekday,
      localStartTime: dto.localStartTime,
      localEndTime: dto.localEndTime,
    });

    const created = await this.prisma.classSchedule.create({
      data: {
        classId,
        weekday: dto.weekday,
        localStartTime: dto.localStartTime,
        localEndTime: dto.localEndTime,
        timezone,
        locationType: dto.locationType ?? ClassLocationType.ONLINE,
        locationValue: dto.locationValue?.trim() || null,
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: created.id,
      description: `Added schedule slot (weekday ${dto.weekday} ${dto.localStartTime}-${dto.localEndTime}) to class ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return created;
  }

  async listSchedules(classId: string, actor: RequestActor) {
    // Verify read access through getClassById
    await this.getClassById(classId, actor);

    return this.prisma.classSchedule.findMany({
      where: { classId },
      orderBy: [{ weekday: 'asc' }, { localStartTime: 'asc' }],
    });
  }

  async updateSchedule(
    classId: string,
    scheduleId: string,
    dto: UpdateClassScheduleDto,
    actor: RequestActor,
  ) {
    await this.requireWriteAccess(classId, actor);

    const existing = await this.prisma.classSchedule.findFirst({
      where: { id: scheduleId, classId },
    });
    if (!existing) {
      throw new NotFoundException('Schedule slot not found for this class.');
    }

    const nextWeekday = dto.weekday ?? existing.weekday;
    const nextStart = dto.localStartTime ?? existing.localStartTime;
    const nextEnd = dto.localEndTime ?? existing.localEndTime;
    const nextTimezone =
      dto.timezone !== undefined
        ? assertValidTimezone(dto.timezone)
        : existing.timezone;

    assertValidTimeRange(nextStart, nextEnd);

    const nextEffectiveFrom =
      dto.effectiveFrom !== undefined
        ? new Date(dto.effectiveFrom)
        : existing.effectiveFrom;
    const nextEffectiveTo =
      dto.effectiveTo !== undefined
        ? dto.effectiveTo
          ? new Date(dto.effectiveTo)
          : null
        : existing.effectiveTo;

    this.validateDateBounds(nextEffectiveFrom, nextEffectiveTo);

    await this.assertNoOverlappingSchedule({
      classId,
      weekday: nextWeekday,
      localStartTime: nextStart,
      localEndTime: nextEnd,
      excludeScheduleId: scheduleId,
    });

    const updated = await this.prisma.classSchedule.update({
      where: { id: scheduleId },
      data: {
        weekday: nextWeekday,
        localStartTime: nextStart,
        localEndTime: nextEnd,
        timezone: nextTimezone,
        ...(dto.locationType !== undefined
          ? { locationType: dto.locationType }
          : {}),
        ...(dto.locationValue !== undefined
          ? { locationValue: dto.locationValue?.trim() || null }
          : {}),
        effectiveFrom: nextEffectiveFrom,
        effectiveTo: nextEffectiveTo,
        updatedById: actor.id,
      },
    });

    void this.auditService.log({
      action: AuditAction.UPDATE,
      subject: 'CLASSES',
      targetId: scheduleId,
      description: `Updated schedule slot ${scheduleId} on class ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return updated;
  }

  async removeSchedule(
    classId: string,
    scheduleId: string,
    actor: RequestActor,
  ) {
    await this.requireWriteAccess(classId, actor);

    const existing = await this.prisma.classSchedule.findFirst({
      where: { id: scheduleId, classId },
    });
    if (!existing) {
      throw new NotFoundException('Schedule slot not found for this class.');
    }

    await this.prisma.classSchedule.delete({ where: { id: scheduleId } });

    void this.auditService.log({
      action: AuditAction.DELETE,
      subject: 'CLASSES',
      targetId: scheduleId,
      description: `Removed schedule slot ${scheduleId} from class ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return { deleted: true, id: scheduleId };
  }

  // ==========================================================================
  // PHASE 2 — Invitations, Student Join, Roster & Enrollment Lifecycle
  // ==========================================================================

  async createInvitation(
    classId: string,
    dto: CreateClassInvitationDto,
    actor: RequestActor,
  ) {
    const batch = await this.requireWriteAccess(classId, actor);

    const now = new Date();
    const hours = dto.expiresInHours ?? 168; // default 7 days
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(now.getTime() + hours * 60 * 60 * 1000);

    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(
        'Invitation expiry date must be in the future.',
      );
    }

    const { plaintext, tokenHash, codeHint } = generateInviteCode();

    const created = await this.prisma.classInvitation.create({
      data: {
        classId: batch.id,
        tokenHash,
        codeHint,
        label: dto.label?.trim() || null,
        requiresApproval: dto.requiresApproval ?? true,
        expiresAt,
        maxUses: dto.maxUses ?? null,
        createdById: actor.id,
      },
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: created.id,
      description: `Created class invitation (${codeHint}) for class ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    // Return plaintext code ONLY once at creation
    return {
      id: created.id,
      classId: created.classId,
      code: plaintext,
      codeHint: created.codeHint,
      label: created.label,
      requiresApproval: created.requiresApproval,
      expiresAt: created.expiresAt,
      maxUses: created.maxUses,
      usedCount: created.usedCount,
      revokedAt: created.revokedAt,
      createdAt: created.createdAt,
    };
  }

  async listInvitations(classId: string, actor: RequestActor) {
    await this.requireTeacherReadAccess(classId, actor);

    const rows = await this.prisma.classInvitation.findMany({
      where: { classId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Never return tokenHash or plaintext token on read
    return rows.map((inv) => ({
      id: inv.id,
      classId: inv.classId,
      codeHint: inv.codeHint,
      label: inv.label,
      requiresApproval: inv.requiresApproval,
      expiresAt: inv.expiresAt,
      maxUses: inv.maxUses,
      usedCount: inv.usedCount,
      revokedAt: inv.revokedAt,
      createdAt: inv.createdAt,
      createdBy: formatTeacherDisplayName(inv.createdBy),
    }));
  }

  async revokeInvitation(
    classId: string,
    invitationId: string,
    actor: RequestActor,
  ) {
    await this.requireWriteAccess(classId, actor, { allowArchived: true });

    const existing = await this.prisma.classInvitation.findFirst({
      where: { id: invitationId, classId },
    });
    if (!existing) {
      throw new NotFoundException('Invitation not found for this class.');
    }

    const revoked = await this.prisma.classInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: existing.revokedAt ?? new Date() },
    });

    void this.auditService.log({
      action: AuditAction.CHANGE_STATUS,
      subject: 'CLASSES',
      targetId: invitationId,
      description: `Revoked class invitation ${existing.codeHint} on class ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return {
      id: revoked.id,
      classId: revoked.classId,
      codeHint: revoked.codeHint,
      revokedAt: revoked.revokedAt,
    };
  }

  private generateDefaultStudentCode(academicYear: number, studentId: string) {
    const suffix = studentId.replace(/-/g, '').slice(0, 6).toUpperCase();
    return `STU-${academicYear}-${suffix}`;
  }

  private formatEnrollmentRow(row: any) {
    const s = row.student;
    const fullName =
      [s?.firstName, s?.lastName].filter(Boolean).join(' ').trim() ||
      s?.name?.trim() ||
      s?.email ||
      'Student';

    return {
      id: row.id,
      classId: row.classId,
      studentId: row.studentId,
      status: row.status as ClassEnrollmentStatus,
      studentCode:
        row.studentCode ||
        (row.classBatch?.academicYear
          ? this.generateDefaultStudentCode(
              row.classBatch.academicYear,
              row.studentId,
            )
          : `STU-${row.studentId.slice(0, 6).toUpperCase()}`),
      note: row.note ?? null,
      joinedAt: row.joinedAt,
      endedAt: row.endedAt,
      approvedAt: row.approvedAt,
      approvedBy: row.approvedBy
        ? formatTeacherDisplayName(row.approvedBy)
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      student: s
        ? {
            id: s.id,
            name: fullName,
            email: s.email,
            phoneNumber: s.phoneNumber ?? null,
            status: s.status,
          }
        : null,
    };
  }

  async joinClassByCode(dto: JoinClassByCodeDto, actor: RequestActor) {
    const tokenHash = hashInviteCode(dto.code);
    const invitation = await this.prisma.classInvitation.findUnique({
      where: { tokenHash },
      include: {
        classBatch: {
          include: {
            teachers: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid class invitation code.');
    }
    if (invitation.revokedAt) {
      throw new BadRequestException('This invitation code has been revoked.');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This invitation code has expired.');
    }
    if (
      invitation.maxUses !== null &&
      invitation.usedCount >= invitation.maxUses
    ) {
      throw new BadRequestException(
        'This invitation code has reached its maximum usage limit.',
      );
    }

    const batch = invitation.classBatch;
    if (batch.status !== ClassBatchStatus.Published) {
      throw new BadRequestException(
        'This class is not currently open for student enrollment.',
      );
    }

    const isTeacherOfClass =
      batch.primaryTeacherId === actor.id ||
      batch.teachers.some((t) => t.teacherId === actor.id);
    if (isTeacherOfClass) {
      throw new BadRequestException(
        'Teachers assigned to this class cannot enroll as students.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.classEnrollment.findUnique({
        where: {
          classId_studentId: {
            classId: batch.id,
            studentId: actor.id,
          },
        },
      });

      if (existing) {
        if (existing.status === ClassEnrollmentStatus.ACTIVE) {
          throw new ConflictException(
            'You are already actively enrolled in this class.',
          );
        }
        if (existing.status === ClassEnrollmentStatus.PENDING) {
          throw new ConflictException(
            'Your request to join this class is already pending teacher approval.',
          );
        }
        if (existing.status === ClassEnrollmentStatus.SUSPENDED) {
          throw new ForbiddenException(
            'Your enrollment in this class is suspended. Please contact your teacher.',
          );
        }
      }

      const targetStatus = invitation.requiresApproval
        ? ClassEnrollmentStatus.PENDING
        : ClassEnrollmentStatus.ACTIVE;

      if (
        targetStatus === ClassEnrollmentStatus.ACTIVE &&
        batch.capacity !== null
      ) {
        const activeCount = await tx.classEnrollment.count({
          where: {
            classId: batch.id,
            status: ClassEnrollmentStatus.ACTIVE,
          },
        });
        if (activeCount >= batch.capacity) {
          throw new ConflictException(
            'This class has reached its maximum seat capacity.',
          );
        }
      }

      const usageUpdate = await tx.classInvitation.updateMany({
        where: {
          id: invitation.id,
          revokedAt: null,
          ...(invitation.maxUses !== null
            ? { usedCount: { lt: invitation.maxUses } }
            : {}),
        },
        data: {
          usedCount: { increment: 1 },
        },
      });

      if (usageUpdate.count === 0) {
        throw new ConflictException(
          'This invitation code is no longer available.',
        );
      }

      const now = new Date();
      const studentCode =
        existing?.studentCode ||
        this.generateDefaultStudentCode(batch.academicYear, actor.id);

      const enrollment = existing
        ? await tx.classEnrollment.update({
            where: { id: existing.id },
            data: {
              status: targetStatus,
              invitationId: invitation.id,
              studentCode,
              joinedAt: now,
              endedAt: null,
              approvedAt:
                targetStatus === ClassEnrollmentStatus.ACTIVE ? now : null,
              approvedById: null,
            },
            include: {
              student: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  firstName: true,
                  lastName: true,
                  phoneNumber: true,
                  status: true,
                },
              },
            },
          })
        : await tx.classEnrollment.create({
            data: {
              classId: batch.id,
              studentId: actor.id,
              status: targetStatus,
              invitationId: invitation.id,
              studentCode,
              joinedAt: now,
              approvedAt:
                targetStatus === ClassEnrollmentStatus.ACTIVE ? now : null,
            },
            include: {
              student: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  firstName: true,
                  lastName: true,
                  phoneNumber: true,
                  status: true,
                },
              },
            },
          });

      return enrollment;
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: result.id,
      description: `Student ${actor.id} joined class ${batch.id} via invitation (${invitation.codeHint}) with status ${result.status}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return {
      ...this.formatEnrollmentRow({ ...result, classBatch: batch }),
      classTitle: batch.title,
    };
  }

  async enrollStudent(
    classId: string,
    dto: CreateClassEnrollmentDto,
    actor: RequestActor,
  ) {
    const batch = await this.requireWriteAccess(classId, actor);

    if (!dto.studentId && !dto.email?.trim()) {
      throw new BadRequestException(
        'Either studentId or student email is required.',
      );
    }

    const student = dto.studentId
      ? await this.prisma.user.findUnique({ where: { id: dto.studentId } })
      : await this.prisma.user.findFirst({
          where: {
            email: {
              equals: dto.email!.trim(),
              mode: 'insensitive',
            },
          },
        });

    if (!student) {
      throw new NotFoundException(
        'No existing student account found matching the provided identifier.',
      );
    }

    // Tenant / workspace isolation check
    if (
      !this.isSuperAdmin(actor) &&
      batch.workspaceId &&
      student.workspaceId &&
      batch.workspaceId !== student.workspaceId
    ) {
      throw new ForbiddenException(
        'Cannot enroll a user belonging to a different workspace/tenant.',
      );
    }

    if (
      batch.primaryTeacherId === student.id ||
      batch.teachers.some((t) => t.teacherId === student.id)
    ) {
      throw new BadRequestException(
        'Assigned teachers of this class cannot be enrolled as students.',
      );
    }

    const targetStatus = dto.status ?? ClassEnrollmentStatus.ACTIVE;
    if (
      targetStatus !== ClassEnrollmentStatus.ACTIVE &&
      targetStatus !== ClassEnrollmentStatus.INVITED
    ) {
      throw new BadRequestException(
        'Teachers can add students with initial status ACTIVE or INVITED only.',
      );
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.classEnrollment.findUnique({
        where: {
          classId_studentId: {
            classId: batch.id,
            studentId: student.id,
          },
        },
      });

      if (
        existing &&
        (existing.status === ClassEnrollmentStatus.ACTIVE ||
          existing.status === ClassEnrollmentStatus.PENDING ||
          existing.status === ClassEnrollmentStatus.INVITED)
      ) {
        throw new ConflictException(
          `Student already has an enrollment in this class with status ${existing.status}.`,
        );
      }

      if (
        targetStatus === ClassEnrollmentStatus.ACTIVE &&
        batch.capacity !== null
      ) {
        const activeCount = await tx.classEnrollment.count({
          where: {
            classId: batch.id,
            status: ClassEnrollmentStatus.ACTIVE,
          },
        });
        if (activeCount >= batch.capacity) {
          throw new ConflictException(
            'Class batch has reached its maximum seat capacity.',
          );
        }
      }

      const now = new Date();
      const studentCode =
        dto.studentCode?.trim() ||
        existing?.studentCode ||
        this.generateDefaultStudentCode(batch.academicYear, student.id);

      if (existing) {
        return tx.classEnrollment.update({
          where: { id: existing.id },
          data: {
            status: targetStatus,
            studentCode,
            note: dto.note?.trim() || null,
            joinedAt: now,
            endedAt: null,
            approvedById:
              targetStatus === ClassEnrollmentStatus.ACTIVE ? actor.id : null,
            approvedAt:
              targetStatus === ClassEnrollmentStatus.ACTIVE ? now : null,
          },
          include: {
            student: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
                phoneNumber: true,
                status: true,
              },
            },
            approvedBy: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });
      }

      return tx.classEnrollment.create({
        data: {
          classId: batch.id,
          studentId: student.id,
          status: targetStatus,
          studentCode,
          note: dto.note?.trim() || null,
          joinedAt: now,
          approvedById:
            targetStatus === ClassEnrollmentStatus.ACTIVE ? actor.id : null,
          approvedAt:
            targetStatus === ClassEnrollmentStatus.ACTIVE ? now : null,
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              status: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: saved.id,
      description: `Added student ${student.email} to class ${classId} (${targetStatus})`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatEnrollmentRow({ ...saved, classBatch: batch });
  }

  async listEnrollments(
    classId: string,
    query: ListClassEnrollmentsQueryDto,
    actor: RequestActor,
  ) {
    const batch = await this.requireTeacherReadAccess(classId, actor);

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.ClassEnrollmentWhereInput = {
      classId: batch.id,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { studentCode: { contains: term, mode: 'insensitive' } },
        { student: { email: { contains: term, mode: 'insensitive' } } },
        { student: { name: { contains: term, mode: 'insensitive' } } },
        { student: { firstName: { contains: term, mode: 'insensitive' } } },
        { student: { lastName: { contains: term, mode: 'insensitive' } } },
        { student: { phoneNumber: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, rows, groupedCounts] = await Promise.all([
      this.prisma.classEnrollment.count({ where }),
      this.prisma.classEnrollment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              status: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.classEnrollment.groupBy({
        by: ['status'],
        where: { classId: batch.id },
        _count: { _all: true },
      }),
    ]);

    const summary: Record<ClassEnrollmentStatus, number> = {
      [ClassEnrollmentStatus.ACTIVE]: 0,
      [ClassEnrollmentStatus.PENDING]: 0,
      [ClassEnrollmentStatus.INVITED]: 0,
      [ClassEnrollmentStatus.SUSPENDED]: 0,
      [ClassEnrollmentStatus.LEFT]: 0,
      [ClassEnrollmentStatus.REJECTED]: 0,
    };

    for (const grp of groupedCounts) {
      summary[grp.status] = grp._count._all;
    }

    return {
      items: rows.map((r) =>
        this.formatEnrollmentRow({ ...r, classBatch: batch }),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      capacity: batch.capacity,
      summary,
    };
  }

  async updateEnrollment(
    classId: string,
    enrollmentId: string,
    dto: UpdateClassEnrollmentDto,
    actor: RequestActor,
  ) {
    const batch = await this.requireWriteAccess(classId, actor);

    const existing = await this.prisma.classEnrollment.findFirst({
      where: { id: enrollmentId, classId: batch.id },
    });
    if (!existing) {
      throw new NotFoundException('Enrollment record not found for this class.');
    }

    const nextStatus = dto.status ?? existing.status;

    if (dto.status && dto.status !== existing.status) {
      const allowed = ALLOWED_ENROLLMENT_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition enrollment from ${existing.status} to ${dto.status}.`,
        );
      }
    }

    const transitioningToActive =
      nextStatus === ClassEnrollmentStatus.ACTIVE &&
      existing.status !== ClassEnrollmentStatus.ACTIVE;

    const transitioningToEnded =
      (nextStatus === ClassEnrollmentStatus.LEFT ||
        nextStatus === ClassEnrollmentStatus.REJECTED ||
        nextStatus === ClassEnrollmentStatus.SUSPENDED) &&
      existing.status !== nextStatus;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (transitioningToActive && batch.capacity !== null) {
        const activeCount = await tx.classEnrollment.count({
          where: {
            classId: batch.id,
            status: ClassEnrollmentStatus.ACTIVE,
          },
        });
        if (activeCount >= batch.capacity) {
          throw new ConflictException(
            'Cannot approve/activate student: class batch has reached its maximum seat capacity.',
          );
        }
      }

      const now = new Date();
      return tx.classEnrollment.update({
        where: { id: enrollmentId },
        data: {
          status: nextStatus,
          ...(dto.studentCode !== undefined
            ? { studentCode: dto.studentCode?.trim() || null }
            : {}),
          ...(dto.note !== undefined
            ? { note: dto.note?.trim() || null }
            : {}),
          ...(transitioningToActive
            ? {
                approvedById: actor.id,
                approvedAt: now,
                endedAt: null,
              }
            : {}),
          ...(transitioningToEnded ? { endedAt: now } : {}),
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              status: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    });

    void this.auditService.log({
      action:
        dto.status && dto.status !== existing.status
          ? AuditAction.CHANGE_STATUS
          : AuditAction.UPDATE,
      subject: 'CLASSES',
      targetId: enrollmentId,
      description: `Updated enrollment ${enrollmentId} on class ${classId} (${existing.status} -> ${nextStatus})`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.formatEnrollmentRow({ ...updated, classBatch: batch });
  }

  async respondToStudentEnrollment(
    classId: string,
    dto: StudentRespondEnrollmentDto,
    actor: RequestActor,
  ) {
    const enrollment = await this.prisma.classEnrollment.findUnique({
      where: {
        classId_studentId: {
          classId,
          studentId: actor.id,
        },
      },
      include: {
        classBatch: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException('You do not have an enrollment in this class.');
    }

    const batch = enrollment.classBatch;
    if (batch.status === ClassBatchStatus.Archived) {
      throw new BadRequestException('Cannot modify enrollment on an archived class.');
    }

    if (dto.action === 'ACCEPT') {
      if (enrollment.status !== ClassEnrollmentStatus.INVITED) {
        throw new BadRequestException(
          'Only INVITED enrollments can be accepted.',
        );
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        if (batch.capacity !== null) {
          const activeCount = await tx.classEnrollment.count({
            where: {
              classId: batch.id,
              status: ClassEnrollmentStatus.ACTIVE,
            },
          });
          if (activeCount >= batch.capacity) {
            throw new ConflictException(
              'This class has reached its maximum seat capacity.',
            );
          }
        }

        const now = new Date();
        return tx.classEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: ClassEnrollmentStatus.ACTIVE,
            joinedAt: now,
            approvedAt: now,
            endedAt: null,
          },
        });
      });

      void this.auditService.log({
        action: AuditAction.CHANGE_STATUS,
        subject: 'CLASSES',
        targetId: enrollment.id,
        description: `Student ${actor.id} accepted invitation to class ${classId}`,
        actor: { id: actor.id, email: actor.email, role: String(actor.role) },
      });

      return updated;
    }

    if (dto.action === 'DECLINE') {
      if (enrollment.status !== ClassEnrollmentStatus.INVITED) {
        throw new BadRequestException(
          'Only INVITED enrollments can be declined.',
        );
      }
      const updated = await this.prisma.classEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: ClassEnrollmentStatus.REJECTED,
          endedAt: new Date(),
        },
      });
      return updated;
    }

    // dto.action === 'LEAVE'
    if (
      enrollment.status !== ClassEnrollmentStatus.ACTIVE &&
      enrollment.status !== ClassEnrollmentStatus.PENDING &&
      enrollment.status !== ClassEnrollmentStatus.INVITED
    ) {
      throw new BadRequestException(
        `Cannot leave a class when enrollment status is ${enrollment.status}.`,
      );
    }

    const updated = await this.prisma.classEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: ClassEnrollmentStatus.LEFT,
        endedAt: new Date(),
      },
    });

    void this.auditService.log({
      action: AuditAction.CHANGE_STATUS,
      subject: 'CLASSES',
      targetId: enrollment.id,
      description: `Student ${actor.id} left class ${classId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return updated;
  }

  // ==========================================================================
  // Student Classes & Timetable
  // ==========================================================================

  async listStudentClasses(actor: RequestActor) {
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        studentId: actor.id,
        status: {
          in: [
            ClassEnrollmentStatus.ACTIVE,
            ClassEnrollmentStatus.PENDING,
            ClassEnrollmentStatus.INVITED,
            ClassEnrollmentStatus.SUSPENDED,
          ],
        },
        classBatch: {
          status: {
            in: [ClassBatchStatus.Published, ClassBatchStatus.Archived],
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      include: {
        classBatch: {
          include: this.defaultBatchInclude(),
        },
      },
    });

    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    return enrollments.map((enrollment) => {
      const formatted = this.formatBatchResponse(enrollment.classBatch);
      const isActive = enrollment.status === ClassEnrollmentStatus.ACTIVE;
      const upcoming = isActive
        ? this.expandOccurrencesForBatch(
            enrollment.classBatch,
            now,
            twoWeeksLater,
          )
        : [];
      return {
        ...formatted,
        schedules: isActive ? formatted.schedules : [],
        enrollment: {
          id: enrollment.id,
          status: enrollment.status,
          studentCode:
            enrollment.studentCode ||
            this.generateDefaultStudentCode(
              enrollment.classBatch.academicYear,
              enrollment.studentId,
            ),
          joinedAt: enrollment.joinedAt,
        },
        nextSession: upcoming[0] ?? null,
      };
    });
  }

  async getStudentTimetable(
    actor: RequestActor,
    query: StudentTimetableQueryDto,
  ): Promise<{
    from: string;
    to: string;
    occurrences: TimetableOccurrence[];
  }> {
    const now = new Date();
    const fromDate = query.from ? new Date(query.from) : now;
    const defaultTo = new Date(fromDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const toDate = query.to ? new Date(query.to) : defaultTo;

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid from or to date query parameter.');
    }
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('"from" date must not be after "to" date.');
    }

    // Cap range at 90 days to prevent unbounded expansion
    const maxSpanMs = 90 * 24 * 60 * 60 * 1000;
    const clampedTo =
      toDate.getTime() - fromDate.getTime() > maxSpanMs
        ? new Date(fromDate.getTime() + maxSpanMs)
        : toDate;

    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        studentId: actor.id,
        status: ClassEnrollmentStatus.ACTIVE,
        classBatch: {
          status: ClassBatchStatus.Published,
        },
      },
      include: {
        classBatch: {
          include: this.defaultBatchInclude(),
        },
      },
    });

    const occurrences: TimetableOccurrence[] = [];
    for (const enrollment of enrollments) {
      const batchOccurrences = this.expandOccurrencesForBatch(
        enrollment.classBatch,
        fromDate,
        clampedTo,
      );
      occurrences.push(...batchOccurrences);
    }

    occurrences.sort(
      (a, b) =>
        new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
    );

    return {
      from: fromDate.toISOString(),
      to: clampedTo.toISOString(),
      occurrences,
    };
  }

  public expandOccurrencesForBatch(
    batch: {
      id: string;
      title: Prisma.JsonValue;
      courseId: string;
      grade: string | null;
      subject: string | null;
      academicYear: number;
      startDate: Date | null;
      endDate: Date | null;
      course: { id: string; title: Prisma.JsonValue };
      primaryTeacher: {
        id: string;
        email: string;
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      };
      schedules: Array<{
        id: string;
        weekday: number;
        localStartTime: string;
        localEndTime: string;
        timezone: string;
        locationType: ClassLocationType;
        locationValue: string | null;
        effectiveFrom: Date;
        effectiveTo: Date | null;
      }>;
    },
    fromUtc: Date,
    toUtc: Date,
  ): TimetableOccurrence[] {
    const results: TimetableOccurrence[] = [];
    if (!batch.schedules?.length) return results;

    // Walk day-by-day from (fromUtc - 1 day) to (toUtc + 1 day) to cover timezone boundaries
    const cursorStartMs = fromUtc.getTime() - 24 * 60 * 60 * 1000;
    const cursorEndMs = toUtc.getTime() + 24 * 60 * 60 * 1000;
    const dayStepMs = 24 * 60 * 60 * 1000;

    const seenKeys = new Set<string>();

    for (const schedule of batch.schedules) {
      const tz = schedule.timezone || DEFAULT_TIMEZONE;

      for (let ms = cursorStartMs; ms <= cursorEndMs; ms += dayStepMs) {
        const probe = new Date(ms);
        const { ymd, weekday } = getZonedDateInfo(probe, tz);
        if (weekday !== schedule.weekday) continue;

        const occurrenceKey = `${schedule.id}:${ymd}`;
        if (seenKeys.has(occurrenceKey)) continue;
        seenKeys.add(occurrenceKey);

        const startsAt = localDateTimeToUtc(ymd, schedule.localStartTime, tz);
        const endsAt = localDateTimeToUtc(ymd, schedule.localEndTime, tz);

        if (endsAt.getTime() < fromUtc.getTime()) continue;
        if (startsAt.getTime() > toUtc.getTime()) continue;

        // Check batch startDate / endDate
        if (
          batch.startDate &&
          endsAt.getTime() < batch.startDate.getTime()
        ) {
          continue;
        }
        if (batch.endDate && startsAt.getTime() > batch.endDate.getTime()) {
          continue;
        }

        // Check schedule effectiveFrom / effectiveTo
        if (
          schedule.effectiveFrom &&
          endsAt.getTime() < schedule.effectiveFrom.getTime()
        ) {
          continue;
        }
        if (
          schedule.effectiveTo &&
          startsAt.getTime() > schedule.effectiveTo.getTime()
        ) {
          continue;
        }

        results.push({
          occurrenceKey,
          scheduleId: schedule.id,
          classId: batch.id,
          classTitle: (batch.title ?? { en: '' }) as Record<string, string>,
          courseId: batch.course.id,
          courseTitle: (batch.course.title ?? { en: '' }) as Record<
            string,
            string
          >,
          grade: batch.grade,
          subject: batch.subject,
          academicYear: batch.academicYear,
          teacher: formatTeacherDisplayName(batch.primaryTeacher),
          weekday: schedule.weekday,
          localDate: ymd,
          localStartTime: schedule.localStartTime,
          localEndTime: schedule.localEndTime,
          timezone: tz,
          startsAtUtc: startsAt.toISOString(),
          endsAtUtc: endsAt.toISOString(),
          locationType: schedule.locationType,
          locationValue: schedule.locationValue,
        });
      }
    }

    results.sort(
      (a, b) =>
        new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
    );
    return results;
  }

  private defaultBatchInclude() {
    return {
      course: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      primaryTeacher: {
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
        },
      },
      teachers: {
        include: {
          teacher: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      schedules: {
        orderBy: [
          { weekday: 'asc' as const },
          { localStartTime: 'asc' as const },
        ],
      },
      _count: {
        select: {
          enrollments: {
            where: { status: ClassEnrollmentStatus.ACTIVE },
          },
          schedules: true,
        },
      },
    };
  }

  private formatBatchResponse(batch: any) {
    return {
      id: batch.id,
      courseId: batch.courseId,
      course: batch.course,
      workspaceId: batch.workspaceId,
      primaryTeacherId: batch.primaryTeacherId,
      primaryTeacher: formatTeacherDisplayName(batch.primaryTeacher),
      coTeachers: (batch.teachers ?? []).map((t: any) => ({
        id: t.id,
        teacherId: t.teacherId,
        permissionScope: t.permissionScope,
        teacher: formatTeacherDisplayName(t.teacher),
      })),
      title: batch.title,
      description: batch.description,
      grade: batch.grade,
      subject: batch.subject,
      academicYear: batch.academicYear,
      languages: batch.languages,
      capacity: batch.capacity,
      startDate: batch.startDate,
      endDate: batch.endDate,
      status: batch.status,
      schedules: batch.schedules ?? [],
      activeEnrollmentCount: batch._count?.enrollments ?? 0,
      scheduleCount: batch._count?.schedules ?? batch.schedules?.length ?? 0,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }

  // ==========================================================================
  // PHASE 7 — Integrated Teacher, Admin & Student Classroom LMS Summaries
  // ==========================================================================

  async getClassroomDashboardSummary(
    actor: RequestActor,
    query?: { teacherUserId?: string; period?: string },
  ) {
    await this.assertTeacherOrAdmin(actor);

    const isSuperAdmin = this.isSuperAdmin(actor);
    const now = new Date();
    const { ymd: todayYmd } = getZonedDateInfo(now, DEFAULT_TIMEZONE);
    const periodYyyyMm =
      query?.period && /^\d{4}-\d{2}$/.test(query.period.trim())
        ? query.period.trim()
        : todayYmd.slice(0, 7);

    const targetTeacherId =
      isSuperAdmin && query?.teacherUserId?.trim()
        ? query.teacherUserId.trim()
        : !isSuperAdmin
          ? actor.id
          : null;

    const batchWhere: Prisma.ClassBatchWhereInput = targetTeacherId
      ? {
          OR: [
            { primaryTeacherId: targetTeacherId },
            { teachers: { some: { teacherId: targetTeacherId } } },
          ],
        }
      : {};

    const batches = await this.prisma.classBatch.findMany({
      where: batchWhere,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: this.defaultBatchInclude(),
    });

    const classIds = batches.map((b) => b.id);
    const activeClassesCount = batches.filter(
      (b) => b.status === ClassBatchStatus.Published,
    ).length;
    const totalClassesCount = batches.length;

    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const todayStartUtc = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayEndUtc = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Expand recurring occurrences for today across published batches
    const todayScheduledOccurrences: TimetableOccurrence[] = [];
    for (const batch of batches) {
      if (batch.status !== ClassBatchStatus.Published) continue;
      const occs = this.expandOccurrencesForBatch(
        batch as any,
        todayStartUtc,
        todayEndUtc,
      ).filter((o) => o.localDate === todayYmd);
      todayScheduledOccurrences.push(...occs);
    }

    const [
      enrolledStudentsCount,
      pendingEnrollmentRequestsCount,
      sessionsUpToToday,
      periodInvoices,
      openInvoices,
      pendingManualSubs,
      pendingManualSubsCount,
    ] =
      classIds.length === 0
        ? [[], 0, [], [], [], [], 0].map((v, idx) => (idx === 0 ? 0 : v)) as [
            number,
            number,
            any[],
            any[],
            any[],
            any[],
            number,
          ]
        : await Promise.all([
            this.prisma.classEnrollment.count({
              where: {
                classId: { in: classIds },
                status: ClassEnrollmentStatus.ACTIVE,
              },
            }),
            this.prisma.classEnrollment.count({
              where: {
                classId: { in: classIds },
                status: ClassEnrollmentStatus.PENDING,
              },
            }),
            this.prisma.classSession.findMany({
              where: {
                classId: { in: classIds },
                localDate: { lte: todayYmd },
                status: { not: ClassSessionStatus.CANCELLED },
              },
              orderBy: [{ startsAtUtc: 'desc' }],
              take: 60,
              include: {
                classBatch: {
                  select: {
                    id: true,
                    title: true,
                    _count: {
                      select: {
                        enrollments: {
                          where: { status: ClassEnrollmentStatus.ACTIVE },
                        },
                      },
                    },
                  },
                },
                attendanceRecords: {
                  select: { status: true },
                },
              },
            }),
            this.prisma.tuitionInvoice.findMany({
              where: {
                classId: { in: classIds },
                periodYyyyMm,
                status: { not: TuitionInvoiceStatus.VOIDED },
              },
              select: {
                id: true,
                classId: true,
                status: true,
                totalMinor: true,
                discountMinor: true,
                paidMinor: true,
                balanceMinor: true,
                dueAt: true,
                graceDays: true,
              },
            }),
            this.prisma.tuitionInvoice.findMany({
              where: {
                classId: { in: classIds },
                status: {
                  in: [
                    TuitionInvoiceStatus.ISSUED,
                    TuitionInvoiceStatus.PARTIALLY_PAID,
                    TuitionInvoiceStatus.OVERDUE,
                  ],
                },
                balanceMinor: { gt: 0 },
              },
              select: {
                id: true,
                classId: true,
                status: true,
                balanceMinor: true,
                dueAt: true,
                graceDays: true,
              },
            }),
            this.prisma.tuitionManualPaymentSubmission.findMany({
              where: {
                classId: { in: classIds },
                status: SlipSubmissionStatus.Pending,
              },
              orderBy: { createdAt: 'desc' },
              take: 10,
              include: {
                invoice: {
                  select: {
                    id: true,
                    invoiceNumber: true,
                    periodYyyyMm: true,
                    classBatch: { select: { id: true, title: true } },
                  },
                },
                student: {
                  select: {
                    id: true,
                    name: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            }),
            this.prisma.tuitionManualPaymentSubmission.count({
              where: {
                classId: { in: classIds },
                status: SlipSubmissionStatus.Pending,
              },
            }),
          ]);

    // Build today's sessions & attendance pending count
    const todaysDbSessions = sessionsUpToToday.filter(
      (s) => s.localDate === todayYmd,
    );
    const todaysSessionsMap = new Map<string, any>();

    for (const s of todaysDbSessions) {
      const rosterCount = s.classBatch?._count?.enrollments ?? 0;
      const markedCount = (s.attendanceRecords ?? []).filter(
        (r: any) => r.status !== AttendanceStatus.UNMARKED,
      ).length;
      const unmarkedCount = Math.max(0, rosterCount - markedCount);
      todaysSessionsMap.set(`${s.classId}:${s.startsAtUtc.toISOString()}`, {
        sessionId: s.id,
        classId: s.classId,
        classTitle: s.classBatch?.title ?? { en: 'Class' },
        localDate: s.localDate,
        startsAtUtc: s.startsAtUtc.toISOString(),
        endsAtUtc: s.endsAtUtc.toISOString(),
        status: s.status,
        rosterCount,
        markedCount,
        unmarkedCount,
        attendancePending: rosterCount > 0 && unmarkedCount > 0,
      });
    }

    for (const occ of todayScheduledOccurrences) {
      const key = `${occ.classId}:${occ.startsAtUtc}`;
      if (!todaysSessionsMap.has(key)) {
        const batch = batches.find((b) => b.id === occ.classId);
        const rosterCount = batch?._count?.enrollments ?? 0;
        todaysSessionsMap.set(key, {
          sessionId: null,
          classId: occ.classId,
          classTitle: occ.classTitle,
          localDate: occ.localDate,
          startsAtUtc: occ.startsAtUtc,
          endsAtUtc: occ.endsAtUtc,
          status: 'SCHEDULED',
          rosterCount,
          markedCount: 0,
          unmarkedCount: rosterCount,
          attendancePending: rosterCount > 0,
        });
      }
    }

    const todaysSessions = Array.from(todaysSessionsMap.values()).sort(
      (a, b) =>
        new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime(),
    );

    let attendancePendingCount = 0;
    for (const s of sessionsUpToToday) {
      const rosterCount = s.classBatch?._count?.enrollments ?? 0;
      const markedCount = (s.attendanceRecords ?? []).filter(
        (r: any) => r.status !== AttendanceStatus.UNMARKED,
      ).length;
      if (rosterCount > 0 && markedCount < rosterCount) {
        attendancePendingCount += 1;
      }
    }
    for (const ts of todaysSessions) {
      if (!ts.sessionId && ts.attendancePending) {
        attendancePendingCount += 1;
      }
    }

    // Tuition summary for selected period (separate from 60/40 quiz revenue pool)
    let totalBilledThisMonthMinor = 0;
    let totalDiscountThisMonthMinor = 0;
    let paymentsReceivedThisMonthMinor = 0;
    for (const inv of periodInvoices) {
      totalBilledThisMonthMinor += inv.totalMinor ?? 0;
      totalDiscountThisMonthMinor += inv.discountMinor ?? 0;
      paymentsReceivedThisMonthMinor += inv.paidMinor ?? 0;
    }

    let outstandingBalanceMinor = 0;
    let overdueInvoicesCount = 0;
    for (const inv of openInvoices) {
      outstandingBalanceMinor += inv.balanceMinor ?? 0;
      const graceEndMs =
        new Date(inv.dueAt).getTime() +
        (inv.graceDays ?? 0) * 24 * 60 * 60 * 1000;
      if (
        inv.status === TuitionInvoiceStatus.OVERDUE ||
        now.getTime() > graceEndMs
      ) {
        overdueInvoicesCount += 1;
      }
    }

    const classesOverview = batches.slice(0, 12).map((b) => {
      const formatted = this.formatBatchResponse(b);
      const nextOccurrences =
        b.status === ClassBatchStatus.Published
          ? this.expandOccurrencesForBatch(b as any, now, twoWeeksLater)
          : [];
      return {
        ...formatted,
        nextSession: nextOccurrences[0] ?? null,
      };
    });

    const formattedPendingManualVerifications = pendingManualSubs.map(
      (sub: any) => ({
        id: sub.id,
        classId: sub.classId,
        classTitle: sub.invoice?.classBatch?.title ?? { en: 'Class' },
        invoiceId: sub.invoiceId,
        invoiceNumber: sub.invoice?.invoiceNumber ?? '—',
        periodYyyyMm: sub.invoice?.periodYyyyMm ?? periodYyyyMm,
        channel: sub.channel,
        amountMinor: sub.amountMinor,
        currency: sub.currency,
        referenceNumber: sub.referenceNumber,
        paidDate: sub.paidDate,
        createdAt: sub.createdAt,
        student: sub.student ? formatTeacherDisplayName(sub.student) : null,
      }),
    );

    let adminGovernance: any = null;
    if (isSuperAdmin) {
      const [allBatchesForTeachers, failedGatewayEvents, recentAuditEvents] =
        await Promise.all([
          this.prisma.classBatch.findMany({
            select: {
              id: true,
              title: true,
              status: true,
              primaryTeacherId: true,
              primaryTeacher: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  firstName: true,
                  lastName: true,
                },
              },
              _count: {
                select: {
                  enrollments: {
                    where: { status: ClassEnrollmentStatus.ACTIVE },
                  },
                },
              },
            },
          }),
          this.prisma.tuitionPaymentEvent.findMany({
            where: {
              status: { in: ['FAILED', 'IGNORED', 'ERROR'] },
            },
            orderBy: { receivedAt: 'desc' },
            take: 10,
          }),
          this.prisma.auditLog.findMany({
            where: { subject: 'CLASSES' },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              actor: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  role: true,
                },
              },
            },
          }),
        ]);

      const teacherMap = new Map<
        string,
        {
          id: string;
          name: string;
          email: string;
          classesCount: number;
          activeClassesCount: number;
          enrolledStudentsCount: number;
        }
      >();
      for (const b of allBatchesForTeachers) {
        const t = formatTeacherDisplayName(b.primaryTeacher);
        const existing = teacherMap.get(t.id) ?? {
          id: t.id,
          name: t.name,
          email: t.email,
          classesCount: 0,
          activeClassesCount: 0,
          enrolledStudentsCount: 0,
        };
        existing.classesCount += 1;
        if (b.status === ClassBatchStatus.Published) {
          existing.activeClassesCount += 1;
        }
        existing.enrolledStudentsCount += b._count?.enrollments ?? 0;
        teacherMap.set(t.id, existing);
      }

      // Per-class reconciliation for the selected period
      const reconByClass = new Map<
        string,
        {
          classId: string;
          classTitle: any;
          teacherName: string;
          invoiceCount: number;
          paidCount: number;
          overdueCount: number;
          totalBilledMinor: number;
          totalPaidMinor: number;
          totalBalanceMinor: number;
        }
      >();
      for (const b of batches) {
        const t = formatTeacherDisplayName(b.primaryTeacher);
        reconByClass.set(b.id, {
          classId: b.id,
          classTitle: b.title,
          teacherName: t.name,
          invoiceCount: 0,
          paidCount: 0,
          overdueCount: 0,
          totalBilledMinor: 0,
          totalPaidMinor: 0,
          totalBalanceMinor: 0,
        });
      }
      for (const inv of periodInvoices) {
        const row = reconByClass.get(inv.classId);
        if (!row) continue;
        row.invoiceCount += 1;
        if (inv.status === TuitionInvoiceStatus.PAID) row.paidCount += 1;
        const graceEndMs =
          new Date(inv.dueAt).getTime() +
          (inv.graceDays ?? 0) * 24 * 60 * 60 * 1000;
        if (
          inv.status === TuitionInvoiceStatus.OVERDUE ||
          (inv.balanceMinor > 0 && now.getTime() > graceEndMs)
        ) {
          row.overdueCount += 1;
        }
        row.totalBilledMinor += inv.totalMinor ?? 0;
        row.totalPaidMinor += inv.paidMinor ?? 0;
        row.totalBalanceMinor += inv.balanceMinor ?? 0;
      }

      adminGovernance = {
        selectedTeacherUserId: targetTeacherId,
        teachers: Array.from(teacherMap.values()),
        failedGatewayEventsCount: failedGatewayEvents.length,
        failedGatewayEvents: failedGatewayEvents.map((ev) => ({
          id: ev.id,
          provider: ev.provider,
          externalEventId: ev.externalEventId,
          paymentId: ev.paymentId,
          status: ev.status,
          errorMessage: ev.errorMessage,
          receivedAt: ev.receivedAt,
          processedAt: ev.processedAt,
        })),
        billingReconciliation: Array.from(reconByClass.values()),
        recentAuditEvents: recentAuditEvents.map((log: any) => ({
          id: log.id,
          action: log.action,
          subject: log.subject,
          targetId: log.targetId,
          description: log.description,
          actorEmail: log.actorEmail ?? log.actor?.email ?? 'System',
          actorName: log.actorName ?? log.actor?.name ?? log.actor?.email ?? 'System',
          createdAt: log.createdAt,
        })),
      };
    }

    return {
      isSuperAdmin,
      scopedTeacherId: targetTeacherId,
      periodYyyyMm,
      todayLocalDate: todayYmd,
      kpis: {
        activeClassesCount,
        totalClassesCount,
        enrolledStudentsCount,
        pendingEnrollmentRequestsCount,
        todaysSessionsCount: todaysSessions.length,
        attendancePendingCount,
        paymentsReceivedThisMonthMinor,
        totalBilledThisMonthMinor,
        totalDiscountThisMonthMinor,
        outstandingInvoicesCount: openInvoices.length,
        outstandingBalanceMinor,
        overdueInvoicesCount,
        pendingManualVerificationsCount: pendingManualSubsCount,
        currency: 'LKR',
      },
      todaysSessions,
      pendingManualVerifications: formattedPendingManualVerifications,
      classesOverview,
      adminGovernance,
    };
  }

  async getStudentDashboardSummary(actor: RequestActor) {
    const now = new Date();
    const { ymd: todayYmd } = getZonedDateInfo(now, DEFAULT_TIMEZONE);
    const currentPeriodYyyyMm = todayYmd.slice(0, 7);

    const [myClasses, timetableRes] = await Promise.all([
      this.listStudentClasses(actor),
      this.getStudentTimetable(actor, {}),
    ]);

    const activeClassIds = myClasses
      .filter((c) => c.enrollment?.status === ClassEnrollmentStatus.ACTIVE)
      .map((c) => c.id);
    const activeCourseIds = Array.from(
      new Set(
        myClasses
          .filter((c) => c.enrollment?.status === ClassEnrollmentStatus.ACTIVE)
          .map((c) => c.courseId),
      ),
    );

    const [
      publishedLessons,
      progressRows,
      quizAssignments,
      sessionsWithRecords,
      invoices,
    ] =
      activeClassIds.length === 0
        ? [[], [], [], [], []]
        : await Promise.all([
            this.prisma.lesson.findMany({
              where: {
                status: LessonStatus.Published,
                OR: [{ publishAt: null }, { publishAt: { lte: now } }],
                module: {
                  courseId: { in: activeCourseIds },
                  status: 'Published',
                },
              },
              orderBy: [
                { module: { sortOrder: 'asc' } },
                { sortOrder: 'asc' },
                { createdAt: 'asc' },
              ],
              select: {
                id: true,
                title: true,
                sortOrder: true,
                module: { select: { id: true, courseId: true, sortOrder: true } },
              },
            }),
            this.prisma.lessonProgress.findMany({
              where: {
                studentId: actor.id,
                classId: { in: activeClassIds },
              },
              select: {
                classId: true,
                lessonId: true,
                completedAt: true,
              },
            }),
            this.prisma.classQuizAssignment.findMany({
              where: {
                classId: { in: activeClassIds },
                status: ClassQuizAssignmentStatus.Published,
              },
              orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
              include: {
                quiz: {
                  select: {
                    id: true,
                    title: true,
                    durationMinutes: true,
                    passingScorePercentage: true,
                  },
                },
              },
            }),
            this.prisma.classSession.findMany({
              where: {
                classId: { in: activeClassIds },
                status: { not: ClassSessionStatus.CANCELLED },
              },
              orderBy: { startsAtUtc: 'desc' },
              include: {
                attendanceRecords: {
                  where: { studentId: actor.id },
                  select: { status: true, note: true, markedAt: true },
                },
              },
            }),
            this.prisma.tuitionInvoice.findMany({
              where: {
                studentId: actor.id,
                classId: { in: activeClassIds },
                status: { not: TuitionInvoiceStatus.VOIDED },
              },
              orderBy: [{ periodYyyyMm: 'desc' }, { createdAt: 'desc' }],
              include: {
                classBatch: { select: { id: true, title: true } },
                allocations: {
                  include: {
                    payment: {
                      include: {
                        receipt: true,
                      },
                    },
                  },
                },
                manualSubmissions: {
                  where: { status: SlipSubmissionStatus.Pending },
                  select: { id: true, amountMinor: true, status: true },
                },
              },
            }),
          ]);

    const assignedQuizIds = Array.from(
      new Set(quizAssignments.map((qa: any) => qa.quizId)),
    );
    const quizAttempts =
      assignedQuizIds.length === 0
        ? []
        : await this.prisma.quizAttempt.findMany({
            where: {
              studentId: actor.id,
              quizId: { in: assignedQuizIds },
              status: {
                in: [AttemptStatus.Submitted, AttemptStatus.Timed_Out],
              },
            },
            orderBy: { submittedAt: 'desc' },
            select: {
              id: true,
              quizId: true,
              finalScore: true,
              isPassed: true,
              resultToken: true,
              submittedAt: true,
            },
          });

    let totalCompletedLessonsAll = 0;
    let totalPublishedLessonsAll = 0;
    let totalAttendedAll = 0;
    let totalEligibleAll = 0;
    let openQuizzesCount = 0;

    const enrichedClasses = myClasses.map((cls) => {
      const isActive = cls.enrollment?.status === ClassEnrollmentStatus.ACTIVE;
      const courseLessons = publishedLessons.filter(
        (l: any) => l.module.courseId === cls.courseId,
      );
      const completedSet = new Set(
        progressRows
          .filter((p: any) => p.classId === cls.id)
          .map((p: any) => p.lessonId),
      );
      const completedCount = courseLessons.filter((l: any) =>
        completedSet.has(l.id),
      ).length;
      const totalLessonsCount = courseLessons.length;
      const completionPercentage =
        totalLessonsCount > 0
          ? Math.round((completedCount / totalLessonsCount) * 100)
          : 0;
      const nextUncompletedLesson =
        courseLessons.find((l: any) => !completedSet.has(l.id)) ?? null;

      if (isActive) {
        totalCompletedLessonsAll += completedCount;
        totalPublishedLessonsAll += totalLessonsCount;
      }

      // Attendance summary for this class
      const classSessions = sessionsWithRecords.filter(
        (s: any) => s.classId === cls.id,
      );
      let present = 0;
      let late = 0;
      let absent = 0;
      let excused = 0;
      let unmarked = 0;
      for (const s of classSessions) {
        const st =
          s.attendanceRecords?.[0]?.status ?? AttendanceStatus.UNMARKED;
        if (st === AttendanceStatus.PRESENT) present += 1;
        else if (st === AttendanceStatus.LATE) late += 1;
        else if (st === AttendanceStatus.ABSENT) absent += 1;
        else if (st === AttendanceStatus.EXCUSED) excused += 1;
        else unmarked += 1;
      }
      const attended = present + late;
      const eligible = present + late + absent;
      const attendancePercentage =
        eligible > 0 ? Math.round((attended / eligible) * 1000) / 10 : null;

      if (isActive) {
        totalAttendedAll += attended;
        totalEligibleAll += eligible;
      }

      // Quizzes assigned to this class
      const clsAssignments = quizAssignments.filter(
        (qa: any) => qa.classId === cls.id,
      );
      let clsOpenCount = 0;
      let nextQuiz: any = null;
      let latestAttemptForClass: any = null;

      for (const qa of clsAssignments) {
        const fromOk =
          !qa.availableFrom || new Date(qa.availableFrom).getTime() <= now.getTime();
        const dueOk = !qa.dueAt || new Date(qa.dueAt).getTime() >= now.getTime();
        const state = !fromOk ? 'UPCOMING' : dueOk ? 'OPEN' : 'PAST_DUE';
        if (state === 'OPEN') {
          clsOpenCount += 1;
          if (!nextQuiz) {
            nextQuiz = {
              id: qa.id,
              quizId: qa.quizId,
              displayTitle: qa.displayTitle ?? qa.quiz?.title ?? { en: 'Quiz' },
              dueAt: qa.dueAt,
              availabilityState: state,
            };
          }
        }
        const att = quizAttempts.find((a: any) => a.quizId === qa.quizId);
        if (
          att &&
          (!latestAttemptForClass ||
            new Date(att.submittedAt ?? 0).getTime() >
              new Date(latestAttemptForClass.submittedAt ?? 0).getTime())
        ) {
          latestAttemptForClass = {
            quizId: qa.quizId,
            quizTitle: qa.displayTitle ?? qa.quiz?.title ?? { en: 'Quiz' },
            finalScore: att.finalScore,
            isPassed: att.isPassed,
            resultToken: att.resultToken,
            submittedAt: att.submittedAt,
          };
        }
      }

      if (isActive) {
        openQuizzesCount += clsOpenCount;
      }

      // Tuition summary for this class
      const clsInvoices = invoices.filter((inv: any) => inv.classId === cls.id);
      const currentMonthInv =
        clsInvoices.find((inv: any) => inv.periodYyyyMm === currentPeriodYyyyMm) ??
        clsInvoices[0] ??
        null;
      const clsDueMinor = clsInvoices.reduce(
        (sum: number, inv: any) => sum + Math.max(0, inv.balanceMinor ?? 0),
        0,
      );

      return {
        ...cls,
        learningSummary: {
          completedLessons: completedCount,
          totalPublishedLessons: totalLessonsCount,
          completionPercentage,
          nextLesson: nextUncompletedLesson
            ? {
                id: nextUncompletedLesson.id,
                title: nextUncompletedLesson.title,
              }
            : null,
        },
        attendanceSummary: {
          present,
          late,
          absent,
          excused,
          unmarked,
          attended,
          eligible,
          attendancePercentage,
          countingPolicy:
            'Present and Late count as Attended; Excused and Cancelled are excluded from denominator.',
        },
        quizSummary: {
          totalAssigned: clsAssignments.length,
          openCount: clsOpenCount,
          nextQuiz,
          latestAttempt: latestAttemptForClass,
        },
        tuitionSummary: {
          currentPeriodYyyyMm,
          currentInvoice: currentMonthInv
            ? {
                id: currentMonthInv.id,
                invoiceNumber: currentMonthInv.invoiceNumber,
                periodYyyyMm: currentMonthInv.periodYyyyMm,
                status: currentMonthInv.status,
                totalMinor: currentMonthInv.totalMinor,
                paidMinor: currentMonthInv.paidMinor,
                balanceMinor: currentMonthInv.balanceMinor,
                dueAt: currentMonthInv.dueAt,
                currency: currentMonthInv.currency,
              }
            : null,
          totalDueMinor: clsDueMinor,
          currency: 'LKR',
        },
      };
    });

    // Sort student invoices with current month first, then descending period
    const formattedInvoices = invoices
      .slice()
      .sort((a: any, b: any) => {
        if (a.periodYyyyMm === currentPeriodYyyyMm && b.periodYyyyMm !== currentPeriodYyyyMm) {
          return -1;
        }
        if (b.periodYyyyMm === currentPeriodYyyyMm && a.periodYyyyMm !== currentPeriodYyyyMm) {
          return 1;
        }
        return String(b.periodYyyyMm).localeCompare(String(a.periodYyyyMm));
      })
      .map((inv: any) => {
        const pendingMinor = (inv.manualSubmissions ?? []).reduce(
          (s: number, m: any) => s + (m.amountMinor ?? 0),
          0,
        );
        const confirmedAlloc = (inv.allocations ?? []).find(
          (al: any) =>
            al.payment?.status === TuitionPaymentStatus.SUCCEEDED ||
            al.payment?.status === TuitionPaymentStatus.PARTIALLY_REFUNDED,
        );
        return {
          id: inv.id,
          classId: inv.classId,
          classTitle: inv.classBatch?.title ?? { en: 'Class' },
          invoiceNumber: inv.invoiceNumber,
          periodYyyyMm: inv.periodYyyyMm,
          status: inv.status,
          currency: inv.currency,
          subtotalMinor: inv.subtotalMinor,
          discountMinor: inv.discountMinor,
          surchargeMinor: inv.surchargeMinor,
          totalMinor: inv.totalMinor,
          paidMinor: inv.paidMinor,
          balanceMinor: inv.balanceMinor,
          pendingMinor,
          dueAt: inv.dueAt,
          paidAt: inv.paidAt,
          confirmedPaymentId: confirmedAlloc?.paymentId ?? null,
          receiptNumber: confirmedAlloc?.payment?.receipt?.receiptNumber ?? null,
        };
      });

    const totalTuitionDueMinor = formattedInvoices.reduce(
      (s: number, inv: any) => s + Math.max(0, inv.balanceMinor ?? 0),
      0,
    );
    const totalTuitionPaidMinor = formattedInvoices.reduce(
      (s: number, inv: any) => s + (inv.paidMinor ?? 0),
      0,
    );
    const overdueInvoicesCount = formattedInvoices.filter(
      (inv: any) =>
        inv.status === TuitionInvoiceStatus.OVERDUE ||
        (inv.balanceMinor > 0 && new Date(inv.dueAt).getTime() < now.getTime()),
    ).length;

    const overallCompletionPercentage =
      totalPublishedLessonsAll > 0
        ? Math.round((totalCompletedLessonsAll / totalPublishedLessonsAll) * 100)
        : 0;
    const overallAttendancePercentage =
      totalEligibleAll > 0
        ? Math.round((totalAttendedAll / totalEligibleAll) * 1000) / 10
        : null;

    return {
      currentPeriodYyyyMm,
      kpis: {
        activeClassesCount: activeClassIds.length,
        invitedClassesCount: myClasses.filter(
          (c) => c.enrollment?.status === ClassEnrollmentStatus.INVITED,
        ).length,
        overallCompletionPercentage,
        overallAttendancePercentage,
        openQuizzesCount,
        totalTuitionDueMinor,
        totalTuitionPaidMinor,
        overdueInvoicesCount,
        currency: 'LKR',
      },
      classes: enrichedClasses,
      upcomingSessions: (timetableRes.occurrences ?? []).slice(0, 8),
      invoices: formattedInvoices,
    };
  }
}

