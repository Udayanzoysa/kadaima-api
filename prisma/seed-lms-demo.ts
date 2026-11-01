import {
  PrismaClient,
  Role,
  ClassBatchStatus,
  ClassEnrollmentStatus,
  ClassFeeFrequency,
  ClassLocationType,
  ClassOverdueAccessPolicy,
  ClassProrationPolicy,
  ClassSessionStatus,
  ClassQuizAssignmentStatus,
  LessonStatus,
  LessonResourceType,
  LessonResourceAccessPolicy,
  LessonResourceScanStatus,
  AttendanceStatus,
  TuitionInvoiceStatus,
  TuitionPaymentChannel,
  TuitionPaymentStatus,
  QuizStatus,
  AttemptStatus,
  CourseStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function hashToken(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

async function main() {
  console.log('--- Seeding Classroom LMS Demo Data ---');

  // 1. Ensure Workspace
  let workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: 'Kadaima National LMS',
        isActive: true,
      },
    });
  }

  const salt = await bcrypt.genSalt(10);
  const commonPasswordHash = await bcrypt.hash('teacher@123', salt);
  const studentPasswordHash = await bcrypt.hash('student@123', salt);

  // 2. Ensure Teacher User & Profile
  let teacher = await prisma.user.findUnique({ where: { email: 'teacher@gmail.com' } });
  if (!teacher) {
    teacher = await prisma.user.create({
      data: {
        email: 'teacher@gmail.com',
        passwordHash: commonPasswordHash,
        role: Role.USER,
        name: 'Nimal Silva',
        firstName: 'Nimal',
        lastName: 'Silva',
        team: 'Teacher',
        status: 'Active',
        workspaceId: workspace.id,
      },
    });
  }

  let teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: teacher.id },
  });
  if (!teacherProfile) {
    teacherProfile = await prisma.teacherProfile.create({
      data: {
        userId: teacher.id,
        slug: 'nimal-silva',
        displayName: 'Mr. Nimal Silva',
        title: 'B.Sc. (Hons) in Mathematics',
        description: 'Senior National Mathematics Educator with 15+ years experience.',
        isPublic: true,
        reviewStatus: 'Active',
      },
    });
  } else {
    await prisma.teacherProfile.update({
      where: { id: teacherProfile.id },
      data: { isPublic: true, reviewStatus: 'Active', displayName: 'Mr. Nimal Silva', title: 'B.Sc. (Hons) in Mathematics' },
    });
  }

  // Teacher 2: Kavindi Perera (Science)
  let teacher2 = await prisma.user.findUnique({ where: { email: 'kavindi@gmail.com' } });
  if (!teacher2) {
    teacher2 = await prisma.user.create({
      data: {
        email: 'kavindi@gmail.com',
        passwordHash: commonPasswordHash,
        role: Role.USER,
        name: 'Ms. Kavindi Perera',
        firstName: 'Kavindi',
        lastName: 'Perera',
        team: 'Teacher',
        status: 'Active',
        workspaceId: workspace.id,
      },
    });
  }
  let teacherProfile2 = await prisma.teacherProfile.findUnique({ where: { userId: teacher2.id } });
  if (!teacherProfile2) {
    await prisma.teacherProfile.create({
      data: {
        userId: teacher2.id,
        slug: 'kavindi-perera',
        displayName: 'Ms. Kavindi Perera',
        title: 'B.Sc. in Science Education',
        description: 'Senior Science Teacher specializing in O/L Science syllabus.',
        isPublic: true,
        reviewStatus: 'Active',
      },
    });
  } else {
    await prisma.teacherProfile.update({
      where: { id: teacherProfile2.id },
      data: { isPublic: true, reviewStatus: 'Active', displayName: 'Ms. Kavindi Perera', title: 'B.Sc. in Science Education' },
    });
  }

  // Teacher 3: Ruwan Fernando (English)
  let teacher3 = await prisma.user.findUnique({ where: { email: 'ruwan@gmail.com' } });
  if (!teacher3) {
    teacher3 = await prisma.user.create({
      data: {
        email: 'ruwan@gmail.com',
        passwordHash: commonPasswordHash,
        role: Role.USER,
        name: 'Mr. Ruwan Fernando',
        firstName: 'Ruwan',
        lastName: 'Fernando',
        team: 'Teacher',
        status: 'Active',
        workspaceId: workspace.id,
      },
    });
  }
  let teacherProfile3 = await prisma.teacherProfile.findUnique({ where: { userId: teacher3.id } });
  if (!teacherProfile3) {
    await prisma.teacherProfile.create({
      data: {
        userId: teacher3.id,
        slug: 'ruwan-fernando',
        displayName: 'Mr. Ruwan Fernando',
        title: 'M.A. in English',
        description: 'English Language and Literature Specialist with national exam preparation programs.',
        isPublic: true,
        reviewStatus: 'Active',
      },
    });
  } else {
    await prisma.teacherProfile.update({
      where: { id: teacherProfile3.id },
      data: { isPublic: true, reviewStatus: 'Active', displayName: 'Mr. Ruwan Fernando', title: 'M.A. in English' },
    });
  }

  // 3. Ensure Student 1 (Enrolled & Active)
  let student1 = await prisma.user.findUnique({ where: { email: 'student@gmail.com' } });
  if (!student1) {
    student1 = await prisma.user.create({
      data: {
        email: 'student@gmail.com',
        passwordHash: studentPasswordHash,
        role: Role.USER,
        name: 'Saman Perera',
        firstName: 'Saman',
        lastName: 'Perera',
        team: 'Student',
        status: 'Active',
        workspaceId: workspace.id,
      },
    });
  }

  // 4. Ensure Student 2 (For Roster Approval Testing)
  let student2 = await prisma.user.findUnique({ where: { email: 'student2@gmail.com' } });
  if (!student2) {
    student2 = await prisma.user.create({
      data: {
        email: 'student2@gmail.com',
        passwordHash: studentPasswordHash,
        role: Role.USER,
        name: 'Anula Bandara',
        firstName: 'Anula',
        lastName: 'Bandara',
        team: 'Student',
        status: 'Active',
        workspaceId: workspace.id,
      },
    });
  }

  // 5. Ensure Course
  let course = await prisma.course.findFirst({
    where: { title: { path: ['en'], string_contains: 'Mathematics' } },
  });
  if (!course) {
    course = await prisma.course.create({
      data: {
        title: {
          en: 'G.C.E. O/L Mathematics',
          si: 'සා.පෙ. ගණිතය',
          ta: 'க.பொ.த. சா/த கணிதம்',
        },
        description: {
          en: 'Comprehensive O/L Mathematics theory, revision, and exam practice.',
          si: 'සාමාන්‍ය පෙළ ගණිතය විෂය නිර්දේශය ආවරණය වන සම්පූර්ණ පාඨමාලාව.',
          ta: 'சாதாரண தர கணித தத்துவம் மற்றும் முழுமையான பாடநெறி.',
        },
        status: CourseStatus.Published,
      },
    });
  }

  // 6. Ensure Module
  let module = await prisma.module.findFirst({
    where: { courseId: course.id },
  });
  if (!module) {
    module = await prisma.module.create({
      data: {
        courseId: course.id,
        title: {
          en: 'Unit 1: Quadratic Equations & Functions',
          si: '1 වන ඒකකය: වර්ගජ සමීකරණ සහ ශ්‍රිත',
          ta: 'அலகு 1: இருபடிச் சமன்பாடுகள்',
        },
        description: {
          en: 'Standard form, factorization, quadratic formula, and real-world graphs.',
          si: 'ප්‍රමිති ආකාරය, සාධක සෙවීම, සූත්‍රය සහ ප්‍රස්ථාර.',
          ta: 'வடிவம், காரணிப்படுத்தல் மற்றும் வரைபடங்கள்.',
        },
        sortOrder: 1,
        status: 'Published',
      },
    });
  }

  // 7. Ensure Lessons
  let lesson1 = await prisma.lesson.findFirst({
    where: { moduleId: module.id, sortOrder: 1 },
  });
  if (!lesson1) {
    lesson1 = await prisma.lesson.create({
      data: {
        moduleId: module.id,
        title: {
          en: 'Lesson 1: Introduction to Quadratic Form',
          si: 'පාඩම 1: වර්ගජ ආකාරය පිළිබඳ හැඳින්වීම',
          ta: 'பாடம் 1: இருபடி வடிவம் அறிமுகம்',
        },
        summary: {
          en: 'Identify ax² + bx + c = 0 and determine roots.',
          si: 'ax² + bx + c = 0 හඳුනාගැනීම සහ මූල නිර්ණය.',
          ta: 'ax² + bx + c = 0 அடையாளம் மற்றும் மூலங்கள்.',
        },
        body: {
          en: '<p>A quadratic equation is a second-order polynomial equation in a single variable <em>x</em>: <strong>ax² + bx + c = 0</strong> with <em>a ≠ 0</em>.</p>',
          si: '<p>වර්ගජ සමීකරණයක් යනු තනි විචල්‍යයක් සහිත දෙවන මාත්‍රාවේ සමීකරණයකි: <strong>ax² + bx + c = 0</strong> (a ≠ 0 වේ).</p>',
          ta: '<p>இருபடிச் சமன்பாடு என்பது ஒரு மாறியைக் கொண்ட இரண்டாம் படி சமன்பாடாகும்: <strong>ax² + bx + c = 0</strong>.</p>',
        },
        sortOrder: 1,
        status: LessonStatus.Published,
        estimatedMinutes: 45,
        createdById: teacher.id,
      },
    });
  }

  // Attach private PDF resource to Lesson 1
  const storageDir = path.join(process.cwd(), 'private-storage', 'lesson-resources');
  fs.mkdirSync(storageDir, { recursive: true });
  const samplePdfName = 'quadratic-formula-worksheet-2026.pdf';
  const samplePdfStorageKey = `demo-${crypto.randomUUID()}.pdf`;
  const dummyPdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (Quadratic Equations Worksheet) >>\nendobj\ntrailer\n<< >>\n%%EOF',
    'utf-8',
  );
  fs.writeFileSync(path.join(storageDir, samplePdfStorageKey), dummyPdfBuffer);

  const existingResource = await prisma.lessonResource.findFirst({
    where: { lessonId: lesson1.id },
  });
  if (!existingResource) {
    await prisma.lessonResource.create({
      data: {
        lessonId: lesson1.id,
        title: {
          en: 'Class Handout: Quadratic Formula Step-by-Step Worksheet',
          si: 'පන්ති අත්පොත: වර්ගජ සූත්‍රය පියවරෙන් පියවර අභ්‍යාස පත්‍රිකාව',
          ta: 'வகுப்புக் கையேடு: இருபடிச் சமன்பாடு பயிற்சித்தாள்',
        },
        type: LessonResourceType.PDF,
        storageKey: samplePdfStorageKey,
        fileName: samplePdfName,
        mimeType: 'application/pdf',
        sizeBytes: dummyPdfBuffer.length,
        accessPolicy: LessonResourceAccessPolicy.DOWNLOADABLE,
        sortOrder: 1,
        scanStatus: LessonResourceScanStatus.CLEAN,
        checksumSha256: crypto.createHash('sha256').update(dummyPdfBuffer).digest('hex'),
        createdById: teacher.id,
      },
    });

    await prisma.lessonResource.create({
      data: {
        lessonId: lesson1.id,
        title: {
          en: 'Teacher Study Note: Common Pitfalls with Negative Coefficients',
          si: 'ගුරු සටහන: සෘණ සංගුණක සහිත බහුල වැරදි',
          ta: 'ஆசிரியர் குறிப்பு: மறை குணகங்களில் ஏற்படும் பிழைகள்',
        },
        type: LessonResourceType.TEACHER_NOTE,
        noteText: {
          en: 'Always wrap negative b values in parentheses when calculating b² - 4ac: e.g. (-3)² = 9, not -9!',
          si: 'b² - 4ac ගණනය කිරීමේදී සෘණ අගයන් වරහන් තුළ තබන්න: (-3)² = +9 වේ!',
          ta: 'b² - 4ac கணக்கிடும் போது அடைப்புக் குறிகளை கவனமாகப் பயன்படுத்தவும்: (-3)² = 9!',
        },
        accessPolicy: LessonResourceAccessPolicy.VIEW_ONLY,
        sortOrder: 2,
        scanStatus: LessonResourceScanStatus.CLEAN,
        createdById: teacher.id,
      },
    });
  }

  let lesson2 = await prisma.lesson.findFirst({
    where: { moduleId: module.id, sortOrder: 2 },
  });
  if (!lesson2) {
    lesson2 = await prisma.lesson.create({
      data: {
        moduleId: module.id,
        title: {
          en: 'Lesson 2: Solving by Factorization & Formula',
          si: 'පාඩම 2: සාධක සහ සූත්‍ර භාවිතයෙන් විසඳීම',
          ta: 'பாடம் 2: காரணி மற்றும் சூத்திர முறை',
        },
        sortOrder: 2,
        status: LessonStatus.Published,
        estimatedMinutes: 60,
        createdById: teacher.id,
      },
    });
  }

  // 8. Ensure ClassBatch
  let batch = await prisma.classBatch.findFirst({
    where: { primaryTeacherId: teacher.id },
  });
  if (!batch) {
    batch = await prisma.classBatch.create({
      data: {
        courseId: course.id,
        workspaceId: workspace.id,
        primaryTeacherId: teacher.id,
        title: {
          en: 'Grade 10 Mathematics — Theory & Revision 2026 (Batch A)',
          si: '10 ශ්‍රේණිය ගණිතය — සිද්ධාන්ත සහ පුනරීක්ෂණ 2026 (කණ්ඩායම A)',
          ta: 'தரம் 10 கணிதம் — தத்துவம் மற்றும் திருத்தம் 2026 (பிரிவு A)',
        },
        description: {
          en: 'Comprehensive weekly interactive theory batch with exam paper discussions.',
          si: 'සතිපතා පවත්වන සම්පූර්ණ සිද්ධාන්ත සහ ප්‍රශ්න පත්‍ර සාකච්ඡා පන්තිය.',
          ta: 'வாராந்த விரிவான தத்துவ மற்றும் வினாத்தாள் கலந்துரையாடல் வகுப்பு.',
        },
        grade: 'Grade 10',
        subject: 'Mathematics',
        academicYear: 2026,
        capacity: 40,
        status: ClassBatchStatus.Published,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T23:59:59.000Z'),
      },
    });
  }

  // 9. Class Recurring Schedules
  const existingSchedules = await prisma.classSchedule.findMany({
    where: { classId: batch.id },
  });
  if (existingSchedules.length === 0) {
    await prisma.classSchedule.create({
      data: {
        classId: batch.id,
        weekday: 6, // Saturday
        localStartTime: '09:00',
        localEndTime: '11:00',
        timezone: 'Asia/Colombo',
        locationType: ClassLocationType.ONLINE,
        locationValue: 'https://meet.google.com/abc-defg-hij',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    await prisma.classSchedule.create({
      data: {
        classId: batch.id,
        weekday: 3, // Wednesday
        localStartTime: '16:30',
        localEndTime: '18:00',
        timezone: 'Asia/Colombo',
        locationType: ClassLocationType.ONLINE,
        locationValue: 'https://meet.google.com/xyz-uvwx-rst',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }

  // 10. Class Invitation (Code: MATH2026)
  const inviteCode = 'MATH2026';
  const tokenHash = hashToken(inviteCode);
  const existingInvite = await prisma.classInvitation.findFirst({
    where: { classId: batch.id, tokenHash },
  });
  if (!existingInvite) {
    await prisma.classInvitation.create({
      data: {
        classId: batch.id,
        tokenHash,
        codeHint: 'MATH****',
        expiresAt: new Date(Date.now() + 60 * 86_400_000),
        maxUses: 50,
        usedCount: 1,
        requiresApproval: false,
        createdById: teacher.id,
      },
    });
  }

  // 11. Student Enrollments
  // Student 1 -> ACTIVE
  await prisma.classEnrollment.upsert({
    where: {
      classId_studentId: {
        classId: batch.id,
        studentId: student1.id,
      },
    },
    update: { status: ClassEnrollmentStatus.ACTIVE },
    create: {
      classId: batch.id,
      studentId: student1.id,
      status: ClassEnrollmentStatus.ACTIVE,
      studentCode: 'ST-2026-001',
      joinedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });

  // Student 2 -> PENDING (to test teacher roster approval!)
  await prisma.classEnrollment.upsert({
    where: {
      classId_studentId: {
        classId: batch.id,
        studentId: student2.id,
      },
    },
    update: {},
    create: {
      classId: batch.id,
      studentId: student2.id,
      status: ClassEnrollmentStatus.PENDING,
      studentCode: 'ST-2026-002',
      joinedAt: new Date(),
    },
  });

  // 12. Student 1 Lesson Progress (Lesson 1 completed)
  await prisma.lessonProgress.upsert({
    where: {
      classId_studentId_lessonId: {
        classId: batch.id,
        studentId: student1.id,
        lessonId: lesson1.id,
      },
    },
    update: {},
    create: {
      classId: batch.id,
      studentId: student1.id,
      lessonId: lesson1.id,
      completedAt: new Date('2026-10-15T10:30:00.000Z'),
    },
  });

  // 13. Canonical Quiz & Class Assignment
  let sampleQuiz = await prisma.quiz.findFirst({
    where: { title: { path: ['en'], string_contains: 'Quadratic' } },
  });
  if (!sampleQuiz) {
    sampleQuiz = await prisma.quiz.create({
      data: {
        title: {
          en: 'Unit 1 Assessment: Quadratic Equations & Roots',
          si: '1 වන ඒකක ඇගයීම: වර්ගජ සමීකරණ සහ මූල',
          ta: 'அலகு 1 மதிப்பீடு: இருபடிச் சமன்பாடுகள்',
        },
        description: {
          en: '20-question timed diagnostic assessment covering factorisation and graph identification.',
          si: 'මිනිත්තු 30ක කාල නිර්ණය කළ ප්‍රශ්න 20ක ඇගයීම.',
          ta: '20 வினாக்கள் கொண்ட கால நிர்ணயிக்கப்பட்ட மதிப்பீடு.',
        },
        durationMinutes: 30,
        passingScorePercentage: 60,
        maxAttempts: 3,
        status: QuizStatus.Published,
        courseId: course.id,
        createdById: teacher.id,
      },
    });
  }

  const existingQuizAssignment = await prisma.classQuizAssignment.findUnique({
    where: {
      classId_quizId: {
        classId: batch.id,
        quizId: sampleQuiz.id,
      },
    },
  });
  if (!existingQuizAssignment) {
    await prisma.classQuizAssignment.create({
      data: {
        classId: batch.id,
        lessonId: lesson1.id,
        quizId: sampleQuiz.id,
        displayTitle: {
          en: 'Unit 1 Diagnostic Assessment',
          si: '1 වන ඒකක ඇගයීම් විභාගය',
          ta: 'அலகு 1 மதிப்பீட்டுத் தேர்வு',
        },
        status: ClassQuizAssignmentStatus.Published,
        assignedById: teacher.id,
      },
    });
  }

  // Student 1 Quiz Attempt
  const existingAttempt = await prisma.quizAttempt.findFirst({
    where: { quizId: sampleQuiz.id, studentId: student1.id },
  });
  if (!existingAttempt) {
    await prisma.quizAttempt.create({
      data: {
        quizId: sampleQuiz.id,
        studentId: student1.id,
        status: AttemptStatus.Submitted,
        finalScore: 85,
        isPassed: true,
        resultToken: `res-demo-${crypto.randomUUID().slice(0, 8)}`,
        submittedAt: new Date('2026-10-20T14:30:00.000Z'),
        expiresAt: new Date('2026-10-20T15:00:00.000Z'),
        secondsRemaining: 420,
      },
    });
  }

  // 14. Class Sessions & Attendance
  // Session 1: 2 weeks ago (Present)
  const sess1Start = new Date('2026-10-18T03:30:00.000Z'); // 09:00 SLT
  const sess1End = new Date('2026-10-18T05:30:00.000Z');
  const session1 = await prisma.classSession.upsert({
    where: {
      classId_startsAtUtc: { classId: batch.id, startsAtUtc: sess1Start },
    },
    update: {},
    create: {
      classId: batch.id,
      startsAtUtc: sess1Start,
      endsAtUtc: sess1End,
      localDate: '2026-10-18',
      timezone: 'Asia/Colombo',
      status: ClassSessionStatus.COMPLETED,
      title: { en: 'Theory Session 1: Standard Form & Factorization' },
    },
  });

  await prisma.attendanceRecord.upsert({
    where: {
      classSessionId_studentId: { classSessionId: session1.id, studentId: student1.id },
    },
    update: {},
    create: {
      classSessionId: session1.id,
      studentId: student1.id,
      status: AttendanceStatus.PRESENT,
      markedById: teacher.id,
      markedAt: new Date('2026-10-18T03:35:00.000Z'),
    },
  });

  // Session 2: 1 week ago (Late, with correction audit entry)
  const sess2Start = new Date('2026-10-25T03:30:00.000Z');
  const sess2End = new Date('2026-10-25T05:30:00.000Z');
  const session2 = await prisma.classSession.upsert({
    where: {
      classId_startsAtUtc: { classId: batch.id, startsAtUtc: sess2Start },
    },
    update: {},
    create: {
      classId: batch.id,
      startsAtUtc: sess2Start,
      endsAtUtc: sess2End,
      localDate: '2026-10-25',
      timezone: 'Asia/Colombo',
      status: ClassSessionStatus.COMPLETED,
      title: { en: 'Theory Session 2: Quadratic Formula Derivation' },
    },
  });

  const rec2 = await prisma.attendanceRecord.upsert({
    where: {
      classSessionId_studentId: { classSessionId: session2.id, studentId: student1.id },
    },
    update: {},
    create: {
      classSessionId: session2.id,
      studentId: student1.id,
      status: AttendanceStatus.LATE,
      note: 'Arrived at 09:20 AM',
      markedById: teacher.id,
      markedAt: new Date('2026-10-25T03:50:00.000Z'),
    },
  });

  const existingAuditChange = await prisma.attendanceChange.findFirst({
    where: { attendanceRecordId: rec2.id },
  });
  if (!existingAuditChange) {
    await prisma.attendanceChange.create({
      data: {
        attendanceRecordId: rec2.id,
        classSessionId: session2.id,
        studentId: student1.id,
        actorId: teacher.id,
        previousStatus: AttendanceStatus.UNMARKED,
        newStatus: AttendanceStatus.LATE,
        reason: 'Student joined 20 minutes late with network issue',
      },
    });
  }

  // Session 3: Today / Upcoming
  const todaySessionStart = new Date('2026-11-01T03:30:00.000Z');
  const todaySessionEnd = new Date('2026-11-01T05:30:00.000Z');
  await prisma.classSession.upsert({
    where: {
      classId_startsAtUtc: { classId: batch.id, startsAtUtc: todaySessionStart },
    },
    update: {},
    create: {
      classId: batch.id,
      startsAtUtc: todaySessionStart,
      endsAtUtc: todaySessionEnd,
      localDate: '2026-11-01',
      timezone: 'Asia/Colombo',
      status: ClassSessionStatus.SCHEDULED,
      title: { en: 'Paper Discussion & Speed Revision' },
    },
  });

  // 15. Class Fee Plan (LKR 2,500.00 / Month)
  let feePlan = await prisma.classFeePlan.findFirst({
    where: { classId: batch.id, isActive: true },
  });
  if (!feePlan) {
    feePlan = await prisma.classFeePlan.create({
      data: {
        classId: batch.id,
        name: {
          en: 'Standard Monthly Tuition Fee 2026',
          si: '2026 මාසික පන්ති ගාස්තුව',
          ta: '2026 மாதாந்த வகுப்பு கட்டணம்',
        },
        version: 1,
        amountMinor: 250000, // LKR 2,500.00
        currency: 'LKR',
        frequency: ClassFeeFrequency.MONTHLY,
        dueDay: 10,
        graceDays: 5,
        prorationPolicy: ClassProrationPolicy.FULL_MONTH,
        overdueAccessPolicy: ClassOverdueAccessPolicy.ALLOW_WITH_WARNING,
        isActive: true,
        createdById: teacher.id,
      },
    });
  }

  // 16. Monthly Tuition Invoices
  // Invoice 1: Past Month (September 2026) -> PAID with verified receipt
  const inv1 = await prisma.tuitionInvoice.upsert({
    where: {
      enrollmentId_periodYyyyMm: {
        enrollmentId: (await prisma.classEnrollment.findUnique({
          where: { classId_studentId: { classId: batch.id, studentId: student1.id } },
        }))!.id,
        periodYyyyMm: '2026-09',
      },
    },
    update: {},
    create: {
      classId: batch.id,
      enrollmentId: (await prisma.classEnrollment.findUnique({
        where: { classId_studentId: { classId: batch.id, studentId: student1.id } },
      }))!.id,
      studentId: student1.id,
      feePlanId: feePlan.id,
      periodYyyyMm: '2026-09',
      invoiceNumber: 'INV-202609-MATH-001',
      currency: 'LKR',
      subtotalMinor: 250000,
      discountMinor: 0,
      surchargeMinor: 0,
      totalMinor: 250000,
      paidMinor: 250000,
      balanceMinor: 0,
      dueAt: new Date('2026-09-10T18:29:59.000Z'),
      graceDays: 5,
      status: TuitionInvoiceStatus.PAID,
      paidAt: new Date('2026-09-08T10:15:00.000Z'),
      planSnapshotJson: {
        amountMinor: 250000,
        currency: 'LKR',
        dueDay: 10,
        graceDays: 5,
      },
    },
  });

  const existingPayment1 = await prisma.tuitionPayment.findFirst({
    where: { classId: batch.id, payerId: student1.id, status: TuitionPaymentStatus.SUCCEEDED },
  });
  if (!existingPayment1) {
    const payment1 = await prisma.tuitionPayment.create({
      data: {
        classId: batch.id,
        payerId: student1.id,
        channel: TuitionPaymentChannel.ONLINE_GATEWAY,
        gateway: 'PAYHERE',
        providerOrderId: 'TUI-202609-DEMO-001',
        providerPaymentId: 'PH-320019283',
        externalReference: 'PH-320019283',
        currency: 'LKR',
        amountMinor: 250000,
        status: TuitionPaymentStatus.SUCCEEDED,
        isTestMode: true,
        confirmedAt: new Date('2026-09-08T10:15:00.000Z'),
      },
    });

    await prisma.tuitionPaymentAllocation.create({
      data: {
        paymentId: payment1.id,
        invoiceId: inv1.id,
        amountMinor: 250000,
      },
    });

    await prisma.tuitionReceipt.create({
      data: {
        receiptNumber: 'RCP-202609-0001',
        paymentId: payment1.id,
        invoiceId: inv1.id,
        classId: batch.id,
        studentId: student1.id,
        currency: 'LKR',
        paidAmountMinor: 250000,
        balanceAfterMinor: 0,
        status: 'ISSUED',
        snapshotJson: {
          receiptNumber: 'RCP-202609-0001',
          invoiceNumber: inv1.invoiceNumber,
          periodYyyyMm: '2026-09',
          studentName: 'Saman Perera',
          studentEmail: student1.email,
          studentCode: 'ST-2026-001',
          classTitle: 'Grade 10 Mathematics — Theory & Revision 2026',
          teacherName: 'Nimal Silva',
          currency: 'LKR',
          channel: 'ONLINE_GATEWAY',
          externalReference: 'PH-320019283',
          invoiceTotalMinor: 250000,
          paidAmountMinor: 250000,
          balanceAfterMinor: 0,
          receiptStatus: 'ISSUED',
          isTestMode: true,
          issuedAt: new Date('2026-09-08T10:15:00.000Z').toISOString(),
        },
        issuedAt: new Date('2026-09-08T10:15:00.000Z'),
      },
    });
  }

  // Invoice 2: Current Month (October 2026) -> ISSUED & UNPAID (ready to test PayHere or Bank Slip!)
  const currentYm = new Date().toISOString().slice(0, 7);
  await prisma.tuitionInvoice.upsert({
    where: {
      enrollmentId_periodYyyyMm: {
        enrollmentId: (await prisma.classEnrollment.findUnique({
          where: { classId_studentId: { classId: batch.id, studentId: student1.id } },
        }))!.id,
        periodYyyyMm: currentYm,
      },
    },
    update: {},
    create: {
      classId: batch.id,
      enrollmentId: (await prisma.classEnrollment.findUnique({
        where: { classId_studentId: { classId: batch.id, studentId: student1.id } },
      }))!.id,
      studentId: student1.id,
      feePlanId: feePlan.id,
      periodYyyyMm: currentYm,
      invoiceNumber: `INV-${currentYm.replace('-', '')}-MATH-001`,
      currency: 'LKR',
      subtotalMinor: 250000,
      discountMinor: 0,
      surchargeMinor: 0,
      totalMinor: 250000,
      paidMinor: 0,
      balanceMinor: 250000,
      dueAt: new Date(`${currentYm}-10T18:29:59.000Z`),
      graceDays: 5,
      status: TuitionInvoiceStatus.ISSUED,
      planSnapshotJson: {
        amountMinor: 250000,
        currency: 'LKR',
        dueDay: 10,
        graceDays: 5,
      },
    },
  });

  console.log('✅ Classroom LMS Demo Seed successfully created!');
  console.log('Class Batch ID:', batch.id);
  console.log('Invite Code:', inviteCode);
  console.log('Student 1:', student1.email, '(Active, 1 Paid Invoice, 1 Current Unpaid Invoice)');
  console.log('Student 2:', student2.email, '(Pending Approval on Teacher Roster)');
}

main()
  .catch((e) => {
    console.error('Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
