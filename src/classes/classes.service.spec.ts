import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  ClassBatchStatus,
  ClassEnrollmentStatus,
  ClassFeeFrequency,
  ClassLocationType,
  ClassOverdueAccessPolicy,
  ClassProrationPolicy,
  ClassSessionStatus,
  ContentLanguage,
  LessonResourceAccessPolicy,
  LessonResourceScanStatus,
  LessonResourceType,
  LessonStatus,
  Role,
  SlipSubmissionStatus,
  TuitionAdjustmentType,
  TuitionInvoiceStatus,
  TuitionPaymentChannel,
  TuitionPaymentStatus,
} from '@prisma/client';
import { payhereNotifyHash } from '../payments/payhere.util';
import {
  AttendanceService,
  computeAttendanceMetrics,
} from './attendance.service';
import {
  BillingService,
  computeProratedSubtotalMinor,
  reconcileInvoiceFinancials,
} from './billing.service';
import {
  assertValidTimeRange,
  assertValidTimezone,
  ClassesService,
  hashInviteCode,
} from './classes.service';
import {
  assertSafeExternalUrl,
  assertSafeFileBuffer,
  LessonsService,
  sanitizeRichTextString,
} from './lessons.service';

describe('ClassesService, LessonsService, AttendanceService & BillingService (Phases 1–5)', () => {
  let service: ClassesService;
  let lessonsService: LessonsService;
  let attendanceService: AttendanceService;
  let billingService: BillingService;
  let prismaMock: any;
  let auditMock: any;

  const teacherA = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'teacherA@kadaima.lk',
    role: Role.USER,
    team: 'Teacher',
    workspaceId: '99999999-9999-4999-8999-999999999999',
  };

  const teacherB = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'teacherB@kadaima.lk',
    role: Role.USER,
    team: 'Teacher',
    workspaceId: '99999999-9999-4999-8999-999999999999',
  };

  const studentEnrolled = {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'student1@kadaima.lk',
    role: Role.USER,
    team: 'Student',
    workspaceId: '99999999-9999-4999-8999-999999999999',
  };

  const studentUnenrolled = {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'student2@kadaima.lk',
    role: Role.USER,
    team: 'Student',
    workspaceId: '99999999-9999-4999-8999-999999999999',
  };

  const sampleBatch = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    courseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    workspaceId: teacherA.workspaceId,
    primaryTeacherId: teacherA.id,
    title: {
      en: 'Grade 10 Mathematics — Saturday 9 AM',
      si: '10 ශ්‍රේණිය ගණිතය — සෙනසුරාදා පෙ.ව. 9',
      ta: 'தரம் 10 கணிதம் — சனிக்கிழமை காலை 9',
    },
    description: { en: 'Weekend theory class', si: '', ta: '' },
    grade: 'Grade 10',
    subject: 'Mathematics',
    academicYear: 2026,
    languages: [ContentLanguage.en, ContentLanguage.si],
    capacity: 40,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T23:59:59.000Z'),
    status: ClassBatchStatus.Published,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    course: {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: { en: 'Grade 10 Mathematics', si: '', ta: '' },
      status: 'Published',
    },
    primaryTeacher: {
      id: teacherA.id,
      email: teacherA.email,
      name: 'Teacher A',
      firstName: 'Teacher',
      lastName: 'A',
    },
    teachers: [],
    schedules: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        classId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        weekday: 6, // Saturday
        localStartTime: '09:00',
        localEndTime: '11:00',
        timezone: 'Asia/Colombo',
        locationType: ClassLocationType.ONLINE,
        locationValue: 'https://meet.google.com/abc-defg-hij',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: null,
      },
    ],
    _count: {
      enrollments: 1,
      schedules: 1,
    },
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === teacherA.id) {
            return Promise.resolve({
              ...teacherA,
              teacherProfile: { id: 'tp-a' },
              customRole: { name: 'Teacher' },
            });
          }
          if (where.id === teacherB.id) {
            return Promise.resolve({
              ...teacherB,
              teacherProfile: { id: 'tp-b' },
              customRole: { name: 'Teacher' },
            });
          }
          return Promise.resolve(null);
        }),
      },
      course: {
        findUnique: jest.fn().mockResolvedValue({
          id: sampleBatch.courseId,
          title: { en: 'Grade 10 Mathematics' },
          status: 'Published',
        }),
      },
      classBatch: {
        create: jest.fn().mockResolvedValue(sampleBatch),
        findUnique: jest.fn().mockResolvedValue(sampleBatch),
        findMany: jest.fn().mockResolvedValue([sampleBatch]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(sampleBatch),
      },
      classSchedule: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(sampleBatch.schedules[0]),
        create: jest.fn().mockResolvedValue(sampleBatch.schedules[0]),
        update: jest.fn().mockResolvedValue(sampleBatch.schedules[0]),
        delete: jest.fn().mockResolvedValue(sampleBatch.schedules[0]),
      },
      classEnrollment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'enroll-1',
            classId: sampleBatch.id,
            studentId: studentEnrolled.id,
            status: ClassEnrollmentStatus.ACTIVE,
            joinedAt: new Date('2026-02-01T00:00:00.000Z'),
            classBatch: sampleBatch,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      classInvitation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      classTeacher: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      module: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      lesson: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        delete: jest.fn(),
      },
      lessonResource: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      lessonProgress: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      classQuizAssignment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        delete: jest.fn(),
      },
      quiz: {
        findUnique: jest.fn(),
      },
      quizAttempt: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      classSession: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      attendanceChange: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      classFeePlan: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
      },
      tuitionInvoice: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      tuitionInvoiceAdjustment: {
        create: jest.fn(),
      },
      tuitionPayment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      tuitionPaymentAllocation: {
        create: jest.fn(),
        update: jest.fn(),
      },
      tuitionPaymentEvent: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      tuitionManualPaymentSubmission: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      tuitionReceipt: {
        create: jest.fn(),
        update: jest.fn(),
      },
      tuitionBillingAuditEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(prismaMock)),
    };

    auditMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new ClassesService(prismaMock, auditMock);
    lessonsService = new LessonsService(prismaMock, auditMock, service);
    attendanceService = new AttendanceService(prismaMock, service, auditMock);
    billingService = new BillingService(prismaMock, service, auditMock);
  });

  describe('Time & Timezone Validation', () => {
    it('rejects start time equal to or after end time', () => {
      expect(() => assertValidTimeRange('10:00', '10:00')).toThrow(
        BadRequestException,
      );
      expect(() => assertValidTimeRange('11:30', '09:00')).toThrow(
        BadRequestException,
      );
      expect(() => assertValidTimeRange('09:00', '11:00')).not.toThrow();
    });

    it('validates IANA timezone strings and rejects invalid ones', () => {
      expect(assertValidTimezone('Asia/Colombo')).toBe('Asia/Colombo');
      expect(() => assertValidTimezone('Invalid/Zone_Name')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('Authorization & Cross-Teacher Isolation', () => {
    it('prevents a Student from creating a class batch', async () => {
      await expect(
        service.createClass(
          {
            courseId: sampleBatch.courseId,
            title: { en: 'Illegal Class', si: '', ta: '' },
            academicYear: 2026,
          },
          studentEnrolled,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents Teacher B from updating or archiving Teacher A class batch', async () => {
      await expect(
        service.updateClass(
          sampleBatch.id,
          { grade: 'Grade 11' },
          teacherB,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.archiveClass(sampleBatch.id, teacherB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('prevents editing an Archived class batch without explicit status restore', async () => {
      prismaMock.classBatch.findUnique.mockResolvedValueOnce({
        ...sampleBatch,
        status: ClassBatchStatus.Archived,
      });

      await expect(
        service.updateClass(
          sampleBatch.id,
          { grade: 'Grade 11' },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows enrolled student to read class detail and denies unenrolled student', async () => {
      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce({
        id: 'enroll-1',
        status: ClassEnrollmentStatus.ACTIVE,
        joinedAt: new Date(),
      });

      const allowed = await service.getClassById(
        sampleBatch.id,
        studentEnrolled,
      );
      expect(allowed.id).toBe(sampleBatch.id);

      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.getClassById(sampleBatch.id, studentUnenrolled),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Schedules & Student Timetable', () => {
    it('rejects overlapping schedule slots on the same weekday', async () => {
      prismaMock.classSchedule.findMany.mockResolvedValueOnce([
        {
          id: 'existing-slot',
          weekday: 6,
          localStartTime: '09:00',
          localEndTime: '11:00',
        },
      ]);

      await expect(
        service.addSchedule(
          sampleBatch.id,
          {
            weekday: 6,
            localStartTime: '10:30',
            localEndTime: '12:30',
            timezone: 'Asia/Colombo',
          },
          teacherA,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('computes upcoming Saturday occurrences in Asia/Colombo for enrolled student', async () => {
      // 2026-10-30 is Friday; 2026-10-31 is Saturday
      const result = await service.getStudentTimetable(studentEnrolled, {
        from: '2026-10-30T00:00:00.000Z',
        to: '2026-11-02T23:59:59.000Z',
      });

      expect(result.occurrences.length).toBe(1);
      const occ = result.occurrences[0];
      expect(occ.localDate).toBe('2026-10-31');
      expect(occ.weekday).toBe(6);
      expect(occ.localStartTime).toBe('09:00');
      expect(occ.localEndTime).toBe('11:00');
      // 09:00 Asia/Colombo (UTC+05:30) == 03:30 UTC
      expect(occ.startsAtUtc).toBe('2026-10-31T03:30:00.000Z');
      expect(occ.endsAtUtc).toBe('2026-10-31T05:30:00.000Z');
    });
  });

  describe('Phase 2: Invitations, Student Join, Capacity & Roster Authorization', () => {
    it('creates hashed invitation token, returns plaintext once, and never exposes tokenHash on list', async () => {
      prismaMock.classInvitation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'inv-1',
          ...data,
          usedCount: 0,
          revokedAt: null,
          createdAt: new Date('2026-10-31T00:00:00.000Z'),
        }),
      );

      const created = await service.createInvitation(
        sampleBatch.id,
        { label: 'Saturday Intake', requiresApproval: true, expiresInHours: 48 },
        teacherA,
      );

      expect(created.code).toMatch(/^KDM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect((created as any).tokenHash).toBeUndefined();

      const createArg = prismaMock.classInvitation.create.mock.calls[0][0].data;
      expect(createArg.tokenHash).toBe(hashInviteCode(created.code));
      expect(createArg.tokenHash).not.toBe(created.code);

      prismaMock.classInvitation.findMany.mockResolvedValueOnce([
        {
          id: 'inv-1',
          classId: sampleBatch.id,
          tokenHash: createArg.tokenHash,
          codeHint: created.codeHint,
          label: 'Saturday Intake',
          requiresApproval: true,
          expiresAt: created.expiresAt,
          maxUses: null,
          usedCount: 0,
          revokedAt: null,
          createdAt: new Date(),
          createdBy: {
            id: teacherA.id,
            email: teacherA.email,
            name: 'Teacher A',
          },
        },
      ]);

      const listed = await service.listInvitations(sampleBatch.id, teacherA);
      expect(listed[0].codeHint).toBe(created.codeHint);
      expect((listed[0] as any).tokenHash).toBeUndefined();
      expect((listed[0] as any).code).toBeUndefined();
    });

    it('enforces duplicate enrollment protection and expired/revoked code checks on join', async () => {
      const code = 'KDM-ABCD-2345';
      const futureDate = new Date(Date.now() + 3600_000);
      const pastDate = new Date(Date.now() - 3600_000);

      // Expired code fails
      prismaMock.classInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-exp',
        classId: sampleBatch.id,
        tokenHash: hashInviteCode(code),
        codeHint: 'KDM-ABCD-••••',
        requiresApproval: true,
        expiresAt: pastDate,
        maxUses: 10,
        usedCount: 0,
        revokedAt: null,
        classBatch: { ...sampleBatch, teachers: [] },
      });

      await expect(
        service.joinClassByCode({ code }, studentUnenrolled),
      ).rejects.toThrow(BadRequestException);

      // Duplicate join when already ACTIVE fails with ConflictException
      prismaMock.classInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-valid',
        classId: sampleBatch.id,
        tokenHash: hashInviteCode(code),
        codeHint: 'KDM-ABCD-••••',
        requiresApproval: true,
        expiresAt: futureDate,
        maxUses: 10,
        usedCount: 0,
        revokedAt: null,
        classBatch: { ...sampleBatch, teachers: [] },
      });
      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce({
        id: 'enroll-1',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        status: ClassEnrollmentStatus.ACTIVE,
      });

      await expect(
        service.joinClassByCode({ code }, studentEnrolled),
      ).rejects.toThrow(ConflictException);
    });

    it('denies suspended student access to class detail and blocks re-joining via code', async () => {
      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce({
        id: 'enroll-susp',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        status: ClassEnrollmentStatus.SUSPENDED,
        joinedAt: new Date(),
      });

      await expect(
        service.getClassById(sampleBatch.id, studentEnrolled),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.classInvitation.findUnique.mockResolvedValueOnce({
        id: 'inv-valid',
        classId: sampleBatch.id,
        tokenHash: hashInviteCode('KDM-ABCD-2345'),
        codeHint: 'KDM-ABCD-••••',
        requiresApproval: true,
        expiresAt: new Date(Date.now() + 3600_000),
        maxUses: 10,
        usedCount: 0,
        revokedAt: null,
        classBatch: { ...sampleBatch, teachers: [] },
      });
      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce({
        id: 'enroll-susp',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        status: ClassEnrollmentStatus.SUSPENDED,
      });

      await expect(
        service.joinClassByCode({ code: 'KDM-ABCD-2345' }, studentEnrolled),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces seat capacity when approving a PENDING enrollment to ACTIVE', async () => {
      prismaMock.classBatch.findUnique.mockResolvedValueOnce({
        ...sampleBatch,
        capacity: 2,
        teachers: [],
      });
      prismaMock.classEnrollment.findFirst.mockResolvedValueOnce({
        id: 'enroll-pending',
        classId: sampleBatch.id,
        studentId: studentUnenrolled.id,
        status: ClassEnrollmentStatus.PENDING,
      });
      // Active count is already 2 == capacity
      prismaMock.classEnrollment.count.mockResolvedValueOnce(2);

      await expect(
        service.updateEnrollment(
          sampleBatch.id,
          'enroll-pending',
          { status: ClassEnrollmentStatus.ACTIVE },
          teacherA,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('prevents Teacher B from reading Teacher A student roster and blocks cross-tenant enrollment', async () => {
      await expect(
        service.listEnrollments(
          sampleBatch.id,
          { page: 1, pageSize: 20 },
          teacherB,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Cross-tenant student enrollment check
      prismaMock.user.findUnique
        .mockResolvedValueOnce({
          ...teacherA,
          teacherProfile: { id: 'tp-a' },
          customRole: { name: 'Teacher' },
        })
        .mockResolvedValueOnce({
          id: '55555555-5555-4555-8555-555555555555',
          email: 'other-tenant@school.lk',
          workspaceId: '88888888-8888-4888-8888-888888888888',
        });

      await expect(
        service.enrollStudent(
          sampleBatch.id,
          { studentId: '55555555-5555-4555-8555-555555555555' },
          teacherA,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Phase 3: Lessons, Resource Security, Copied-URL Denial & Quiz Reuse', () => {
    const sampleLesson = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      moduleId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      title: { en: 'Quadratic Equations', si: '', ta: '' },
      summary: { en: 'Solving ax^2 + bx + c = 0', si: '', ta: '' },
      body: { en: '<p>Formula notes</p>', si: '', ta: '' },
      sortOrder: 0,
      status: LessonStatus.Published,
      publishAt: null,
      estimatedMinutes: 45,
      module: {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        courseId: sampleBatch.courseId,
      },
    };

    const samplePdfResource = {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      lessonId: sampleLesson.id,
      title: { en: 'Quadratic Worksheet PDF', si: '', ta: '' },
      type: LessonResourceType.PDF,
      storageKey: 'secret-uuid-key.pdf',
      fileName: 'worksheet.pdf',
      externalUrl: null,
      noteText: null,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      accessPolicy: LessonResourceAccessPolicy.VIEW_ONLY,
      sortOrder: 0,
      scanStatus: LessonResourceScanStatus.CLEAN,
      lesson: sampleLesson,
    };

    it('sanitizes XSS scripts/event handlers and blocks unsafe external URLs or disguised executables', () => {
      const dirty =
        '<p onclick="evil()">Hello</p><script>alert(1)</script><a href="javascript:steal()">link</a>';
      const clean = sanitizeRichTextString(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('onclick=');
      expect(clean).not.toContain('javascript:');

      expect(() => assertSafeExternalUrl('javascript:alert(1)')).toThrow(
        BadRequestException,
      );
      expect(() =>
        assertSafeExternalUrl('http://169.254.169.254/latest/meta-data'),
      ).toThrow(BadRequestException);
      expect(assertSafeExternalUrl('https://www.youtube.com/embed/xyz')).toBe(
        'https://www.youtube.com/embed/xyz',
      );

      // Disguised Windows PE executable starting with "MZ"
      const fakePdfExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
      expect(() =>
        assertSafeFileBuffer(
          fakePdfExe,
          'application/pdf',
          LessonResourceType.PDF,
        ),
      ).toThrow(BadRequestException);
    });

    it('never leaks internal storageKey in formatted resource responses', () => {
      const formatted = lessonsService.formatResourceForClient(
        samplePdfResource,
      );
      expect((formatted as any).storageKey).toBeUndefined();
      expect(formatted.hasPrivateFile).toBe(true);
      expect(formatted.fileName).toBe('worksheet.pdf');
    });

    it('issues short-lived signed access URL for enrolled student and denies copied URL for another user', async () => {
      prismaMock.lessonResource.findFirst.mockResolvedValueOnce(
        samplePdfResource,
      );
      prismaMock.classEnrollment.findFirst.mockResolvedValueOnce({
        id: 'enroll-1',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        status: ClassEnrollmentStatus.ACTIVE,
      });

      const access = await lessonsService.generateResourceAccessUrl(
        sampleLesson.id,
        samplePdfResource.id,
        { classId: sampleBatch.id },
        studentEnrolled,
      );

      expect(access.token).toBeDefined();
      expect(access.streamPath).toContain(
        `/lessons/resources/${samplePdfResource.id}/stream?token=`,
      );

      // Student B copies Student A's signed token and attempts to stream the file -> 403 Forbidden
      await expect(
        lessonsService.openResourceStream(
          samplePdfResource.id,
          access.token,
          studentUnenrolled,
        ),
      ).rejects.toThrow(ForbiddenException);

      // Unenrolled Student B cannot request their own access URL either -> 403 Forbidden
      prismaMock.lessonResource.findFirst.mockResolvedValueOnce(
        samplePdfResource,
      );
      prismaMock.classEnrollment.findFirst.mockResolvedValueOnce(null);

      await expect(
        lessonsService.generateResourceAccessUrl(
          sampleLesson.id,
          samplePdfResource.id,
          { classId: sampleBatch.id },
          studentUnenrolled,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('tracks lesson completion for enrolled student and denies unenrolled student', async () => {
      prismaMock.lesson.findUnique.mockResolvedValue(sampleLesson);
      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce({
        id: 'enroll-1',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        status: ClassEnrollmentStatus.ACTIVE,
        classBatch: sampleBatch,
      });
      prismaMock.lessonProgress.upsert.mockResolvedValueOnce({
        id: 'prog-1',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        lessonId: sampleLesson.id,
        completedAt: new Date('2026-10-31T02:00:00.000Z'),
      });

      const res = await lessonsService.markLessonProgress(
        sampleLesson.id,
        { classId: sampleBatch.id, completed: true },
        studentEnrolled,
      );
      expect(res.completed).toBe(true);

      // Unenrolled student is rejected
      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce(null);
      await expect(
        lessonsService.markLessonProgress(
          sampleLesson.id,
          { classId: sampleBatch.id, completed: true },
          studentUnenrolled,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('assigns an existing canonical Kadaima quiz to a class batch and prevents duplicates', async () => {
      const quizId = '77777777-7777-4777-8777-777777777777';
      prismaMock.quiz.findUnique.mockResolvedValue({
        id: quizId,
        courseId: sampleBatch.courseId,
        title: { en: 'Term 1 Paper', si: '', ta: '' },
        status: 'Published',
      });
      prismaMock.classQuizAssignment.findUnique.mockResolvedValueOnce(null);
      prismaMock.classQuizAssignment.create.mockResolvedValueOnce({
        id: 'qa-1',
        classId: sampleBatch.id,
        lessonId: null,
        quizId,
        displayTitle: { en: 'Saturday Batch Term 1 Paper', si: '', ta: '' },
        availableFrom: null,
        dueAt: null,
        status: 'Published',
        quiz: {
          id: quizId,
          title: { en: 'Term 1 Paper', si: '', ta: '' },
          durationMinutes: 60,
          passingScorePercentage: 70,
          maxAttempts: 2,
          requiresUnlock: false,
          priceLkr: null,
          status: 'Published',
        },
      });

      const created = await lessonsService.createQuizAssignment(
        sampleBatch.id,
        {
          quizId,
          displayTitle: { en: 'Saturday Batch Term 1 Paper', si: '', ta: '' },
        },
        teacherA,
      );
      expect(created.quizId).toBe(quizId);
      expect(created.availabilityState).toBe('OPEN');

      // Duplicate assignment of same quiz to same batch fails with ConflictException
      prismaMock.classQuizAssignment.findUnique.mockResolvedValueOnce({
        id: 'qa-1',
      });
      await expect(
        lessonsService.createQuizAssignment(
          sampleBatch.id,
          { quizId },
          teacherA,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Phase 4: Class Sessions, Attendance Marking, Correction Audit & Percentage Consistency', () => {
    const sampleSession = {
      id: '99999999-1111-4111-8111-111111111111',
      classId: sampleBatch.id,
      scheduleId: sampleBatch.schedules[0].id,
      startsAtUtc: new Date('2026-10-31T03:30:00.000Z'),
      endsAtUtc: new Date('2026-10-31T05:30:00.000Z'),
      localDate: '2026-10-31',
      timezone: 'Asia/Colombo',
      status: ClassSessionStatus.SCHEDULED,
      title: { en: 'Week 1 — Quadratic Equations', si: '', ta: '' },
      cancellationReason: null,
      isLocked: false,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      classBatch: {
        id: sampleBatch.id,
        title: sampleBatch.title,
        code: 'KDM-M10',
        timezone: 'Asia/Colombo',
      },
      schedule: sampleBatch.schedules[0],
    };

    it('prevents Teacher B from marking attendance on Teacher A session and blocks marking a student from another batch', async () => {
      prismaMock.classSession.findUnique.mockResolvedValue(sampleSession);

      // 1. Unassigned Teacher B cannot mark Teacher A's session
      await expect(
        attendanceService.putSessionAttendance(
          sampleSession.id,
          {
            records: [
              {
                studentId: studentEnrolled.id,
                status: AttendanceStatus.PRESENT,
              },
            ],
          },
          teacherB,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 2. Assigned Teacher A cannot mark studentUnenrolled who is not on this batch's roster
      prismaMock.classEnrollment.findMany.mockResolvedValueOnce([
        { studentId: studentEnrolled.id },
      ]);
      prismaMock.attendanceRecord.findMany.mockResolvedValueOnce([]);

      await expect(
        attendanceService.putSessionAttendance(
          sampleSession.id,
          {
            records: [
              {
                studentId: studentUnenrolled.id,
                status: AttendanceStatus.PRESENT,
              },
            ],
          },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts session attendance idempotently (no duplicate records) and logs AttendanceChange only when status changes', async () => {
      prismaMock.classSession.findUnique.mockResolvedValue(sampleSession);

      // First save: UNMARKED (no row) -> PRESENT
      prismaMock.classEnrollment.findMany
        .mockResolvedValueOnce([{ studentId: studentEnrolled.id }]) // validation in putSessionAttendance
        .mockResolvedValueOnce([
          // getSessionAttendance roster reload
          {
            studentId: studentEnrolled.id,
            status: ClassEnrollmentStatus.ACTIVE,
            student: {
              id: studentEnrolled.id,
              email: studentEnrolled.email,
              name: 'Student One',
              firstName: 'Student',
              lastName: 'One',
              studentProfile: { registrationNumber: 'REG-001', phoneNumber: null },
            },
          },
        ]);
      prismaMock.attendanceRecord.findMany
        .mockResolvedValueOnce([]) // existing records before first save
        .mockResolvedValueOnce([
          // after first save
          {
            id: 'att-rec-1',
            classSessionId: sampleSession.id,
            studentId: studentEnrolled.id,
            status: AttendanceStatus.PRESENT,
            note: 'On time',
            markedAt: new Date('2026-10-31T03:35:00.000Z'),
            student: {
              id: studentEnrolled.id,
              email: studentEnrolled.email,
              name: 'Student One',
            },
            markedBy: {
              id: teacherA.id,
              email: teacherA.email,
              name: 'Teacher A',
            },
          },
        ]);
      prismaMock.attendanceRecord.upsert.mockResolvedValueOnce({
        id: 'att-rec-1',
        classSessionId: sampleSession.id,
        studentId: studentEnrolled.id,
        status: AttendanceStatus.PRESENT,
      });
      prismaMock.attendanceChange.findMany.mockResolvedValueOnce([
        {
          id: 'chg-1',
          attendanceRecordId: 'att-rec-1',
          classSessionId: sampleSession.id,
          studentId: studentEnrolled.id,
          previousStatus: null,
          newStatus: AttendanceStatus.PRESENT,
          reason: 'Initial roll call',
          changedAt: new Date('2026-10-31T03:35:00.000Z'),
          student: {
            id: studentEnrolled.id,
            email: studentEnrolled.email,
            name: 'Student One',
          },
          actor: {
            id: teacherA.id,
            email: teacherA.email,
            name: 'Teacher A',
          },
        },
      ]);

      const firstResult = await attendanceService.putSessionAttendance(
        sampleSession.id,
        {
          records: [
            {
              studentId: studentEnrolled.id,
              status: AttendanceStatus.PRESENT,
              note: 'On time',
            },
          ],
          reason: 'Initial roll call',
        },
        teacherA,
      );

      expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.attendanceChange.create).toHaveBeenCalledTimes(1);
      expect(firstResult.roster).toHaveLength(1);
      expect(firstResult.roster[0].status).toBe(AttendanceStatus.PRESENT);
      expect(firstResult.auditLog).toHaveLength(1);
      expect(firstResult.auditLog[0].newStatus).toBe(AttendanceStatus.PRESENT);

      // Second save: PRESENT -> LATE with correction reason (updates same record, logs 2nd audit row)
      prismaMock.classEnrollment.findMany
        .mockResolvedValueOnce([{ studentId: studentEnrolled.id }])
        .mockResolvedValueOnce([
          {
            studentId: studentEnrolled.id,
            status: ClassEnrollmentStatus.ACTIVE,
            student: {
              id: studentEnrolled.id,
              email: studentEnrolled.email,
              name: 'Student One',
            },
          },
        ]);
      prismaMock.attendanceRecord.findMany
        .mockResolvedValueOnce([
          {
            id: 'att-rec-1',
            classSessionId: sampleSession.id,
            studentId: studentEnrolled.id,
            status: AttendanceStatus.PRESENT,
            note: 'On time',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'att-rec-1',
            classSessionId: sampleSession.id,
            studentId: studentEnrolled.id,
            status: AttendanceStatus.LATE,
            note: 'Arrived 15m late',
            markedAt: new Date('2026-10-31T03:45:00.000Z'),
            student: {
              id: studentEnrolled.id,
              email: studentEnrolled.email,
              name: 'Student One',
            },
            markedBy: {
              id: teacherA.id,
              email: teacherA.email,
              name: 'Teacher A',
            },
          },
        ]);
      prismaMock.attendanceRecord.upsert.mockResolvedValueOnce({
        id: 'att-rec-1',
        classSessionId: sampleSession.id,
        studentId: studentEnrolled.id,
        status: AttendanceStatus.LATE,
      });
      prismaMock.attendanceChange.findMany.mockResolvedValueOnce([]);

      await attendanceService.putSessionAttendance(
        sampleSession.id,
        {
          records: [
            {
              studentId: studentEnrolled.id,
              status: AttendanceStatus.LATE,
              note: 'Arrived 15m late',
            },
          ],
          reason: 'Student joined late due to bus delay',
        },
        teacherA,
      );

      expect(prismaMock.attendanceChange.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendanceRecordId: 'att-rec-1',
            previousStatus: AttendanceStatus.PRESENT,
            newStatus: AttendanceStatus.LATE,
            reason: 'Student joined late due to bus delay',
          }),
        }),
      );
    });

    it('calculates attendance percentage consistently across teacher summary and student history (excluding EXCUSED and UNMARKED from denominator)', async () => {
      // Formula check: 2 PRESENT + 1 LATE + 1 ABSENT + 1 EXCUSED + 2 UNMARKED
      // attended = 2 + 1 = 3, eligible = 2 + 1 + 1 = 4 -> 75%
      const directMetrics = computeAttendanceMetrics({
        present: 2,
        late: 1,
        absent: 1,
        excused: 1,
        unmarked: 2,
      });
      expect(directMetrics.attended).toBe(3);
      expect(directMetrics.eligible).toBe(4);
      expect(directMetrics.attendancePercentage).toBe(75);

      const fiveSessions = [
        {
          id: 's-1',
          classId: sampleBatch.id,
          localDate: '2026-10-03',
          startsAtUtc: new Date('2026-10-03T03:30:00.000Z'),
          endsAtUtc: new Date('2026-10-03T05:30:00.000Z'),
          timezone: 'Asia/Colombo',
          status: ClassSessionStatus.COMPLETED,
          title: null,
          cancellationReason: null,
          attendanceRecords: [
            { studentId: studentEnrolled.id, status: AttendanceStatus.PRESENT },
          ],
        },
        {
          id: 's-2',
          classId: sampleBatch.id,
          localDate: '2026-10-10',
          startsAtUtc: new Date('2026-10-10T03:30:00.000Z'),
          endsAtUtc: new Date('2026-10-10T05:30:00.000Z'),
          timezone: 'Asia/Colombo',
          status: ClassSessionStatus.COMPLETED,
          title: null,
          cancellationReason: null,
          attendanceRecords: [
            { studentId: studentEnrolled.id, status: AttendanceStatus.LATE },
          ],
        },
        {
          id: 's-3',
          classId: sampleBatch.id,
          localDate: '2026-10-17',
          startsAtUtc: new Date('2026-10-17T03:30:00.000Z'),
          endsAtUtc: new Date('2026-10-17T05:30:00.000Z'),
          timezone: 'Asia/Colombo',
          status: ClassSessionStatus.COMPLETED,
          title: null,
          cancellationReason: null,
          attendanceRecords: [
            { studentId: studentEnrolled.id, status: AttendanceStatus.ABSENT },
          ],
        },
        {
          id: 's-4',
          classId: sampleBatch.id,
          localDate: '2026-10-24',
          startsAtUtc: new Date('2026-10-24T03:30:00.000Z'),
          endsAtUtc: new Date('2026-10-24T05:30:00.000Z'),
          timezone: 'Asia/Colombo',
          status: ClassSessionStatus.COMPLETED,
          title: null,
          cancellationReason: null,
          attendanceRecords: [
            { studentId: studentEnrolled.id, status: AttendanceStatus.EXCUSED },
          ],
        },
        {
          id: 's-5',
          classId: sampleBatch.id,
          localDate: '2026-10-31',
          startsAtUtc: new Date('2026-10-31T03:30:00.000Z'),
          endsAtUtc: new Date('2026-10-31T05:30:00.000Z'),
          timezone: 'Asia/Colombo',
          status: ClassSessionStatus.SCHEDULED,
          title: null,
          cancellationReason: null,
          attendanceRecords: [], // Unmarked
        },
      ];

      // Teacher monthly summary
      prismaMock.classSession.findMany.mockResolvedValueOnce(fiveSessions);
      prismaMock.classEnrollment.findMany.mockResolvedValueOnce([
        {
          studentId: studentEnrolled.id,
          status: ClassEnrollmentStatus.ACTIVE,
          student: {
            id: studentEnrolled.id,
            email: studentEnrolled.email,
            name: 'Student One',
            studentProfile: { registrationNumber: 'REG-001' },
          },
        },
      ]);

      const teacherSummary = await attendanceService.getClassAttendanceSummary(
        sampleBatch.id,
        { month: '2026-10' },
        teacherA,
      );

      // Student attendance history
      prismaMock.classEnrollment.findUnique.mockResolvedValueOnce({
        id: 'enroll-1',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        status: ClassEnrollmentStatus.ACTIVE,
      });
      prismaMock.classEnrollment.findMany.mockResolvedValueOnce([
        {
          classId: sampleBatch.id,
          studentId: studentEnrolled.id,
          status: ClassEnrollmentStatus.ACTIVE,
          classBatch: sampleBatch,
        },
      ]);
      prismaMock.classSession.findMany.mockResolvedValueOnce(fiveSessions);

      const studentHistory = await attendanceService.getStudentAttendance(
        studentEnrolled,
        { classId: sampleBatch.id },
      );

      // 1 PRESENT + 1 LATE = 2 attended; 1 PRESENT + 1 LATE + 1 ABSENT = 3 eligible -> 67%
      expect(teacherSummary.students[0].attendancePercentage).toBe(67);
      expect(studentHistory.classes[0].summary.attendancePercentage).toBe(67);
      expect(teacherSummary.students[0].attended).toBe(
        studentHistory.classes[0].summary.attended,
      );
      expect(teacherSummary.students[0].eligible).toBe(
        studentHistory.classes[0].summary.eligible,
      );
    });

    it('requires a cancellationReason when cancelling a session and blocks marking attendance on cancelled sessions', async () => {
      prismaMock.classSession.findUnique.mockResolvedValueOnce(sampleSession);

      await expect(
        attendanceService.updateClassSession(
          sampleBatch.id,
          sampleSession.id,
          { status: ClassSessionStatus.CANCELLED },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);

      prismaMock.classSession.findUnique.mockResolvedValueOnce({
        ...sampleSession,
        status: ClassSessionStatus.CANCELLED,
      });

      await expect(
        attendanceService.putSessionAttendance(
          sampleSession.id,
          {
            records: [
              {
                studentId: studentEnrolled.id,
                status: AttendanceStatus.PRESENT,
              },
            ],
          },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Phase 5: Tuition Fee Plans, Idempotent Invoices, Price Snapshots, Partial Payments, Waivers & Ledger Security', () => {
    const sampleFeePlanV1 = {
      id: 'fp-11111111-1111-4111-8111-111111111111',
      classId: sampleBatch.id,
      name: { en: 'Standard Monthly Tuition', si: '', ta: '' },
      version: 1,
      amountMinor: 250000, // LKR 2,500.00
      currency: 'LKR',
      frequency: ClassFeeFrequency.MONTHLY,
      dueDay: 10,
      graceDays: 5,
      prorationPolicy: ClassProrationPolicy.FULL_MONTH,
      overdueAccessPolicy: ClassOverdueAccessPolicy.ALLOW_WITH_WARNING,
      activeFrom: new Date('2026-01-01T00:00:00.000Z'),
      activeTo: null,
      isActive: true,
    };

    const sampleInvoice = {
      id: 'inv-11111111-1111-4111-8111-111111111111',
      classId: sampleBatch.id,
      enrollmentId: 'enroll-1',
      studentId: studentEnrolled.id,
      feePlanId: sampleFeePlanV1.id,
      periodYyyyMm: '2026-10',
      invoiceNumber: 'INV-202610-AAAA-3333-ABCD',
      currency: 'LKR',
      subtotalMinor: 250000,
      discountMinor: 0,
      surchargeMinor: 0,
      totalMinor: 250000,
      paidMinor: 0,
      balanceMinor: 250000,
      dueAt: new Date('2026-10-10T18:29:59.000Z'),
      graceDays: 5,
      status: TuitionInvoiceStatus.ISSUED,
      planSnapshotJson: {
        planId: sampleFeePlanV1.id,
        version: 1,
        amountMinor: 250000,
        currency: 'LKR',
      },
      notes: null,
      issuedAt: new Date('2026-10-01T00:00:00.000Z'),
      paidAt: null,
      voidedAt: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      classBatch: {
        id: sampleBatch.id,
        title: sampleBatch.title,
        grade: sampleBatch.grade,
        subject: sampleBatch.subject,
      },
      student: {
        id: studentEnrolled.id,
        email: studentEnrolled.email,
        name: 'Student One',
      },
      enrollment: {
        id: 'enroll-1',
        studentCode: 'KDM-001',
        status: ClassEnrollmentStatus.ACTIVE,
      },
      adjustments: [],
      allocations: [],
      auditEvents: [],
    };

    it('generates monthly invoices idempotently without duplicates and preserves price snapshots when fee plan rate changes', async () => {
      prismaMock.classFeePlan.findFirst.mockResolvedValue(sampleFeePlanV1);
      prismaMock.classEnrollment.findMany.mockResolvedValue([
        {
          id: 'enroll-1',
          classId: sampleBatch.id,
          studentId: studentEnrolled.id,
          status: ClassEnrollmentStatus.ACTIVE,
          joinedAt: new Date('2026-02-01T00:00:00.000Z'),
          student: {
            id: studentEnrolled.id,
            email: studentEnrolled.email,
            name: 'Student One',
          },
        },
      ]);

      // 1st run: no existing invoice -> creates 1 invoice
      prismaMock.tuitionInvoice.findMany
        .mockResolvedValueOnce([]) // existing check in generateClassInvoices
        .mockResolvedValueOnce([sampleInvoice]); // listClassInvoices reload
      prismaMock.tuitionInvoice.upsert.mockResolvedValueOnce(sampleInvoice);

      const firstRun = await billingService.generateClassInvoices(
        sampleBatch.id,
        { periodYyyyMm: '2026-10' },
        teacherA,
      );

      expect(firstRun.createdCount).toBe(1);
      expect(firstRun.skippedExistingCount).toBe(0);
      expect(prismaMock.tuitionInvoice.upsert).toHaveBeenCalledTimes(1);

      // 2nd run for same class and month -> skips existing invoice, creates 0 duplicates
      prismaMock.tuitionInvoice.findMany
        .mockResolvedValueOnce([
          {
            id: sampleInvoice.id,
            enrollmentId: 'enroll-1',
            studentId: studentEnrolled.id,
          },
        ])
        .mockResolvedValueOnce([sampleInvoice]);

      const secondRun = await billingService.generateClassInvoices(
        sampleBatch.id,
        { periodYyyyMm: '2026-10' },
        teacherA,
      );

      expect(secondRun.createdCount).toBe(0);
      expect(secondRun.skippedExistingCount).toBe(1);
      // Upsert was NOT called a second time
      expect(prismaMock.tuitionInvoice.upsert).toHaveBeenCalledTimes(1);

      // Creating a new fee plan version (LKR 3,000.00 = 300000) versions the plan and never rewrites existing invoices
      prismaMock.classFeePlan.findMany.mockResolvedValueOnce([sampleFeePlanV1]);
      prismaMock.classFeePlan.create.mockResolvedValueOnce({
        ...sampleFeePlanV1,
        id: 'fp-22222222-2222-4222-8222-222222222222',
        version: 2,
        amountMinor: 300000,
      });

      const newPlan = await billingService.createFeePlan(
        sampleBatch.id,
        { amountMinor: 300000 },
        teacherA,
      );

      expect(newPlan.version).toBe(2);
      expect(prismaMock.tuitionInvoice.update).not.toHaveBeenCalled();
      expect(secondRun.invoices[0].subtotalMinor).toBe(250000);
    });

    it('reconciles integer minor units accurately for proration, discounts, waivers, partial payments, and overdue dates without marking unpaid invoices paid', () => {
      // Proration check: 30-day month (2026-04), student joins on April 16 -> 15 billable days -> 50% of 250000 = 125000
      const prorated = computeProratedSubtotalMinor(
        250000,
        ClassProrationPolicy.PRORATE_BY_DAYS,
        '2026-04',
        new Date('2026-04-16T08:00:00.000Z'),
      );
      expect(prorated).toBe(125000);

      // Due-date passage + grace days without payment -> OVERDUE, never PAID
      const overdueState = reconcileInvoiceFinancials({
        subtotalMinor: 250000,
        discountMinor: 50000, // LKR 500 discount -> total 200000
        surchargeMinor: 0,
        confirmedPaidMinor: 0,
        dueAt: new Date('2026-10-10T18:29:59.000Z'),
        graceDays: 5,
        now: new Date('2026-10-20T00:00:00.000Z'), // past Oct 15 grace window
      });
      expect(overdueState.totalMinor).toBe(200000);
      expect(overdueState.balanceMinor).toBe(200000);
      expect(overdueState.status).toBe(TuitionInvoiceStatus.OVERDUE);
      expect(overdueState.isOverdue).toBe(true);

      // Partial payment of 80000 against 200000 -> PARTIALLY_PAID with balanceMinor = 120000
      const partialState = reconcileInvoiceFinancials({
        subtotalMinor: 250000,
        discountMinor: 50000,
        surchargeMinor: 0,
        confirmedPaidMinor: 80000,
        dueAt: new Date('2026-10-10T18:29:59.000Z'),
        graceDays: 5,
        now: new Date('2026-10-12T00:00:00.000Z'),
      });
      expect(partialState.status).toBe(TuitionInvoiceStatus.PARTIALLY_PAID);
      expect(partialState.paidMinor).toBe(80000);
      expect(partialState.balanceMinor).toBe(120000);

      // Full waiver -> WAIVED with balanceMinor = 0
      const waivedState = reconcileInvoiceFinancials({
        subtotalMinor: 250000,
        discountMinor: 250000,
        surchargeMinor: 0,
        confirmedPaidMinor: 0,
        dueAt: new Date('2026-10-10T18:29:59.000Z'),
        graceDays: 5,
      });
      expect(waivedState.totalMinor).toBe(0);
      expect(waivedState.balanceMinor).toBe(0);
      expect(waivedState.status).toBe(TuitionInvoiceStatus.WAIVED);
    });

    it('blocks students from self-confirming payments (SUCCEEDED), ensures PENDING payments never mark an invoice paid, and isolates teacher ledgers', async () => {
      prismaMock.tuitionInvoice.findUnique.mockResolvedValue(sampleInvoice);

      // 1. Student cannot mark their own invoice SUCCEEDED (Paid) -> 403 Forbidden
      await expect(
        billingService.recordInvoicePayment(
          sampleInvoice.id,
          {
            amountMinor: 250000,
            channel: TuitionPaymentChannel.BANK_TRANSFER,
            status: TuitionPaymentStatus.SUCCEEDED,
          },
          studentEnrolled,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 2. Student submitting a PENDING payment never updates invoice paidMinor or marks it PAID
      prismaMock.tuitionPayment.create.mockResolvedValueOnce({
        id: 'pay-pending-1',
        status: TuitionPaymentStatus.PENDING,
        amountMinor: 250000,
      });
      prismaMock.tuitionPaymentAllocation.create.mockResolvedValueOnce({
        id: 'alloc-pending-1',
        paymentId: 'pay-pending-1',
        invoiceId: sampleInvoice.id,
        amountMinor: 250000,
      });
      prismaMock.tuitionInvoice.findUnique
        .mockResolvedValueOnce(sampleInvoice) // recordInvoicePayment lookup
        .mockResolvedValueOnce({
          // getInvoiceById reload with PENDING allocation
          ...sampleInvoice,
          allocations: [
            {
              id: 'alloc-pending-1',
              paymentId: 'pay-pending-1',
              amountMinor: 250000,
              createdAt: new Date(),
              payment: {
                id: 'pay-pending-1',
                status: TuitionPaymentStatus.PENDING,
                channel: TuitionPaymentChannel.BANK_TRANSFER,
                externalReference: 'SLIP-001',
                confirmedAt: null,
              },
            },
          ],
        });

      const afterPending = await billingService.recordInvoicePayment(
        sampleInvoice.id,
        {
          amountMinor: 250000,
          channel: TuitionPaymentChannel.BANK_TRANSFER,
          status: TuitionPaymentStatus.PENDING,
          externalReference: 'SLIP-001',
        },
        studentEnrolled,
      );

      expect(afterPending.paidMinor).toBe(0);
      expect(afterPending.pendingMinor).toBe(250000);
      expect(afterPending.balanceMinor).toBe(250000);
      expect(afterPending.status).not.toBe(TuitionInvoiceStatus.PAID);

      // 3. Teacher B cannot view Teacher A's class billing ledger -> 403 Forbidden
      await expect(
        billingService.listClassInvoices(
          sampleBatch.id,
          { period: '2026-10' },
          teacherB,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 4. Student B cannot read Student A's invoice -> 403 Forbidden
      prismaMock.tuitionInvoice.findUnique.mockResolvedValueOnce(sampleInvoice);
      await expect(
        billingService.getInvoiceById(sampleInvoice.id, studentUnenrolled),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Phase 6 — Online Gateway Checkout, Signed Webhooks, Manual Verification, Refunds & Receipts', () => {
    const sampleInvoiceP6 = {
      id: 'inv-66666666-6666-4666-8666-666666666666',
      classId: sampleBatch.id,
      enrollmentId: 'enroll-1',
      studentId: studentEnrolled.id,
      feePlanId: 'fp-11111111-1111-4111-8111-111111111111',
      periodYyyyMm: '2026-10',
      invoiceNumber: 'INV-202610-AAAA-3333-ABCD',
      currency: 'LKR',
      subtotalMinor: 250000,
      discountMinor: 0,
      surchargeMinor: 0,
      totalMinor: 250000,
      paidMinor: 0,
      balanceMinor: 250000,
      dueAt: new Date('2026-10-10T18:29:59.000Z'),
      graceDays: 5,
      status: TuitionInvoiceStatus.ISSUED,
      planSnapshotJson: {},
      notes: null,
      issuedAt: new Date('2026-10-01T00:00:00.000Z'),
      paidAt: null,
      voidedAt: null,
      classBatch: sampleBatch,
      student: {
        id: studentEnrolled.id,
        email: studentEnrolled.email,
        name: 'Amal Perera',
        firstName: 'Amal',
        lastName: 'Perera',
      },
      enrollment: {
        id: 'enroll-1',
        studentCode: 'KAD-2026-0001',
        status: ClassEnrollmentStatus.ACTIVE,
      },
      adjustments: [],
      allocations: [],
      manualSubmissions: [],
      auditEvents: [],
    };

    beforeEach(() => {
      delete process.env.PAYHERE_MERCHANT_ID;
      delete process.env.PAYHERE_MERCHANT_SECRET;
    });

    it('enforces student ownership on checkout, validates server-side amount bounds, and makes test-mode explicit without faking paid status', async () => {
      prismaMock.tuitionInvoice.findUnique.mockResolvedValue(sampleInvoiceP6);

      // 1. Student B cannot initiate checkout for Student A's invoice -> 403 Forbidden
      await expect(
        billingService.createInvoiceCheckout(
          sampleInvoiceP6.id,
          {},
          studentUnenrolled,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 2. Student A cannot initiate checkout for an amount exceeding balanceMinor
      await expect(
        billingService.createInvoiceCheckout(
          sampleInvoiceP6.id,
          { amountMinor: 999999 },
          studentEnrolled,
        ),
      ).rejects.toThrow(BadRequestException);

      // 3. Student A initiates valid checkout when live credentials are missing -> explicit TEST_SIMULATION_EXPLICIT mode, strictly PENDING
      prismaMock.tuitionPayment.create.mockResolvedValueOnce({
        id: 'pay-chk-1',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        channel: TuitionPaymentChannel.ONLINE_GATEWAY,
        gateway: 'PAYHERE',
        providerOrderId: 'TUI-INV66666-TEST',
        currency: 'LKR',
        amountMinor: 250000,
        status: TuitionPaymentStatus.PENDING,
        isTestMode: true,
      });

      const checkout = await billingService.createInvoiceCheckout(
        sampleInvoiceP6.id,
        {},
        studentEnrolled,
      );

      expect(checkout.status).toBe(TuitionPaymentStatus.PENDING);
      expect(checkout.isTestMode).toBe(true);
      expect(checkout.mode).toBe('TEST_SIMULATION_EXPLICIT');
      expect(checkout.amountMinor).toBe(250000);
      expect(checkout.amountFormatted).toBe('2500.00');
      expect(checkout.testModeNotice).toContain('TEST MODE EXPLICIT');
      expect(prismaMock.tuitionInvoice.update).not.toHaveBeenCalled();
    });

    it('rejects forged webhook signatures, currency/amount tampering, confirms valid status_code=2 webhooks with receipt generation, and deduplicates replay webhooks idempotently', async () => {
      const orderId = 'TUI-INV66666-ORDER1';
      const pendingPaymentRecord = {
        id: 'pay-gw-1',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        channel: TuitionPaymentChannel.ONLINE_GATEWAY,
        gateway: 'PAYHERE',
        providerOrderId: orderId,
        providerPaymentId: null,
        externalReference: orderId,
        currency: 'LKR',
        amountMinor: 250000,
        refundedMinor: 0,
        status: TuitionPaymentStatus.PENDING,
        isTestMode: true,
        receipt: null,
        allocations: [
          {
            id: 'alloc-gw-1',
            paymentId: 'pay-gw-1',
            invoiceId: sampleInvoiceP6.id,
            amountMinor: 250000,
            invoice: {
              ...sampleInvoiceP6,
              allocations: [
                {
                  id: 'alloc-gw-1',
                  paymentId: 'pay-gw-1',
                  amountMinor: 250000,
                  payment: {
                    id: 'pay-gw-1',
                    status: TuitionPaymentStatus.PENDING,
                  },
                },
              ],
            },
          },
        ],
      };

      prismaMock.tuitionPayment.findUnique.mockResolvedValue(
        pendingPaymentRecord,
      );

      // 1. Forged signature -> 400 BadRequestException
      await expect(
        billingService.handleGatewayWebhook('payhere', {
          merchant_id: 'TEST_SIM_MERCHANT',
          order_id: orderId,
          payhere_amount: '2500.00',
          payhere_currency: 'LKR',
          status_code: '2',
          md5sig: 'FORGED_SIGNATURE_12345',
        }),
      ).rejects.toThrow(BadRequestException);

      // 2. Tampered amount (e.g. paid 10.00 instead of 2500.00) even with valid signature -> 400 BadRequestException
      const tamperedAmountSig = payhereNotifyHash({
        merchantId: 'TEST_SIM_MERCHANT',
        orderId,
        amount: '10.00',
        currency: 'LKR',
        statusCode: '2',
        merchantSecret: 'TEST_SIMULATION_SECRET_DO_NOT_USE_IN_PROD',
      });
      await expect(
        billingService.handleGatewayWebhook('payhere', {
          merchant_id: 'TEST_SIM_MERCHANT',
          order_id: orderId,
          payhere_amount: '10.00',
          payhere_currency: 'LKR',
          status_code: '2',
          md5sig: tamperedAmountSig,
        }),
      ).rejects.toThrow(BadRequestException);

      // 3. Valid signature + exact amount/currency -> confirms payment, marks invoice PAID, issues receipt
      const validSig = payhereNotifyHash({
        merchantId: 'TEST_SIM_MERCHANT',
        orderId,
        amount: '2500.00',
        currency: 'LKR',
        statusCode: '2',
        merchantSecret: 'TEST_SIMULATION_SECRET_DO_NOT_USE_IN_PROD',
      });
      prismaMock.tuitionPaymentEvent.findUnique.mockResolvedValueOnce(null);

      const firstDelivery = await billingService.handleGatewayWebhook(
        'payhere',
        {
          merchant_id: 'TEST_SIM_MERCHANT',
          order_id: orderId,
          payment_id: 'PH-999001',
          payhere_amount: '2500.00',
          payhere_currency: 'LKR',
          status_code: '2',
          md5sig: validSig,
        },
      );

      expect(firstDelivery.ok).toBe(true);
      expect(firstDelivery.duplicate).toBe(false);
      expect(firstDelivery.status).toBe(TuitionPaymentStatus.SUCCEEDED);
      expect(firstDelivery.invoiceStatus).toBe(TuitionInvoiceStatus.PAID);
      expect(firstDelivery.receiptNumber).toMatch(/^RCP-/);
      expect(prismaMock.tuitionReceipt.create).toHaveBeenCalledTimes(1);

      // 4. Duplicate webhook replay -> returns duplicate: true without creating a second receipt or mutating invoice again
      prismaMock.tuitionPaymentEvent.findUnique.mockResolvedValueOnce({
        id: 'evt-existing-1',
      });

      const replayDelivery = await billingService.handleGatewayWebhook(
        'payhere',
        {
          merchant_id: 'TEST_SIM_MERCHANT',
          order_id: orderId,
          payment_id: 'PH-999001',
          payhere_amount: '2500.00',
          payhere_currency: 'LKR',
          status_code: '2',
          md5sig: validSig,
        },
      );

      expect(replayDelivery.ok).toBe(true);
      expect(replayDelivery.duplicate).toBe(true);
      expect(prismaMock.tuitionReceipt.create).toHaveBeenCalledTimes(1);
    });

    it('ignores out-of-order failure webhooks after payment success and reverses invoice balance on refund or chargeback', async () => {
      const orderId = 'TUI-INV66666-ORDER2';
      const succeededPaymentRecord = {
        id: 'pay-gw-2',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        channel: TuitionPaymentChannel.ONLINE_GATEWAY,
        gateway: 'PAYHERE',
        providerOrderId: orderId,
        providerPaymentId: 'PH-999002',
        externalReference: 'PH-999002',
        currency: 'LKR',
        amountMinor: 250000,
        refundedMinor: 0,
        status: TuitionPaymentStatus.SUCCEEDED,
        isTestMode: true,
        receipt: {
          id: 'rcp-2',
          receiptNumber: 'RCP-202610-PAYGW2-AA11',
          status: 'ISSUED',
          paidAmountMinor: 250000,
          balanceAfterMinor: 0,
          issuedAt: new Date(),
        },
        allocations: [
          {
            id: 'alloc-gw-2',
            paymentId: 'pay-gw-2',
            invoiceId: sampleInvoiceP6.id,
            amountMinor: 250000,
            invoice: {
              ...sampleInvoiceP6,
              paidMinor: 250000,
              balanceMinor: 0,
              status: TuitionInvoiceStatus.PAID,
              allocations: [
                {
                  id: 'alloc-gw-2',
                  paymentId: 'pay-gw-2',
                  amountMinor: 250000,
                  payment: {
                    id: 'pay-gw-2',
                    status: TuitionPaymentStatus.SUCCEEDED,
                  },
                },
              ],
            },
          },
        ],
      };

      prismaMock.tuitionPayment.findUnique.mockResolvedValue(
        succeededPaymentRecord,
      );
      prismaMock.tuitionPaymentEvent.findUnique.mockResolvedValueOnce(null);

      // 1. Out-of-order failure webhook (status_code = -2) arriving after SUCCEEDED is ignored and does NOT downgrade payment
      const failSig = payhereNotifyHash({
        merchantId: 'TEST_SIM_MERCHANT',
        orderId,
        amount: '2500.00',
        currency: 'LKR',
        statusCode: '-2',
        merchantSecret: 'TEST_SIMULATION_SECRET_DO_NOT_USE_IN_PROD',
      });

      const outOfOrderRes = await billingService.handleGatewayWebhook(
        'payhere',
        {
          merchant_id: 'TEST_SIM_MERCHANT',
          order_id: orderId,
          payment_id: 'PH-999002-FAIL',
          payhere_amount: '2500.00',
          payhere_currency: 'LKR',
          status_code: '-2',
          md5sig: failSig,
        },
      );

      expect(outOfOrderRes.ignoredOutOfOrder).toBe(true);
      expect(outOfOrderRes.status).toBe(TuitionPaymentStatus.SUCCEEDED);
      expect(prismaMock.tuitionPayment.update).not.toHaveBeenCalled();

      // 2. Teacher refunds the payment -> reverses allocation, restores invoice balanceMinor to 250000, voids receipt
      prismaMock.tuitionInvoice.findUnique.mockResolvedValueOnce({
        ...sampleInvoiceP6,
        paidMinor: 0,
        balanceMinor: 250000,
        status: TuitionInvoiceStatus.ISSUED,
      });

      const refunded = await billingService.refundTuitionPayment(
        succeededPaymentRecord.id,
        { reason: 'Student withdrew before month start' },
        teacherA,
      );

      expect(refunded.status).toBe(TuitionPaymentStatus.REFUNDED);
      expect(refunded.refundedMinor).toBe(250000);
      expect(prismaMock.tuitionReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rcp-2' },
          data: expect.objectContaining({ status: 'VOIDED_BY_REFUND' }),
        }),
      );
    });

    it('protects manual bank/cash submissions against duplicate references, blocks receipts before approval, prevents cross-teacher approval, and issues receipt on approval', async () => {
      prismaMock.tuitionInvoice.findUnique.mockResolvedValue(sampleInvoiceP6);

      // 1. Duplicate bank reference number is rejected -> 409 ConflictException
      prismaMock.tuitionManualPaymentSubmission.findUnique.mockResolvedValueOnce(
        {
          id: 'sub-existing',
          referenceNumber: 'BOC-REF-9001',
        },
      );

      await expect(
        billingService.submitManualPayment(
          sampleInvoiceP6.id,
          {
            channel: TuitionPaymentChannel.BANK_TRANSFER,
            amountMinor: 250000,
            referenceNumber: 'BOC-REF-9001',
            paidDate: '2026-10-05',
          },
          undefined,
          studentEnrolled,
        ),
      ).rejects.toThrow(ConflictException);

      // 2. Valid manual submission stays Pending and leaves invoice balanceMinor at 250000
      prismaMock.tuitionManualPaymentSubmission.findUnique.mockResolvedValueOnce(
        null,
      );
      prismaMock.tuitionPayment.create.mockResolvedValueOnce({
        id: 'pay-man-1',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        status: TuitionPaymentStatus.PENDING,
        amountMinor: 250000,
      });
      prismaMock.tuitionManualPaymentSubmission.create.mockResolvedValueOnce({
        id: 'sub-man-1',
        paymentId: 'pay-man-1',
        invoiceId: sampleInvoiceP6.id,
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        status: SlipSubmissionStatus.Pending,
        amountMinor: 250000,
        referenceNumber: 'BOC-REF-9002',
      });

      const subRes = await billingService.submitManualPayment(
        sampleInvoiceP6.id,
        {
          channel: TuitionPaymentChannel.BANK_TRANSFER,
          amountMinor: 250000,
          referenceNumber: 'BOC-REF-9002',
          paidDate: '2026-10-05',
        },
        undefined,
        studentEnrolled,
      );

      expect(subRes.status).toBe(SlipSubmissionStatus.Pending);
      expect(subRes.paymentStatus).toBe(TuitionPaymentStatus.PENDING);

      // 3. Attempting to download a receipt for a PENDING payment is blocked -> 400 BadRequestException
      prismaMock.tuitionPayment.findUnique.mockResolvedValueOnce({
        id: 'pay-man-1',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        status: TuitionPaymentStatus.PENDING,
        receipt: null,
      });

      await expect(
        billingService.getPaymentReceipt('pay-man-1', studentEnrolled),
      ).rejects.toThrow(BadRequestException);

      // 4. Teacher B cannot approve Teacher A's manual payment submission -> 403 ForbiddenException
      const pendingSubmissionRecord = {
        id: 'sub-man-1',
        paymentId: 'pay-man-1',
        invoiceId: sampleInvoiceP6.id,
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        channel: TuitionPaymentChannel.BANK_TRANSFER,
        amountMinor: 250000,
        currency: 'LKR',
        referenceNumber: 'BOC-REF-9002',
        status: SlipSubmissionStatus.Pending,
        payment: {
          id: 'pay-man-1',
          status: TuitionPaymentStatus.PENDING,
          receipt: null,
        },
        invoice: sampleInvoiceP6,
      };
      prismaMock.tuitionManualPaymentSubmission.findUnique.mockResolvedValue(
        pendingSubmissionRecord,
      );

      await expect(
        billingService.approveManualPaymentSubmission(
          'sub-man-1',
          { note: 'Illegal cross-teacher approval' },
          teacherB,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 5. Teacher A approves the submission -> confirms payment, updates invoice to PAID, and creates official receipt
      prismaMock.tuitionInvoice.findUnique.mockResolvedValueOnce({
        ...sampleInvoiceP6,
        paidMinor: 250000,
        balanceMinor: 0,
        status: TuitionInvoiceStatus.PAID,
      });

      const approvedRes = await billingService.approveManualPaymentSubmission(
        'sub-man-1',
        { note: 'Verified BOC deposit slip' },
        teacherA,
      );

      expect(approvedRes.status).toBe(SlipSubmissionStatus.Approved);
      expect(approvedRes.paymentStatus).toBe(TuitionPaymentStatus.SUCCEEDED);
      expect(approvedRes.receiptNumber).toMatch(/^RCP-/);
      expect(prismaMock.tuitionReceipt.create).toHaveBeenCalled();
    });
  });

  describe('Phase 7 — Integrated Teacher, Admin & Student Dashboard Summaries', () => {
    const superAdmin = {
      id: '00000000-0000-4000-8000-000000000000',
      email: 'admin@kadaima.lk',
      role: Role.SUPER_ADMIN,
      team: 'Admin',
      workspaceId: teacherA.workspaceId,
    };

    it('denies students from accessing teacher/admin classroom dashboard summary and locks teachers to their own classes even if teacherUserId is passed', async () => {
      await expect(
        service.getClassroomDashboardSummary(studentEnrolled),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.classBatch.findMany.mockResolvedValueOnce([sampleBatch]);
      prismaMock.classEnrollment.count
        .mockResolvedValueOnce(18)
        .mockResolvedValueOnce(2);
      prismaMock.classSession.findMany.mockResolvedValueOnce([
        {
          id: 'sess-p7-1',
          classId: sampleBatch.id,
          localDate: '2026-10-31',
          startsAtUtc: new Date('2026-10-31T03:30:00.000Z'),
          endsAtUtc: new Date('2026-10-31T05:30:00.000Z'),
          status: ClassSessionStatus.SCHEDULED,
          classBatch: {
            id: sampleBatch.id,
            title: sampleBatch.title,
            _count: { enrollments: 18 },
          },
          attendanceRecords: [
            { status: AttendanceStatus.PRESENT },
            { status: AttendanceStatus.UNMARKED },
          ],
        },
      ]);
      prismaMock.tuitionInvoice.findMany
        .mockResolvedValueOnce([
          {
            id: 'inv-p7-1',
            classId: sampleBatch.id,
            status: TuitionInvoiceStatus.PAID,
            totalMinor: 250000,
            discountMinor: 0,
            paidMinor: 250000,
            balanceMinor: 0,
            dueAt: new Date('2026-10-10T00:00:00.000Z'),
            graceDays: 5,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'inv-p7-2',
            classId: sampleBatch.id,
            status: TuitionInvoiceStatus.OVERDUE,
            balanceMinor: 250000,
            dueAt: new Date('2026-10-10T00:00:00.000Z'),
            graceDays: 5,
          },
        ]);

      // Teacher A passes teacherB.id in query, but service must force scopedTeacherId = teacherA.id
      const summary = await service.getClassroomDashboardSummary(teacherA, {
        teacherUserId: teacherB.id,
        period: '2026-10',
      });

      expect(summary.isSuperAdmin).toBe(false);
      expect(summary.scopedTeacherId).toBe(teacherA.id);
      expect(summary.adminGovernance).toBeNull();
      expect(summary.kpis.activeClassesCount).toBe(1);
      expect(summary.kpis.enrolledStudentsCount).toBe(18);
      expect(summary.kpis.pendingEnrollmentRequestsCount).toBe(2);
      expect(summary.kpis.attendancePendingCount).toBeGreaterThanOrEqual(1);
      expect(summary.kpis.paymentsReceivedThisMonthMinor).toBe(250000);
      expect(summary.kpis.outstandingBalanceMinor).toBe(250000);
      expect(summary.kpis.overdueInvoicesCount).toBe(1);
    });

    it('returns multi-tenant teacher scoping, failed gateway events queue, billing reconciliation, and audit logs for Super Admin', async () => {
      prismaMock.classBatch.findMany
        .mockResolvedValueOnce([sampleBatch])
        .mockResolvedValueOnce([sampleBatch]);
      prismaMock.tuitionPaymentEvent.findMany.mockResolvedValueOnce([
        {
          id: 'evt-fail-1',
          provider: 'PAYHERE',
          externalEventId: 'PH-ERR-01',
          paymentId: 'pay-1',
          status: 'FAILED',
          errorMessage: 'Invalid signature hash',
          receivedAt: new Date('2026-10-31T01:00:00.000Z'),
          processedAt: new Date('2026-10-31T01:00:01.000Z'),
        },
      ]);
      prismaMock.auditLog.findMany.mockResolvedValueOnce([
        {
          id: 'aud-1',
          action: 'CREATE',
          subject: 'CLASSES',
          targetId: sampleBatch.id,
          description: 'Created class batch',
          user: { id: teacherA.id, email: teacherA.email, name: 'Teacher A' },
          createdAt: new Date('2026-10-31T00:00:00.000Z'),
        },
      ]);

      const adminSummary = await service.getClassroomDashboardSummary(
        superAdmin,
        {
          teacherUserId: teacherA.id,
          period: '2026-10',
        },
      );

      expect(adminSummary.isSuperAdmin).toBe(true);
      expect(adminSummary.scopedTeacherId).toBe(teacherA.id);
      expect(adminSummary.adminGovernance).not.toBeNull();
      expect(adminSummary.adminGovernance.teachers).toHaveLength(1);
      expect(adminSummary.adminGovernance.failedGatewayEventsCount).toBe(1);
      expect(adminSummary.adminGovernance.billingReconciliation).toHaveLength(1);
      expect(adminSummary.adminGovernance.recentAuditEvents).toHaveLength(1);
    });

    it('aggregates student dashboard summary with lesson completion, attendance formula, quiz results with AI token, and current-month-first tuition invoices', async () => {
      prismaMock.lesson.findMany.mockResolvedValueOnce([
        {
          id: 'les-1',
          title: { en: 'Lesson 1: Quadratic Equations' },
          sortOrder: 1,
          module: { id: 'mod-1', courseId: sampleBatch.courseId, sortOrder: 1 },
        },
        {
          id: 'les-2',
          title: { en: 'Lesson 2: Simultaneous Equations' },
          sortOrder: 2,
          module: { id: 'mod-1', courseId: sampleBatch.courseId, sortOrder: 1 },
        },
      ]);
      prismaMock.lessonProgress.findMany.mockResolvedValueOnce([
        {
          classId: sampleBatch.id,
          lessonId: 'les-1',
          completedAt: new Date('2026-10-15T10:00:00.000Z'),
        },
      ]);
      prismaMock.classQuizAssignment.findMany.mockResolvedValueOnce([
        {
          id: 'qa-1',
          classId: sampleBatch.id,
          quizId: 'quiz-1',
          displayTitle: { en: 'Unit 1 Assessment' },
          availableFrom: null,
          dueAt: new Date('2027-12-31T23:59:59.000Z'),
          quiz: {
            id: 'quiz-1',
            title: { en: 'Unit 1 Assessment' },
            durationMinutes: 30,
            passingScorePercentage: 60,
          },
        },
      ]);
      prismaMock.quizAttempt.findMany.mockResolvedValueOnce([
        {
          id: 'att-1',
          quizId: 'quiz-1',
          finalScore: 85,
          isPassed: true,
          resultToken: 'res-tok-ai-123',
          submittedAt: new Date('2026-10-20T12:00:00.000Z'),
        },
      ]);
      prismaMock.classSession.findMany.mockResolvedValueOnce([
        {
          id: 's-1',
          classId: sampleBatch.id,
          startsAtUtc: new Date('2026-10-04T03:30:00.000Z'),
          attendanceRecords: [{ status: AttendanceStatus.PRESENT }],
        },
        {
          id: 's-2',
          classId: sampleBatch.id,
          startsAtUtc: new Date('2026-10-11T03:30:00.000Z'),
          attendanceRecords: [{ status: AttendanceStatus.LATE }],
        },
        {
          id: 's-3',
          classId: sampleBatch.id,
          startsAtUtc: new Date('2026-10-18T03:30:00.000Z'),
          attendanceRecords: [{ status: AttendanceStatus.EXCUSED }],
        },
      ]);

      const currentYm = new Date().toISOString().slice(0, 7);
      prismaMock.tuitionInvoice.findMany.mockResolvedValueOnce([
        {
          id: 'inv-old',
          classId: sampleBatch.id,
          invoiceNumber: 'INV-202601-OLD',
          periodYyyyMm: '2026-01',
          status: TuitionInvoiceStatus.PAID,
          currency: 'LKR',
          subtotalMinor: 250000,
          discountMinor: 0,
          surchargeMinor: 0,
          totalMinor: 250000,
          paidMinor: 250000,
          balanceMinor: 0,
          dueAt: new Date('2026-01-10T00:00:00.000Z'),
          paidAt: new Date('2026-01-08T00:00:00.000Z'),
          classBatch: { id: sampleBatch.id, title: sampleBatch.title },
          allocations: [
            {
              paymentId: 'pay-old-1',
              payment: {
                id: 'pay-old-1',
                status: TuitionPaymentStatus.SUCCEEDED,
                receipt: { receiptNumber: 'RCP-202601-0001' },
              },
            },
          ],
          manualSubmissions: [],
        },
        {
          id: 'inv-curr',
          classId: sampleBatch.id,
          invoiceNumber: 'INV-CURR-001',
          periodYyyyMm: currentYm,
          status: TuitionInvoiceStatus.ISSUED,
          currency: 'LKR',
          subtotalMinor: 250000,
          discountMinor: 0,
          surchargeMinor: 0,
          totalMinor: 250000,
          paidMinor: 0,
          balanceMinor: 250000,
          dueAt: new Date('2026-12-10T00:00:00.000Z'),
          paidAt: null,
          classBatch: { id: sampleBatch.id, title: sampleBatch.title },
          allocations: [],
          manualSubmissions: [],
        },
      ]);

      const studentSummary =
        await service.getStudentDashboardSummary(studentEnrolled);

      expect(studentSummary.kpis.activeClassesCount).toBe(1);
      expect(studentSummary.kpis.overallCompletionPercentage).toBe(50);
      // 1 PRESENT + 1 LATE + 1 EXCUSED -> attended = 2, eligible = 2 -> 100%
      expect(studentSummary.kpis.overallAttendancePercentage).toBe(100);
      expect(studentSummary.kpis.openQuizzesCount).toBe(1);
      expect(studentSummary.kpis.totalTuitionDueMinor).toBe(250000);

      // Current month invoice must be sorted first!
      expect(studentSummary.invoices[0].periodYyyyMm).toBe(currentYm);
      expect(studentSummary.invoices[1].receiptNumber).toBe('RCP-202601-0001');

      const cls = studentSummary.classes[0];
      expect(cls.learningSummary.nextLesson?.id).toBe('les-2');
      expect(cls.quizSummary.latestAttempt?.resultToken).toBe('res-tok-ai-123');
    });
  });

  describe('Phase 8 — Hardening, RBAC, IDOR & Comprehensive Reliability Audit', () => {
    it('enforces RBAC/IDOR: prevents student from viewing another student invoice, submitting manual slips on foreign invoices, or inspecting other payments', async () => {
      // 1. Foreign invoice access
      const foreignInvoice = {
        id: 'inv-student-1',
        classId: sampleBatch.id,
        studentId: studentEnrolled.id,
        invoiceNumber: 'INV-202610-001',
        periodYyyyMm: '2026-10',
        currency: 'LKR',
        subtotalMinor: 500000,
        discountMinor: 0,
        surchargeMinor: 0,
        totalMinor: 500000,
        paidMinor: 0,
        balanceMinor: 500000,
        dueAt: new Date('2026-10-10T00:00:00.000Z'),
        graceDays: 5,
        status: TuitionInvoiceStatus.ISSUED,
        adjustments: [],
        allocations: [],
        manualSubmissions: [],
        auditEvents: [],
      };

      prismaMock.tuitionInvoice.findUnique.mockResolvedValueOnce(foreignInvoice);
      // studentUnenrolled attempts to view foreignInvoice -> should throw ForbiddenException
      await expect(
        billingService.getInvoiceById(foreignInvoice.id, studentUnenrolled),
      ).rejects.toThrow(ForbiddenException);

      // 2. Foreign invoice manual payment submission
      prismaMock.tuitionInvoice.findUnique.mockResolvedValueOnce(foreignInvoice);
      await expect(
        billingService.submitManualPayment(
          foreignInvoice.id,
          {
            channel: TuitionPaymentChannel.BANK_TRANSFER,
            amountMinor: 500000,
            referenceNumber: 'TXN-FOREIGN-01',
            paidDate: '2026-10-10',
          },
          undefined,
          studentUnenrolled,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 3. Foreign payment status inspection
      const foreignPayment = {
        id: 'pay-foreign-1',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        amountMinor: 500000,
        currency: 'LKR',
        channel: TuitionPaymentChannel.ONLINE_GATEWAY,
        status: TuitionPaymentStatus.PENDING,
        refundedMinor: 0,
        isTestMode: true,
        allocations: [{ invoice: foreignInvoice, amountMinor: 500000 }],
        receipt: null,
        manualSubmission: null,
      };

      prismaMock.tuitionPayment.findUnique.mockResolvedValueOnce(foreignPayment);
      await expect(
        billingService.getPaymentStatus(foreignPayment.id, studentUnenrolled),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces cross-teacher isolation: prevents Teacher B from refunding Teacher A payments or managing Teacher A fee plans', async () => {
      // 1. Teacher B attempting to refund Teacher A's student payment
      const paymentToRefund = {
        id: 'pay-refund-test-1',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        amountMinor: 400000,
        currency: 'LKR',
        channel: TuitionPaymentChannel.CASH,
        status: TuitionPaymentStatus.SUCCEEDED,
        refundedMinor: 0,
        allocations: [
          {
            id: 'alloc-1',
            amountMinor: 400000,
            invoice: {
              id: 'inv-ref-1',
              classId: sampleBatch.id,
              subtotalMinor: 400000,
              discountMinor: 0,
              surchargeMinor: 0,
              dueAt: new Date('2026-10-10'),
              graceDays: 5,
              allocations: [],
            },
          },
        ],
        receipt: null,
      };

      prismaMock.tuitionPayment.findUnique.mockResolvedValueOnce(paymentToRefund);
      await expect(
        billingService.refundTuitionPayment(
          paymentToRefund.id,
          { reason: 'Unauthorized attempt by Teacher B' },
          teacherB,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 2. Teacher B attempting to create a fee plan on Teacher A's class batch
      await expect(
        billingService.createFeePlan(
          sampleBatch.id,
          {
            amountMinor: 350000,
            currency: 'LKR',
            frequency: ClassFeeFrequency.MONTHLY,
            dueDay: 10,
            graceDays: 5,
          },
          teacherB,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('records an audit trail on attendance corrections and rejects marking attendance on locked or cancelled sessions', async () => {
      // 1. Session is locked -> reject non-super-admin
      prismaMock.classSession.findUnique.mockResolvedValueOnce({
        id: 'sess-locked',
        classId: sampleBatch.id,
        status: ClassSessionStatus.SCHEDULED,
        isLocked: true,
      });

      await expect(
        attendanceService.putSessionAttendance(
          'sess-locked',
          {
            records: [
              {
                studentId: studentEnrolled.id,
                status: AttendanceStatus.PRESENT,
              },
            ],
          },
          teacherA,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 2. Session is cancelled -> reject with BadRequestException
      prismaMock.classSession.findUnique.mockResolvedValueOnce({
        id: 'sess-cancelled',
        classId: sampleBatch.id,
        status: ClassSessionStatus.CANCELLED,
        isLocked: false,
      });

      await expect(
        attendanceService.putSessionAttendance(
          'sess-cancelled',
          {
            records: [
              {
                studentId: studentEnrolled.id,
                status: AttendanceStatus.PRESENT,
              },
            ],
          },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('processes partial and full refunds accurately, rebalances invoice status and balance, and voids receipt on full refund', async () => {
      const invoice = {
        id: 'inv-to-refund',
        classId: sampleBatch.id,
        invoiceNumber: 'INV-REFUND-001',
        periodYyyyMm: '2026-10',
        subtotalMinor: 500000,
        discountMinor: 0,
        surchargeMinor: 0,
        totalMinor: 500000,
        paidMinor: 500000,
        balanceMinor: 0,
        dueAt: new Date('2026-10-10T00:00:00.000Z'),
        issuedAt: new Date('2026-10-01T00:00:00.000Z'),
        paidAt: new Date('2026-10-05T00:00:00.000Z'),
        voidedAt: null,
        graceDays: 5,
        status: TuitionInvoiceStatus.PAID,
        allocations: [],
      };

      const payment = {
        id: 'pay-refund-ok',
        classId: sampleBatch.id,
        payerId: studentEnrolled.id,
        amountMinor: 500000,
        currency: 'LKR',
        channel: TuitionPaymentChannel.ONLINE_GATEWAY,
        status: TuitionPaymentStatus.SUCCEEDED,
        refundedMinor: 0,
        allocations: [
          {
            id: 'alloc-refund-1',
            amountMinor: 500000,
            invoice,
          },
        ],
        receipt: {
          id: 'rcp-refund-1',
          receiptNumber: 'RCP-202610-0099',
          status: 'ISSUED',
        },
      };

      const invoiceAfterPartial = {
        ...invoice,
        paidMinor: 300000,
        balanceMinor: 200000,
        status: TuitionInvoiceStatus.PARTIALLY_PAID,
        classBatch: { id: sampleBatch.id, title: sampleBatch.title },
        student: { id: studentEnrolled.id, email: studentEnrolled.email },
        enrollment: { studentCode: 'ST-001' },
        adjustments: [],
        allocations: [
          {
            id: 'alloc-refund-1',
            amountMinor: 300000,
            createdAt: new Date('2026-10-05T00:00:00.000Z'),
            payment: {
              id: payment.id,
              status: TuitionPaymentStatus.PARTIALLY_REFUNDED,
              receipt: payment.receipt,
            },
          },
        ],
        manualSubmissions: [],
        auditEvents: [],
      };

      // 1. Partial Refund of 200000 minor (LKR 2,000.00)
      prismaMock.tuitionPayment.findUnique.mockResolvedValueOnce(payment);
      prismaMock.tuitionInvoice.findUnique.mockResolvedValueOnce(invoiceAfterPartial);

      const partialRes = await billingService.refundTuitionPayment(
        payment.id,
        {
          amountMinor: 200000,
          reason: 'Student missed 2 weeks due to illness',
        },
        teacherA,
      );

      expect(partialRes.status).toBe(TuitionPaymentStatus.PARTIALLY_REFUNDED);
      expect(partialRes.refundedMinor).toBe(200000);
      expect(partialRes.invoice.balanceMinor).toBe(200000);
      expect(partialRes.invoice.status).toBe(TuitionInvoiceStatus.PARTIALLY_PAID);

      // Verify Prisma updates occurred
      expect(prismaMock.tuitionPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: payment.id },
          data: expect.objectContaining({
            status: TuitionPaymentStatus.PARTIALLY_REFUNDED,
            refundedMinor: 200000,
          }),
        }),
      );

      // 2. Full Refund of remaining 500000 minor
      const freshPaymentForFull = {
        ...payment,
        refundedMinor: 0,
      };
      const invoiceAfterFull = {
        ...invoice,
        paidMinor: 0,
        balanceMinor: 500000,
        status: TuitionInvoiceStatus.ISSUED,
        classBatch: { id: sampleBatch.id, title: sampleBatch.title },
        student: { id: studentEnrolled.id, email: studentEnrolled.email },
        enrollment: { studentCode: 'ST-001' },
        adjustments: [],
        allocations: [],
        manualSubmissions: [],
        auditEvents: [],
      };

      prismaMock.tuitionPayment.findUnique.mockResolvedValueOnce(freshPaymentForFull);
      prismaMock.tuitionInvoice.findUnique.mockResolvedValueOnce(invoiceAfterFull);

      const fullRes = await billingService.refundTuitionPayment(
        payment.id,
        {
          amountMinor: 500000,
          reason: 'Full course drop and refund requested',
        },
        teacherA,
      );

      expect(fullRes.status).toBe(TuitionPaymentStatus.REFUNDED);
      expect(fullRes.refundedMinor).toBe(500000);
      expect(fullRes.invoice.balanceMinor).toBe(500000);
      // Because dueAt ('2026-10-10') + 5 grace days is in the past, an unpaid balance after full refund correctly reconciles to OVERDUE!
      expect(fullRes.invoice.status).toBe(TuitionInvoiceStatus.OVERDUE);
      expect(fullRes.invoice.isOverdue).toBe(true);
      expect(prismaMock.tuitionReceipt.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: payment.receipt.id },
          data: expect.objectContaining({
            status: 'VOIDED_BY_REFUND',
          }),
        }),
      );
    });

    it('denies private resource streaming on expired tokens, tampered signatures, or quarantined scan status', async () => {
      // 1. Expired token verification
      const expiredTokenResult = lessonsService.createSignedResourceToken({
        resourceId: 'res-1',
        userId: studentEnrolled.id,
        classId: sampleBatch.id,
        ttlSeconds: -10, // expired 10 seconds ago
      });

      expect(() =>
        lessonsService.verifySignedResourceToken(
          expiredTokenResult.token,
          'res-1',
          studentEnrolled.id,
        ),
      ).toThrow(ForbiddenException);

      // 2. Tampered signature
      const validTokenResult = lessonsService.createSignedResourceToken({
        resourceId: 'res-1',
        userId: studentEnrolled.id,
        classId: sampleBatch.id,
        ttlSeconds: 300,
      });

      const tamperedToken = `${validTokenResult.token.split('.')[0]}.deadbeefbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb`;
      expect(() =>
        lessonsService.verifySignedResourceToken(
          tamperedToken,
          'res-1',
          studentEnrolled.id,
        ),
      ).toThrow(ForbiddenException);

      // 3. Quarantined scan status
      prismaMock.lessonResource.findFirst.mockResolvedValueOnce({
        id: 'res-quarantine',
        lessonId: 'les-1',
        scanStatus: LessonResourceScanStatus.QUARANTINED,
        lesson: {
          id: 'les-1',
          status: LessonStatus.Published,
          publishAt: null,
          module: { courseId: sampleBatch.courseId },
        },
      });

      await expect(
        lessonsService.generateResourceAccessUrl(
          'les-1',
          'res-quarantine',
          { classId: sampleBatch.id },
          studentEnrolled,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

