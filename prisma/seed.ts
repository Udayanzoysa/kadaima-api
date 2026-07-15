import {
  PrismaClient,
  Role,
  Action,
  Subject,
  QuizStatus,
  QuestionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const GK_QUESTIONS = [
  {
    text: {
      en: 'What is the capital of Sri Lanka?',
      si: 'ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?',
      ta: 'இலங்கையின் தலைநகரம் எது?',
    },
    choices: [
      { en: 'Colombo', si: 'කොළඹ', ta: 'கொழும்பு' },
      { en: 'Sri Jayawardenepura Kotte', si: 'ශ්‍රී ජයවර්ධනපුර කෝට්ටේ', ta: 'ஸ்ரீ ஜயவர்தனபுர கோட்டே' },
      { en: 'Kandy', si: 'මහනුවර', ta: 'கண்டி' },
      { en: 'Galle', si: 'ගාල්ල', ta: 'காலி' },
    ],
    correct: 1,
  },
  {
    text: {
      en: 'What is 2 + 2?',
      si: '2 + 2 යනු කුමක්ද?',
      ta: '2 + 2 என்றால் என்ன?',
    },
    choices: [
      { en: '3', si: '3', ta: '3' },
      { en: '4', si: '4', ta: '4' },
      { en: '5', si: '5', ta: '5' },
      { en: '22', si: '22', ta: '22' },
    ],
    correct: 1,
  },
  {
    text: {
      en: 'Which planet is known as the Red Planet?',
      si: 'රතු ග්‍රහලෝකය ලෙස හඳුන්වන්නේ කුමන ග්‍රහලෝකයද?',
      ta: 'சிவப்பு கிரகம் என்று அழைக்கப்படும் கிரகம் எது?',
    },
    choices: [
      { en: 'Venus', si: 'සිකුරු', ta: 'வெள்ளி' },
      { en: 'Mars', si: 'අඟහරු', ta: 'செவ்வாய்' },
      { en: 'Jupiter', si: 'බ්‍රහස්පති', ta: 'வியாழன்' },
      { en: 'Saturn', si: 'සෙනසුරු', ta: 'சனி' },
    ],
    correct: 1,
  },
  {
    text: {
      en: 'How many continents are there on Earth?',
      si: 'පෘථිවියේ මහාද්වීප කීයක් තිබේද?',
      ta: 'பூமியில் எத்தனை கண்டங்கள் உள்ளன?',
    },
    choices: [
      { en: '5', si: '5', ta: '5' },
      { en: '6', si: '6', ta: '6' },
      { en: '7', si: '7', ta: '7' },
      { en: '8', si: '8', ta: '8' },
    ],
    correct: 2,
  },
  {
    text: {
      en: 'What is the chemical symbol for water?',
      si: 'ජලයේ රසායනික සංකේතය කුමක්ද?',
      ta: 'நீரின் வேதியியல் குறியீடு என்ன?',
    },
    choices: [
      { en: 'H2O', si: 'H2O', ta: 'H2O' },
      { en: 'CO2', si: 'CO2', ta: 'CO2' },
      { en: 'O2', si: 'O2', ta: 'O2' },
      { en: 'NaCl', si: 'NaCl', ta: 'NaCl' },
    ],
    correct: 0,
  },
  {
    text: {
      en: 'Who wrote the theory of relativity?',
      si: 'සාපේක්ෂතා න්‍යාය ලියුවේ කවුරුන්ද?',
      ta: 'சார்பியல் கோட்பாட்டை எழுதியவர் யார்?',
    },
    choices: [
      { en: 'Isaac Newton', si: 'අයිසැක් නිව්ටන්', ta: 'ஐசக் நியூட்டன்' },
      { en: 'Albert Einstein', si: 'ඇල්බට් අයින්ස්ටයින්', ta: 'ஆல்பர்ட் ஐன்ஸ்டீன்' },
      { en: 'Galileo Galilei', si: 'ගැලීලියෝ ගැලීලි', ta: 'கலிலியோ கலிலி' },
      { en: 'Nikola Tesla', si: 'නිකෝලා ටෙස්ලා', ta: 'நிக்கோலா டெஸ்லா' },
    ],
    correct: 1,
  },
  {
    text: {
      en: 'What is the largest ocean on Earth?',
      si: 'පෘථිවියේ විශාලතම සාගරය කුමක්ද?',
      ta: 'பூமியில் உள்ள மிகப்பெரிய பெருங்கடல் எது?',
    },
    choices: [
      { en: 'Atlantic Ocean', si: 'අත්ලාන්තික් සාගරය', ta: 'அட்லாண்டிக் பெருங்கடல்' },
      { en: 'Indian Ocean', si: 'ඉන්දියානු සාගරය', ta: 'இந்தியப் பெருங்கடல்' },
      { en: 'Arctic Ocean', si: 'ආක්ටික් සාගරය', ta: 'ஆர்க்டிக் பெருங்கடல்' },
      { en: 'Pacific Ocean', si: 'පැසිෆික් සාගරය', ta: 'பசிபிக் பெருங்கடல்' },
    ],
    correct: 3,
  },
  {
    text: {
      en: 'How many days are there in a leap year?',
      si: 'අධික අවුරුද්දක දින කීයක් තිබේද?',
      ta: 'ஒரு லீப் ஆண்டில் எத்தனை நாட்கள் உள்ளன?',
    },
    choices: [
      { en: '365', si: '365', ta: '365' },
      { en: '364', si: '364', ta: '364' },
      { en: '366', si: '366', ta: '366' },
      { en: '360', si: '360', ta: '360' },
    ],
    correct: 2,
  },
  {
    text: {
      en: 'Which gas do plants absorb from the atmosphere?',
      si: 'ශාක වායුගෝලයෙන් අවශෝෂණය කරගන්නේ කුමන වායුවද?',
      ta: 'தாவரங்கள் வளிமண்டலத்திலிருந்து எந்த வாயுவை உட்கொள்கின்றன?',
    },
    choices: [
      { en: 'Oxygen', si: 'ඔක්සිජන්', ta: 'ஆக்ஸிஜன்' },
      { en: 'Nitrogen', si: 'නයිට්‍රජන්', ta: 'நைட்ரஜன்' },
      { en: 'Carbon Dioxide', si: 'කාබන් ඩයොක්සයිඩ්', ta: 'கார்பன் டை ஆக்சைடு' },
      { en: 'Hydrogen', si: 'හයිඩ්‍රජන්', ta: 'ஹைட்ரஜன்' },
    ],
    correct: 2,
  },
  {
    text: {
      en: 'What is the smallest prime number?',
      si: 'කුඩාම ප්‍රථමික සංඛ්‍යාව කුමක්ද?',
      ta: 'மிகச்சிறிய பகா எண் எது?',
    },
    choices: [
      { en: '0', si: '0', ta: '0' },
      { en: '1', si: '1', ta: '1' },
      { en: '2', si: '2', ta: '2' },
      { en: '3', si: '3', ta: '3' },
    ],
    correct: 2,
  },
];

async function main() {
  console.log('Clearing database...');

  await prisma.studentResponse.deleteMany({});
  await prisma.quizAttempt.deleteMany({});
  await prisma.guestLead.deleteMany({});
  await prisma.quizQuestion.deleteMany({});
  await prisma.answerChoice.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.quiz.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.accessReview.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.permissionSet.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.workspace.deleteMany({});

  console.log('Database cleared.');

  const workspace = await prisma.workspace.create({
    data: { name: 'Techwing LMS' },
  });

  const pSetsData = [
    { name: 'Settings', description: 'Allows editing workspace settings', permissions: [{ action: Action.MANAGE, subject: Subject.SETTINGS }] },
    { name: 'Users', description: 'Allows full management of workspace users', permissions: [{ action: Action.MANAGE, subject: Subject.USERS }] },
    { name: 'Roles', description: 'Allows defining roles and scope configurations', permissions: [{ action: Action.MANAGE, subject: Subject.ROLES }] },
    { name: 'Dashboard Access', description: 'Allows accessing general dashboards', permissions: [{ action: Action.MANAGE, subject: Subject.DASHBOARD_ACCESS }] },
    { name: 'Log', description: 'Allows reading action logs', permissions: [{ action: Action.MANAGE, subject: Subject.LOG }] },
    { name: 'Reports', description: 'Allows exporting system reports', permissions: [{ action: Action.MANAGE, subject: Subject.REPORTS }] },
    { name: 'Quizzes', description: 'Allows managing quizzes and assessments', permissions: [{ action: Action.MANAGE, subject: Subject.QUIZZES }] },
  ];

  const seededPermissionSets: { id: string; name: string }[] = [];
  for (const ps of pSetsData) {
    const createdPs = await prisma.permissionSet.create({
      data: {
        name: ps.name,
        description: ps.description,
        workspaceId: workspace.id,
        permissions: {
          create: ps.permissions.map((perm) => ({
            action: perm.action,
            subject: perm.subject,
          })),
        },
      },
    });
    seededPermissionSets.push({ id: createdPs.id, name: createdPs.name });
  }

  const getPSetIds = (names: string[]) =>
    seededPermissionSets.filter((ps) => names.includes(ps.name)).map((ps) => ({ id: ps.id }));

  const ownerRole = await prisma.customRole.create({
    data: {
      name: 'Owner',
      accessLevel: 'Full',
      description: 'Full workspace ownership and control',
      workspaceId: workspace.id,
      status: 'Active',
      owner: 'System',
      isSystem: false,
      permissionSets: {
        connect: getPSetIds(['Settings', 'Users', 'Roles', 'Dashboard Access', 'Log', 'Reports', 'Quizzes']),
      },
    },
  });

  await prisma.customRole.create({
    data: {
      name: 'Admin',
      accessLevel: 'Full',
      description: 'Administrator access with full privileges',
      workspaceId: workspace.id,
      status: 'Active',
      owner: 'System',
      isSystem: false,
      permissionSets: {
        connect: getPSetIds(['Settings', 'Users', 'Roles', 'Dashboard Access', 'Log', 'Reports', 'Quizzes']),
      },
    },
  });

  const teacherRole = await prisma.customRole.create({
    data: {
      name: 'Teacher',
      accessLevel: 'Limited',
      description: 'Manage quizzes and question bank only',
      workspaceId: workspace.id,
      status: 'Active',
      owner: 'System',
      isSystem: true,
      permissionSets: {
        connect: getPSetIds(['Quizzes', 'Dashboard Access']),
      },
    },
  });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('admin@123', salt);

  const superAdmin = await prisma.user.create({
    data: {
      email: 'udaya@gmail.com',
      passwordHash,
      role: Role.SUPER_ADMIN,
      name: 'Udaya',
      firstName: 'Udaya',
      lastName: 'Admin',
      team: 'Executive',
      status: 'Active',
      workspaceId: workspace.id,
      customRoleId: ownerRole.id,
      isTwoFactorEnabled: false,
      canViewOthers: true,
      canManagePermissions: true,
    },
  });

  // Student account — plain USER role, no custom role/permission set, so RBAC
  // grants it nothing beyond the self-service "My Quizzes" area on the frontend.
  const studentPasswordHash = await bcrypt.hash('student@123', salt);
  const student = await prisma.user.create({
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
      isTwoFactorEnabled: false,
      canViewOthers: false,
      canManagePermissions: false,
    },
  });

  // Teacher account — USER + Teacher custom role (Quizzes / Questions only).
  const teacherPasswordHash = await bcrypt.hash('teacher@123', salt);
  const teacher = await prisma.user.create({
    data: {
      email: 'teacher@gmail.com',
      passwordHash: teacherPasswordHash,
      role: Role.USER,
      name: 'Nimal Silva',
      firstName: 'Nimal',
      lastName: 'Silva',
      team: 'Teacher',
      status: 'Active',
      workspaceId: workspace.id,
      customRoleId: teacherRole.id,
      isTwoFactorEnabled: false,
      canViewOthers: false,
      canManagePermissions: false,
    },
  });

  const mathCourse = await prisma.course.create({
    data: {
      title: {
        en: 'Mathematics 101',
        si: 'ගණිතය 101',
        ta: 'கணிதம் 101',
      },
      status: 'Published',
    },
  });
  await prisma.course.create({
    data: {
      title: {
        en: 'Science 201',
        si: 'විද්‍යාව 201',
        ta: 'அறிவியல் 201',
      },
      status: 'Published',
    },
  });
  const generalStudiesCourse = await prisma.course.create({
    data: {
      title: {
        en: 'General Studies',
        si: 'සාමාන්‍ය අධ්‍යයන',
        ta: 'பொதுக் கல்வி',
      },
      status: 'Published',
    },
  });

  // Draft example quiz shown in the teacher builder demo (not yet published).
  const draftQuestion = await prisma.question.create({
    data: {
      questionText: {
        en: 'What is 2 + 2?',
        si: '2 + 2 යනු කුමක්ද?',
        ta: '2 + 2 என்றால் என்ன?',
      },
      points: 1,
      status: QuestionStatus.Draft,
      createdById: superAdmin.id,
      choices: {
        create: [
          { choiceText: { en: '3', si: '3', ta: '3' }, isCorrect: false },
          { choiceText: { en: '4', si: '4', ta: '4' }, isCorrect: true },
          { choiceText: { en: '5', si: '5', ta: '5' }, isCorrect: false },
        ],
      },
    },
  });

  const draftQuiz = await prisma.quiz.create({
    data: {
      courseId: mathCourse.id,
      title: {
        en: 'Chapter 5 Assessment',
        si: 'පරිච්ඡේද 5 ඇගයීම',
        ta: 'அத்தியாயம் 5 மதிப்பீடு',
      },
      description: {
        en: 'Assessment covering algebra and geometry fundamentals.',
        si: 'වීජ ගණිතය සහ ජ්‍යාමිති මූලික කරුණු ආවරණය කරන ඇගයීම.',
        ta: 'இயற்கணிதம் மற்றும் வடிவியல் அடிப்படைகளை உள்ளடக்கிய மதிப்பீடு.',
      },
      durationMinutes: 30,
      passingScorePercentage: 70,
      shuffleQuestions: false,
      status: QuizStatus.Draft,
      createdById: superAdmin.id,
    },
  });

  await prisma.quizQuestion.create({
    data: {
      quizId: draftQuiz.id,
      questionId: draftQuestion.id,
      sortOrder: 0,
    },
  });

  // Published 10-question quiz available for students to take right away.
  const gkQuestions: { id: string }[] = [];
  for (let index = 0; index < GK_QUESTIONS.length; index += 1) {
    const q = GK_QUESTIONS[index];
    const created = await prisma.question.create({
      data: {
        questionText: q.text,
        points: 1,
        status: QuestionStatus.Published,
        createdById: superAdmin.id,
        choices: {
          create: q.choices.map((choice, choiceIndex) => ({
            choiceText: choice,
            isCorrect: choiceIndex === q.correct,
          })),
        },
      },
    });
    gkQuestions.push({ id: created.id });
  }

  const publishedQuiz = await prisma.quiz.create({
    data: {
      courseId: generalStudiesCourse.id,
      title: {
        en: 'General Knowledge Quiz',
        si: 'සාමාන්‍ය දැනුම විභාගය',
        ta: 'பொது அறிவு வினாடி வினா',
      },
      description: {
        en: 'A 10-question assessment covering general knowledge across science, math, and geography.',
        si: 'විද්‍යාව, ගණිතය සහ භූගෝල විද්‍යාව ආවරණය කරන ප්‍රශ්න 10කින් සමන්විත ඇගයීමකි.',
        ta: 'அறிவியல், கணிதம் மற்றும் புவியியல் ஆகியவற்றை உள்ளடக்கிய 10 கேள்விகள் கொண்ட மதிப்பீடு.',
      },
      durationMinutes: 15,
      passingScorePercentage: 60,
      shuffleQuestions: true,
      status: QuizStatus.Published,
      createdById: superAdmin.id,
    },
  });

  for (let index = 0; index < gkQuestions.length; index += 1) {
    await prisma.quizQuestion.create({
      data: {
        quizId: publishedQuiz.id,
        questionId: gkQuestions[index].id,
        sortOrder: index,
      },
    });
  }

  console.log('Super admin seeded successfully:');
  console.log(`Email: ${superAdmin.email}`);
  console.log('Password: admin@123');
  console.log('Teacher account seeded successfully:');
  console.log(`Email: ${teacher.email}`);
  console.log('Password: teacher@123');
  console.log('Student account seeded successfully:');
  console.log(`Email: ${student.email}`);
  console.log('Password: student@123');
  console.log('Published quiz seeded: General Knowledge Quiz (10 questions)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
