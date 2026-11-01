import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  AuditAction,
  ClassEnrollmentStatus,
  ClassSessionStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClassesService,
  RequestActor,
  assertValidTimezone,
  getZonedDateInfo,
  localDateTimeToUtc,
} from './classes.service';
import {
  ClassMonthlyAttendanceQueryDto,
  CreateClassSessionDto,
  ListClassSessionsQueryDto,
  PutSessionAttendanceDto,
  StudentAttendanceQueryDto,
  UpdateClassSessionDto,
} from './dto/class-attendance.dto';

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
}

export interface ComputedAttendanceMetrics extends AttendanceCounts {
  attended: number;
  eligible: number;
  totalSessions: number;
  attendancePercentage: number | null;
  formulaNote: string;
}

export const ATTENDANCE_FORMULA_NOTE =
  'Attended (Present + Late) / Eligible (Present + Late + Absent). Excused and Unmarked sessions are excluded from the denominator.';

/**
 * Consistent attendance percentage calculation across Teacher Summary, CSV Export, and Student History.
 * - PRESENT and LATE count as attended (numerator).
 * - PRESENT, LATE, and ABSENT count as eligible (denominator).
 * - EXCUSED and UNMARKED are excluded from the denominator so unmarked/excused sessions never penalize students.
 */
export function computeAttendanceMetrics(
  counts: AttendanceCounts,
): ComputedAttendanceMetrics {
  const present = Math.max(0, counts.present || 0);
  const late = Math.max(0, counts.late || 0);
  const absent = Math.max(0, counts.absent || 0);
  const excused = Math.max(0, counts.excused || 0);
  const unmarked = Math.max(0, counts.unmarked || 0);

  const attended = present + late;
  const eligible = present + late + absent;
  const totalSessions = eligible + excused + unmarked;
  const attendancePercentage =
    eligible > 0 ? Math.round((attended / eligible) * 100) : null;

  return {
    present,
    late,
    absent,
    excused,
    unmarked,
    attended,
    eligible,
    totalSessions,
    attendancePercentage,
    formulaNote: ATTENDANCE_FORMULA_NOTE,
  };
}

function toJsonOrNull(
  value?: { en?: string; si?: string; ta?: string } | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  const en = value.en?.trim() || '';
  if (!en) return Prisma.JsonNull;
  return {
    en,
    si: value.si?.trim() || en,
    ta: value.ta?.trim() || en,
  } as Prisma.InputJsonValue;
}

function formatStudentDisplayName(u?: {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!u) return 'Unknown';
  return (
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
    u.name?.trim() ||
    u.email
  );
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesService: ClassesService,
    private readonly auditService: AuditService,
  ) {}

  private parseWindowDates(fromRaw?: string, toRaw?: string): {
    fromDate: Date;
    toDate: Date;
    fromYmd: string;
    toYmd: string;
  } {
    const now = new Date();
    const defaultFrom = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
    );
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59),
    );

    const fromDate = fromRaw
      ? /^\d{4}-\d{2}-\d{2}$/.test(fromRaw.trim())
        ? new Date(`${fromRaw.trim()}T00:00:00.000Z`)
        : new Date(fromRaw)
      : defaultFrom;

    const toDate = toRaw
      ? /^\d{4}-\d{2}-\d{2}$/.test(toRaw.trim())
        ? new Date(`${toRaw.trim()}T23:59:59.999Z`)
        : new Date(toRaw)
      : defaultTo;

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date range parameters.');
    }
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('Start date must not be after end date.');
    }

    const maxSpanMs = 120 * 24 * 60 * 60 * 1000;
    if (toDate.getTime() - fromDate.getTime() > maxSpanMs) {
      throw new BadRequestException(
        'Session query/generation range cannot exceed 120 days.',
      );
    }

    const fromYmd = fromDate.toISOString().slice(0, 10);
    const toYmd = toDate.toISOString().slice(0, 10);
    return { fromDate, toDate, fromYmd, toYmd };
  }

  /**
   * Materializes recurring schedule occurrences into `class_sessions` idempotently
   * using the `(classId, startsAtUtc)` unique constraint.
   */
  private async materializeScheduleSessionsInWindow(
    classId: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<number> {
    const batch = await this.prisma.classBatch.findUnique({
      where: { id: classId },
      include: {
        schedules: true,
      },
    });
    if (!batch || !batch.schedules || batch.schedules.length === 0) {
      return 0;
    }

    let generatedCount = 0;
    const dayMs = 24 * 60 * 60 * 1000;
    const startCursor = new Date(
      Date.UTC(
        fromDate.getUTCFullYear(),
        fromDate.getUTCMonth(),
        fromDate.getUTCDate(),
        12,
        0,
        0,
      ),
    );
    const endCursor = new Date(
      Date.UTC(
        toDate.getUTCFullYear(),
        toDate.getUTCMonth(),
        toDate.getUTCDate(),
        12,
        0,
        0,
      ),
    );

    for (
      let cursorMs = startCursor.getTime();
      cursorMs <= endCursor.getTime();
      cursorMs += dayMs
    ) {
      const probeDate = new Date(cursorMs);
      for (const sched of batch.schedules) {
        const tz = sched.timezone || 'Asia/Colombo';
        const { ymd, weekday } = getZonedDateInfo(probeDate, tz);
        if (weekday !== sched.weekday) continue;

        if (batch.startDate) {
          const batchStartYmd = getZonedDateInfo(batch.startDate, tz).ymd;
          if (ymd < batchStartYmd) continue;
        }
        if (batch.endDate) {
          const batchEndYmd = getZonedDateInfo(batch.endDate, tz).ymd;
          if (ymd > batchEndYmd) continue;
        }
        if (sched.effectiveFrom) {
          const effFromYmd = getZonedDateInfo(sched.effectiveFrom, tz).ymd;
          if (ymd < effFromYmd) continue;
        }
        if (sched.effectiveTo) {
          const effToYmd = getZonedDateInfo(sched.effectiveTo, tz).ymd;
          if (ymd > effToYmd) continue;
        }

        const startHhmm =
          sched.localStartTime || (sched as any).startTime || '09:00';
        const endHhmm =
          sched.localEndTime || (sched as any).endTime || '11:00';
        const startsAtUtc = localDateTimeToUtc(ymd, startHhmm, tz);
        const endsAtUtc = localDateTimeToUtc(ymd, endHhmm, tz);

        await this.prisma.classSession.upsert({
          where: {
            classId_startsAtUtc: {
              classId,
              startsAtUtc,
            },
          },
          create: {
            classId,
            scheduleId: sched.id,
            startsAtUtc,
            endsAtUtc,
            localDate: ymd,
            timezone: tz,
            status: ClassSessionStatus.SCHEDULED,
          },
          update: {},
        });
        generatedCount += 1;
      }
    }

    return generatedCount;
  }

  async createOrGenerateSessions(
    classId: string,
    dto: CreateClassSessionDto,
    actor: RequestActor,
  ) {
    await this.classesService.requireWriteAccess(classId, actor);

    if (dto.generateFromSchedule) {
      const { fromDate, toDate, fromYmd, toYmd } = this.parseWindowDates(
        dto.from,
        dto.to,
      );
      const generatedCount = await this.materializeScheduleSessionsInWindow(
        classId,
        fromDate,
        toDate,
      );

      void this.auditService.log({
        action: AuditAction.CREATE,
        subject: 'CLASSES',
        targetId: classId,
        description: `Generated ${generatedCount} class session(s) for window ${fromYmd}..${toYmd}`,
        actor: { id: actor.id, email: actor.email, role: String(actor.role) },
      });

      const listing = await this.listClassSessions(
        classId,
        { from: fromYmd, to: toYmd, autoGenerate: false },
        actor,
      );

      return {
        mode: 'GENERATED',
        generatedCount,
        ...listing,
      };
    }

    if (!dto.startsAtUtc || !dto.endsAtUtc) {
      throw new BadRequestException(
        'startsAtUtc and endsAtUtc are required when creating a manual session.',
      );
    }

    const startsAtUtc = new Date(dto.startsAtUtc);
    const endsAtUtc = new Date(dto.endsAtUtc);
    if (
      Number.isNaN(startsAtUtc.getTime()) ||
      Number.isNaN(endsAtUtc.getTime())
    ) {
      throw new BadRequestException('Invalid session start or end timestamp.');
    }
    if (startsAtUtc.getTime() >= endsAtUtc.getTime()) {
      throw new BadRequestException(
        'Session startsAtUtc must be earlier than endsAtUtc.',
      );
    }

    const timezone = assertValidTimezone(dto.timezone || 'Asia/Colombo');
    const localDate =
      dto.localDate || getZonedDateInfo(startsAtUtc, timezone).ymd;

    const session = await this.prisma.classSession.upsert({
      where: {
        classId_startsAtUtc: {
          classId,
          startsAtUtc,
        },
      },
      create: {
        classId,
        scheduleId: dto.scheduleId || null,
        startsAtUtc,
        endsAtUtc,
        localDate,
        timezone,
        status: ClassSessionStatus.SCHEDULED,
        title: toJsonOrNull(dto.title),
      },
      update: {
        endsAtUtc,
        localDate,
        timezone,
        ...(dto.title !== undefined ? { title: toJsonOrNull(dto.title) } : {}),
      },
    });

    void this.auditService.log({
      action: AuditAction.CREATE,
      subject: 'CLASSES',
      targetId: session.id,
      description: `Created manual class session on ${session.localDate}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return session;
  }

  async listClassSessions(
    classId: string,
    query: ListClassSessionsQueryDto,
    actor: RequestActor,
  ) {
    // Allow teacher read access OR active student enrollment in this class
    let isTeacherView = false;
    try {
      await this.classesService.requireTeacherReadAccess(classId, actor);
      isTeacherView = true;
    } catch (err) {
      const activeEnrollment = await this.prisma.classEnrollment.findUnique({
        where: {
          classId_studentId: {
            classId,
            studentId: actor.id,
          },
        },
      });
      if (
        !activeEnrollment ||
        activeEnrollment.status !== ClassEnrollmentStatus.ACTIVE
      ) {
        throw err;
      }
    }

    const { fromDate, toDate, fromYmd, toYmd } = this.parseWindowDates(
      query.from,
      query.to,
    );

    if (isTeacherView && query.autoGenerate !== false) {
      await this.materializeScheduleSessionsInWindow(
        classId,
        fromDate,
        toDate,
      );
    }

    const activeStudentCount = await this.prisma.classEnrollment.count({
      where: {
        classId,
        status: ClassEnrollmentStatus.ACTIVE,
      },
    });

    const sessions = await this.prisma.classSession.findMany({
      where: {
        classId,
        localDate: {
          gte: fromYmd,
          lte: toYmd,
        },
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        schedule: {
          select: {
            id: true,
            weekday: true,
            localStartTime: true,
            localEndTime: true,
            locationType: true,
            locationValue: true,
          },
        },
        attendanceRecords: {
          select: {
            status: true,
          },
        },
      },
      orderBy: [{ startsAtUtc: 'asc' }],
    });

    const formatted = sessions.map((session) => {
      let present = 0;
      let late = 0;
      let absent = 0;
      let excused = 0;
      let explicitUnmarked = 0;

      for (const rec of session.attendanceRecords) {
        if (rec.status === AttendanceStatus.PRESENT) present += 1;
        else if (rec.status === AttendanceStatus.LATE) late += 1;
        else if (rec.status === AttendanceStatus.ABSENT) absent += 1;
        else if (rec.status === AttendanceStatus.EXCUSED) excused += 1;
        else explicitUnmarked += 1;
      }

      const markedNonUnmarked = present + late + absent + excused;
      const unmarked = Math.max(
        explicitUnmarked,
        Math.max(0, activeStudentCount - markedNonUnmarked),
      );
      const metrics = computeAttendanceMetrics({
        present,
        late,
        absent,
        excused,
        unmarked,
      });

      return {
        id: session.id,
        classId: session.classId,
        scheduleId: session.scheduleId,
        schedule: session.schedule,
        startsAtUtc: session.startsAtUtc.toISOString(),
        endsAtUtc: session.endsAtUtc.toISOString(),
        localDate: session.localDate,
        timezone: session.timezone,
        status: session.status,
        title: session.title as Record<string, string> | null,
        cancellationReason: session.cancellationReason,
        isLocked: session.isLocked,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        counts: metrics,
      };
    });

    return {
      classId,
      from: fromYmd,
      to: toYmd,
      activeStudentCount,
      sessions: formatted,
    };
  }

  async updateClassSession(
    classId: string,
    sessionId: string,
    dto: UpdateClassSessionDto,
    actor: RequestActor,
  ) {
    await this.classesService.requireWriteAccess(classId, actor);

    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.classId !== classId) {
      throw new NotFoundException('Class session not found in this batch.');
    }

    if (dto.status === ClassSessionStatus.CANCELLED) {
      const reason =
        dto.cancellationReason?.trim() || session.cancellationReason?.trim();
      if (!reason) {
        throw new BadRequestException(
          'A cancellation reason is required when cancelling a class session.',
        );
      }
    }

    let startsAtUtc = session.startsAtUtc;
    let endsAtUtc = session.endsAtUtc;
    let localDate = session.localDate;

    if (dto.startsAtUtc) {
      startsAtUtc = new Date(dto.startsAtUtc);
      if (Number.isNaN(startsAtUtc.getTime())) {
        throw new BadRequestException('Invalid startsAtUtc timestamp.');
      }
      localDate = getZonedDateInfo(startsAtUtc, session.timezone).ymd;
    }
    if (dto.endsAtUtc) {
      endsAtUtc = new Date(dto.endsAtUtc);
      if (Number.isNaN(endsAtUtc.getTime())) {
        throw new BadRequestException('Invalid endsAtUtc timestamp.');
      }
    }
    if (startsAtUtc.getTime() >= endsAtUtc.getTime()) {
      throw new BadRequestException(
        'Session startsAtUtc must be earlier than endsAtUtc.',
      );
    }

    const updated = await this.prisma.classSession.update({
      where: { id: sessionId },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.title !== undefined ? { title: toJsonOrNull(dto.title) } : {}),
        ...(dto.cancellationReason !== undefined
          ? { cancellationReason: dto.cancellationReason?.trim() || null }
          : {}),
        ...(dto.isLocked !== undefined ? { isLocked: dto.isLocked } : {}),
        startsAtUtc,
        endsAtUtc,
        localDate,
      },
    });

    void this.auditService.log({
      action: AuditAction.UPDATE,
      subject: 'CLASSES',
      targetId: sessionId,
      description: `Updated class session ${sessionId} (${updated.status})`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return updated;
  }

  async getSessionAttendance(sessionId: string, actor: RequestActor) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        classBatch: {
          select: {
            id: true,
            title: true,
            grade: true,
            subject: true,
          },
        },
        schedule: {
          select: {
            id: true,
            weekday: true,
            localStartTime: true,
            localEndTime: true,
            locationType: true,
            locationValue: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Class session not found.');
    }

    await this.classesService.requireTeacherReadAccess(session.classId, actor);

    const [enrollments, existingRecords, changes] = await Promise.all([
      this.prisma.classEnrollment.findMany({
        where: {
          classId: session.classId,
          status: {
            in: [
              ClassEnrollmentStatus.ACTIVE,
              ClassEnrollmentStatus.SUSPENDED,
            ],
          },
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.attendanceRecord.findMany({
        where: { classSessionId: sessionId },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
          markedBy: {
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
      this.prisma.attendanceChange.findMany({
        where: { classSessionId: sessionId },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
          actor: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ changedAt: 'desc' }],
        take: 100,
      }),
    ]);

    const recordByStudentId = new Map(
      existingRecords.map((rec) => [rec.studentId, rec]),
    );

    const studentsMap = new Map<
      string,
      {
        studentId: string;
        name: string;
        email: string;
        studentCode: string | null;
        enrollmentStatus: ClassEnrollmentStatus | 'HISTORICAL';
        recordId: string | null;
        status: AttendanceStatus;
        note: string | null;
        markedAt: string | null;
        markedBy: { id: string; name: string; email: string } | null;
      }
    >();

    for (const enrollment of enrollments) {
      const rec = recordByStudentId.get(enrollment.studentId);
      studentsMap.set(enrollment.studentId, {
        studentId: enrollment.studentId,
        name: formatStudentDisplayName(enrollment.student),
        email: enrollment.student?.email || '',
        studentCode: enrollment.studentCode || null,
        enrollmentStatus: enrollment.status,
        recordId: rec?.id || null,
        status: rec?.status || AttendanceStatus.UNMARKED,
        note: rec?.note || null,
        markedAt: rec?.markedAt ? rec.markedAt.toISOString() : null,
        markedBy: rec?.markedBy
          ? {
              id: rec.markedBy.id,
              name: formatStudentDisplayName(rec.markedBy),
              email: rec.markedBy.email,
            }
          : null,
      });
    }

    for (const rec of existingRecords) {
      if (!studentsMap.has(rec.studentId)) {
        studentsMap.set(rec.studentId, {
          studentId: rec.studentId,
          name: formatStudentDisplayName(rec.student),
          email: rec.student?.email || '',
          studentCode: null,
          enrollmentStatus: 'HISTORICAL',
          recordId: rec.id,
          status: rec.status,
          note: rec.note || null,
          markedAt: rec.markedAt.toISOString(),
          markedBy: rec.markedBy
            ? {
                id: rec.markedBy.id,
                name: formatStudentDisplayName(rec.markedBy),
                email: rec.markedBy.email,
              }
            : null,
        });
      }
    }

    const roster = Array.from(studentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const counts: AttendanceCounts = {
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      unmarked: 0,
    };

    for (const item of roster) {
      if (item.status === AttendanceStatus.PRESENT) counts.present += 1;
      else if (item.status === AttendanceStatus.LATE) counts.late += 1;
      else if (item.status === AttendanceStatus.ABSENT) counts.absent += 1;
      else if (item.status === AttendanceStatus.EXCUSED) counts.excused += 1;
      else counts.unmarked += 1;
    }

    return {
      session: {
        id: session.id,
        classId: session.classId,
        classBatch: session.classBatch,
        schedule: session.schedule,
        startsAtUtc: session.startsAtUtc.toISOString(),
        endsAtUtc: session.endsAtUtc.toISOString(),
        localDate: session.localDate,
        timezone: session.timezone,
        status: session.status,
        title: session.title as Record<string, string> | null,
        cancellationReason: session.cancellationReason,
        isLocked: session.isLocked,
      },
      summary: computeAttendanceMetrics(counts),
      roster,
      auditLog: changes.map((ch) => ({
        id: ch.id,
        attendanceRecordId: ch.attendanceRecordId,
        studentId: ch.studentId,
        studentName: formatStudentDisplayName(ch.student),
        studentEmail: ch.student?.email || '',
        actor: ch.actor
          ? {
              id: ch.actor.id,
              name: formatStudentDisplayName(ch.actor),
              email: ch.actor.email,
            }
          : null,
        previousStatus: ch.previousStatus,
        newStatus: ch.newStatus,
        reason: ch.reason,
        changedAt: ch.changedAt.toISOString(),
      })),
    };
  }

  /**
   * Idempotently saves attendance for a session inside a single database transaction
   * and writes an `AttendanceChange` audit entry whenever a student's status changes.
   */
  async putSessionAttendance(
    sessionId: string,
    dto: PutSessionAttendanceDto,
    actor: RequestActor,
  ) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Class session not found.');
    }

    await this.classesService.requireWriteAccess(session.classId, actor);

    if (session.status === ClassSessionStatus.CANCELLED) {
      throw new BadRequestException(
        'Cannot mark attendance for a cancelled class session.',
      );
    }

    if (session.isLocked && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'This class session attendance is locked. Only a Super Admin can modify locked attendance.',
      );
    }

    // Deduplicate payload by studentId (last item wins if duplicated in request)
    const dedupedByStudent = new Map<
      string,
      { studentId: string; status: AttendanceStatus; note?: string | null }
    >();
    for (const item of dto.records || []) {
      dedupedByStudent.set(item.studentId, item);
    }
    const items = Array.from(dedupedByStudent.values());

    if (items.length === 0) {
      return this.getSessionAttendance(sessionId, actor);
    }

    const studentIds = items.map((i) => i.studentId);

    const [validEnrollments, existingRecords] = await Promise.all([
      this.prisma.classEnrollment.findMany({
        where: {
          classId: session.classId,
          studentId: { in: studentIds },
          status: {
            in: [
              ClassEnrollmentStatus.ACTIVE,
              ClassEnrollmentStatus.SUSPENDED,
            ],
          },
        },
        select: { studentId: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          classSessionId: sessionId,
          studentId: { in: studentIds },
        },
      }),
    ]);

    const allowedStudentIds = new Set<string>([
      ...validEnrollments.map((e) => e.studentId),
      ...existingRecords.map((r) => r.studentId),
    ]);

    for (const sid of studentIds) {
      if (!allowedStudentIds.has(sid)) {
        throw new BadRequestException(
          `Student ${sid} does not belong to this class batch roster.`,
        );
      }
    }

    const existingByStudent = new Map(
      existingRecords.map((r) => [r.studentId, r]),
    );
    const now = new Date();
    const trimmedReason = dto.reason?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const prev = existingByStudent.get(item.studentId);
        const note =
          item.note !== undefined
            ? item.note?.trim() || null
            : prev?.note || null;

        const upserted = await tx.attendanceRecord.upsert({
          where: {
            classSessionId_studentId: {
              classSessionId: sessionId,
              studentId: item.studentId,
            },
          },
          create: {
            classSessionId: sessionId,
            studentId: item.studentId,
            status: item.status,
            note,
            markedById: actor.id,
            markedAt: now,
          },
          update: {
            status: item.status,
            note,
            markedById: actor.id,
            markedAt: now,
          },
        });

        const statusChanged = prev
          ? prev.status !== item.status
          : item.status !== AttendanceStatus.UNMARKED;

        if (statusChanged) {
          await tx.attendanceChange.create({
            data: {
              attendanceRecordId: upserted.id,
              classSessionId: sessionId,
              studentId: item.studentId,
              actorId: actor.id,
              previousStatus: prev?.status ?? null,
              newStatus: item.status,
              reason: trimmedReason,
              changedAt: now,
            },
          });
        }
      }

      if (
        dto.markSessionCompleted !== false &&
        session.status === ClassSessionStatus.SCHEDULED
      ) {
        await tx.classSession.update({
          where: { id: sessionId },
          data: { status: ClassSessionStatus.COMPLETED },
        });
      }
    });

    void this.auditService.log({
      action: AuditAction.UPDATE,
      subject: 'CLASSES',
      targetId: sessionId,
      description: `Marked attendance for ${items.length} student(s) in session ${sessionId}`,
      actor: { id: actor.id, email: actor.email, role: String(actor.role) },
    });

    return this.getSessionAttendance(sessionId, actor);
  }

  async getClassAttendanceSummary(
    classId: string,
    query: ClassMonthlyAttendanceQueryDto,
    actor: RequestActor,
  ) {
    const batch = await this.classesService.requireTeacherReadAccess(
      classId,
      actor,
    );

    let localDateFilter: Prisma.StringFilter | undefined;
    if (query.month) {
      localDateFilter = { startsWith: query.month };
    } else if (query.from || query.to) {
      const { fromYmd, toYmd } = this.parseWindowDates(query.from, query.to);
      localDateFilter = { gte: fromYmd, lte: toYmd };
    }

    const [sessions, enrollments] = await Promise.all([
      this.prisma.classSession.findMany({
        where: {
          classId,
          ...(localDateFilter ? { localDate: localDateFilter } : {}),
        },
        include: {
          attendanceRecords: true,
        },
        orderBy: [{ startsAtUtc: 'asc' }],
      }),
      this.prisma.classEnrollment.findMany({
        where: {
          classId,
          status: {
            in: [
              ClassEnrollmentStatus.ACTIVE,
              ClassEnrollmentStatus.SUSPENDED,
            ],
          },
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    const nonCancelledSessions = sessions.filter(
      (s) => s.status !== ClassSessionStatus.CANCELLED,
    );

    const students = enrollments
      .map((enrollment) => {
        const counts: AttendanceCounts = {
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
          unmarked: 0,
        };

        const sessionStatuses: Record<string, AttendanceStatus> = {};

        for (const sess of sessions) {
          const rec = sess.attendanceRecords.find(
            (r) => r.studentId === enrollment.studentId,
          );
          const status = rec?.status ?? AttendanceStatus.UNMARKED;
          sessionStatuses[sess.id] = status;

          if (sess.status === ClassSessionStatus.CANCELLED) {
            continue;
          }

          if (status === AttendanceStatus.PRESENT) counts.present += 1;
          else if (status === AttendanceStatus.LATE) counts.late += 1;
          else if (status === AttendanceStatus.ABSENT) counts.absent += 1;
          else if (status === AttendanceStatus.EXCUSED) counts.excused += 1;
          else counts.unmarked += 1;
        }

        const metrics = computeAttendanceMetrics(counts);

        return {
          studentId: enrollment.studentId,
          name: formatStudentDisplayName(enrollment.student),
          email: enrollment.student?.email || '',
          studentCode: enrollment.studentCode || null,
          enrollmentStatus: enrollment.status,
          ...metrics,
          sessionStatuses,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const studentsWithEligible = students.filter(
      (s) => s.attendancePercentage !== null,
    );
    const averageAttendancePercentage =
      studentsWithEligible.length > 0
        ? Math.round(
            studentsWithEligible.reduce(
              (acc, s) => acc + (s.attendancePercentage ?? 0),
              0,
            ) / studentsWithEligible.length,
          )
        : null;

    return {
      classId,
      classTitle: batch.title as Record<string, string>,
      month: query.month || null,
      formulaNote: ATTENDANCE_FORMULA_NOTE,
      totals: {
        totalSessions: sessions.length,
        activeSessions: nonCancelledSessions.length,
        completedSessions: sessions.filter(
          (s) => s.status === ClassSessionStatus.COMPLETED,
        ).length,
        cancelledSessions: sessions.filter(
          (s) => s.status === ClassSessionStatus.CANCELLED,
        ).length,
        studentCount: students.length,
        averageAttendancePercentage,
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        localDate: s.localDate,
        startsAtUtc: s.startsAtUtc.toISOString(),
        endsAtUtc: s.endsAtUtc.toISOString(),
        status: s.status,
        title: s.title as Record<string, string> | null,
      })),
      students,
    };
  }

  async exportClassAttendanceCsv(
    classId: string,
    query: ClassMonthlyAttendanceQueryDto,
    actor: RequestActor,
  ): Promise<{ fileName: string; csv: string }> {
    const summary = await this.getClassAttendanceSummary(classId, query, actor);
    const sessionColumns = summary.sessions.filter(
      (s) => s.status !== ClassSessionStatus.CANCELLED,
    );

    const headers = [
      'Student Name',
      'Email',
      'Student Code',
      'Present',
      'Late',
      'Absent',
      'Excused',
      'Unmarked',
      'Attended (Present+Late)',
      'Eligible (Present+Late+Absent)',
      'Attendance %',
      ...sessionColumns.map((s) => `${s.localDate}`),
    ];

    const rows = summary.students.map((st) => [
      st.name,
      st.email,
      st.studentCode || '',
      st.present,
      st.late,
      st.absent,
      st.excused,
      st.unmarked,
      st.attended,
      st.eligible,
      st.attendancePercentage !== null ? `${st.attendancePercentage}%` : 'N/A',
      ...sessionColumns.map(
        (sess) => st.sessionStatuses[sess.id] || AttendanceStatus.UNMARKED,
      ),
    ]);

    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.map(escapeCsvCell).join(',')),
    ];

    const periodSuffix = query.month || 'all';
    const safeCode = classId.slice(0, 8).replace(/[^a-zA-Z0-9_-]/g, '-');
    return {
      fileName: `attendance-${safeCode}-${periodSuffix}.csv`,
      csv: lines.join('\r\n'),
    };
  }

  async getStudentAttendance(
    actor: RequestActor,
    query: StudentAttendanceQueryDto,
  ) {
    if (query.classId) {
      const enrollment = await this.prisma.classEnrollment.findUnique({
        where: {
          classId_studentId: {
            classId: query.classId,
            studentId: actor.id,
          },
        },
      });
      if (!enrollment || enrollment.status !== ClassEnrollmentStatus.ACTIVE) {
        throw new ForbiddenException(
          'You do not have an active enrollment in this class batch.',
        );
      }
    }

    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        studentId: actor.id,
        status: ClassEnrollmentStatus.ACTIVE,
        ...(query.classId ? { classId: query.classId } : {}),
      },
      include: {
        classBatch: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
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
          },
        },
      },
      orderBy: [{ joinedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const classIds = enrollments.map((e) => e.classId);
    const sessions =
      classIds.length > 0
        ? await this.prisma.classSession.findMany({
            where: {
              classId: { in: classIds },
            },
            include: {
              attendanceRecords: {
                where: { studentId: actor.id },
              },
            },
            orderBy: [{ startsAtUtc: 'desc' }],
          })
        : [];

    const sessionsByClass = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const list = sessionsByClass.get(s.classId) || [];
      list.push(s);
      sessionsByClass.set(s.classId, list);
    }

    const classes = enrollments.map((enrollment) => {
      const classSessions = sessionsByClass.get(enrollment.classId) || [];
      const counts: AttendanceCounts = {
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
        unmarked: 0,
      };

      const history = classSessions.map((sess) => {
        const rec = sess.attendanceRecords[0] || null;
        const status = rec?.status ?? AttendanceStatus.UNMARKED;

        if (sess.status !== ClassSessionStatus.CANCELLED) {
          if (status === AttendanceStatus.PRESENT) counts.present += 1;
          else if (status === AttendanceStatus.LATE) counts.late += 1;
          else if (status === AttendanceStatus.ABSENT) counts.absent += 1;
          else if (status === AttendanceStatus.EXCUSED) counts.excused += 1;
          else counts.unmarked += 1;
        }

        return {
          sessionId: sess.id,
          localDate: sess.localDate,
          startsAtUtc: sess.startsAtUtc.toISOString(),
          endsAtUtc: sess.endsAtUtc.toISOString(),
          timezone: sess.timezone,
          sessionStatus: sess.status,
          title: sess.title as Record<string, string> | null,
          cancellationReason: sess.cancellationReason,
          attendanceStatus: status,
          note: rec?.note || null,
          markedAt: rec?.markedAt ? rec.markedAt.toISOString() : null,
        };
      });

      const summary = computeAttendanceMetrics(counts);

      return {
        classId: enrollment.classId,
        classTitle: enrollment.classBatch.title as Record<string, string>,
        courseTitle: enrollment.classBatch.course.title as Record<
          string,
          string
        >,
        grade: enrollment.classBatch.grade,
        subject: enrollment.classBatch.subject,
        teacherName: formatStudentDisplayName(
          enrollment.classBatch.primaryTeacher,
        ),
        summary,
        sessions: history,
      };
    });

    // Aggregate across all enrolled classes
    const overallCounts: AttendanceCounts = {
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      unmarked: 0,
    };
    for (const c of classes) {
      overallCounts.present += c.summary.present;
      overallCounts.late += c.summary.late;
      overallCounts.absent += c.summary.absent;
      overallCounts.excused += c.summary.excused;
      overallCounts.unmarked += c.summary.unmarked;
    }

    return {
      studentId: actor.id,
      formulaNote: ATTENDANCE_FORMULA_NOTE,
      overall: computeAttendanceMetrics(overallCounts),
      classes,
    };
  }
}
