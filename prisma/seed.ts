import { PrismaClient, Role, Action, Subject } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type Localized = { en: string; si: string; ta: string };

type SeedModule = {
  title: Localized;
  description: Localized;
};

type SeedCourse = {
  title: Localized;
  description: Localized;
  modules: SeedModule[];
};

/** Core Sri Lankan exam courses + modules only (no sample quizzes). */
const NATIONAL_EXAM_COURSES: SeedCourse[] = [
  {
    title: {
      en: 'Grade 5 Scholarship Examination',
      si: '5 ශ්‍රේණියේ ශිෂ්‍යත්ව විභාගය',
      ta: 'தரம் 5 புலமைப்பரிசில் பரீட்சை',
    },
    description: {
      en: 'Optional but widely taken exam at Grade 5 (around age 10). Awards scholarships and pathways into prestigious national schools. Focuses on general aptitude, intelligence, and first-language skills.',
      si: '5 ශ්‍රේණියේ (වයස අවුරුදු 10 පමණ) බහුලව ලබා ගන්නා විභාගයකි. ශිෂ්‍යත්ව සහ ජාතික පාසල් වෙත මාර්ග සපයයි. සාමාන්‍ය දක්ෂතාව, බුද්ධිය සහ මාතෘ භාෂා කුසලතා මත අවධානය යොමු කරයි.',
      ta: 'தரம் 5 இல் (சுமார் 10 வயது) பரவலாக எழுதப்படும் தேர்வு. புலமைப்பரிசில்களையும் தேசியப் பள்ளிகளுக்கான வாய்ப்புகளையும் வழங்குகிறது. பொதுத் திறன், அறிவுத்திறன் மற்றும் தாய்மொழித் திறன்களில் கவனம் செலுத்துகிறது.',
    },
    modules: [
      {
        title: {
          en: 'General Aptitude',
          si: 'සාමාන්‍ය දක්ෂතාව',
          ta: 'பொதுத் திறன்',
        },
        description: {
          en: 'Practice for reasoning, problem-solving, and aptitude questions used in the scholarship paper.',
          si: 'ශිෂ්‍යත්ව ප්‍රශ්න පත්‍රයේ භාවිතා වන තර්කනය, ගැටලු විසඳීම සහ දක්ෂතා ප්‍රශ්න සඳහා පුහුණුව.',
          ta: 'புலமைப்பரிசில் வினாத்தாளில் பயன்படும் பகுத்தறிவு, சிக்கல் தீர்த்தல் மற்றும் திறன் கேள்விகளுக்கான பயிற்சி.',
        },
      },
      {
        title: {
          en: 'Intelligence',
          si: 'බුද්ධි පරීක්ෂණ',
          ta: 'அறிவுத்திறன்',
        },
        description: {
          en: 'Pattern recognition, spatial reasoning, and intelligence-style items.',
          si: 'රටා හඳුනාගැනීම, අවකාශීය තර්කනය සහ බුද්ධි වර්ගයේ ප්‍රශ්න.',
          ta: 'வடிவ அறிதல், வெளிப்புறப் பகுத்தறிவு மற்றும் அறிவுத்திறன் பாணி கேள்விகள்.',
        },
      },
      {
        title: {
          en: 'First Language — Sinhala',
          si: 'මාතෘ භාෂාව — සිංහල',
          ta: 'தாய்மொழி — சிங்களம்',
        },
        description: {
          en: 'Sinhala language comprehension and skills for the scholarship exam.',
          si: 'ශිෂ්‍යත්ව විභාගය සඳහා සිංහල භාෂා අවබෝධය සහ කුසලතා.',
          ta: 'புலமைப்பரிசில் தேர்வுக்கான சிங்கள மொழிப் புரிதல் மற்றும் திறன்கள்.',
        },
      },
      {
        title: {
          en: 'First Language — Tamil',
          si: 'මාතෘ භාෂාව — දෙමළ',
          ta: 'தாய்மொழி — தமிழ்',
        },
        description: {
          en: 'Tamil language comprehension and skills for the scholarship exam.',
          si: 'ශිෂ්‍යත්ව විභාගය සඳහා දෙමළ භාෂා අවබෝධය සහ කුසලතා.',
          ta: 'புலமைப்பரிசில் தேர்வுக்கான தமிழ் மொழிப் புரிதல் மற்றும் திறன்கள்.',
        },
      },
    ],
  },
  {
    title: {
      en: 'G.C.E. Ordinary Level (O/L)',
      si: 'සා.පෙ. සාමාන්‍ය පෙළ (O/L)',
      ta: 'க.பொ.த. சாதாரண தரம் (O/L)',
    },
    description: {
      en: 'Foundational secondary qualification taken at Grade 11 (around age 16). Students usually sit 9 subjects; passing O/L is required to proceed to A/L.',
      si: '11 ශ්‍රේණියේ (වයස අවුරුදු 16 පමණ) ලබා ගන්නා මූලික ද්විතීයික සුදුසුකමයි. සාමාන්‍යයෙන් විෂයන් 9ක් ලබා ගනී; A/L වෙත යාමට O/L සමත් වීම අවශ්‍යයි.',
      ta: 'தரம் 11 இல் (சுமார் 16 வயது) எழுதப்படும் அடிப்படை இடைநிலைத் தகுதி. பொதுவாக 9 பாடங்களில் தேர்வு; A/Lக்குச் செல்ல O/L தேர்ச்சி அவசியம்.',
    },
    modules: [
      {
        title: { en: 'Mathematics', si: 'ගණිතය', ta: 'கணிதம்' },
        description: {
          en: 'Core O/L Mathematics — required for most A/L streams.',
          si: 'මූලික O/L ගණිතය — බොහෝ A/L ප්‍රවාහ සඳහා අවශ්‍යයි.',
          ta: 'அடிப்படை O/L கணிதம் — பெரும்பாலான A/L பிரிவுகளுக்குத் தேவை.',
        },
      },
      {
        title: { en: 'Science', si: 'විද්‍යාව', ta: 'அறிவியல்' },
        description: {
          en: 'Core O/L Science covering physics, chemistry, and biology fundamentals.',
          si: 'භෞතික, රසායන සහ ජීව විද්‍යා මූලික කරුණු ආවරණය කරන මූලික O/L විද්‍යාව.',
          ta: 'இயற்பியல், வேதியியல் மற்றும் உயிரியல் அடிப்படைகளை உள்ளடக்கிய அடிப்படை O/L அறிவியல்.',
        },
      },
      {
        title: {
          en: 'First Language (Sinhala / Tamil)',
          si: 'මාතෘ භාෂාව (සිංහල / දෙමළ)',
          ta: 'தாய்மொழி (சிங்களம் / தமிழ்)',
        },
        description: {
          en: 'Compulsory first-language paper in Sinhala or Tamil.',
          si: 'සිංහල හෝ දෙමළ භාෂාවෙන් අනිවාර්ය මාතෘ භාෂා ප්‍රශ්න පත්‍රය.',
          ta: 'சிங்களம் அல்லது தமிழில் கட்டாய தாய்மொழி வினாத்தாள்.',
        },
      },
      {
        title: { en: 'English', si: 'ඉංග්‍රීසි', ta: 'ஆங்கிலம்' },
        description: {
          en: 'Compulsory English language paper.',
          si: 'අනිවාර්ය ඉංග්‍රීසි භාෂා ප්‍රශ්න පත්‍රය.',
          ta: 'கட்டாய ஆங்கில மொழி வினாத்தாள்.',
        },
      },
      {
        title: { en: 'Religion', si: 'ආගම', ta: 'சமயம்' },
        description: {
          en: 'Compulsory religion paper (Buddhism, Hinduism, Islam, Christianity, etc.).',
          si: 'අනිවාර්ය ආගම් ප්‍රශ්න පත්‍රය (බුද්ධාගම, හින්දු, ඉස්ලාම්, ක්‍රිස්තියානි ආදිය).',
          ta: 'கட்டாய சமய வினாத்தாள் (பௌத்தம், இந்து, இஸ்லாம், கிறிஸ்தவம் போன்றவை).',
        },
      },
      {
        title: { en: 'History', si: 'ඉතිහාසය', ta: 'வரலாறு' },
        description: {
          en: 'Compulsory History paper covering Sri Lankan and world history themes.',
          si: 'ශ්‍රී ලංකා සහ ලෝක ඉතිහාස තේමා ආවරණය කරන අනිවාර්ය ඉතිහාස ප්‍රශ්න පත්‍රය.',
          ta: 'இலங்கை மற்றும் உலக வரலாற்றுத் தலைப்புகளை உள்ளடக்கிய கட்டாய வரலாற்று வினாத்தாள்.',
        },
      },
      {
        title: {
          en: 'Electives (ICT, Commerce, Geography, Art, Languages)',
          si: 'විකල්ප (ICT, වාණිජ, භූගෝල, කලා, භාෂා)',
          ta: 'தேர்வுப்பாடங்கள் (ICT, வணிகம், புவியியல், கலை, மொழிகள்)',
        },
        description: {
          en: 'Optional subjects such as ICT, Commerce, Geography, Art, or a second language.',
          si: 'ICT, වාණිජය, භූගෝල විද්‍යාව, කලාව හෝ දෙවන භාෂාව වැනි විකල්ප විෂයන්.',
          ta: 'ICT, வணிகம், புவியியல், கலை அல்லது இரண்டாம் மொழி போன்ற தேர்வுப்பாடங்கள்.',
        },
      },
    ],
  },
  {
    title: {
      en: 'G.C.E. Advanced Level (A/L)',
      si: 'සා.පෙ. උසස් පෙළ (A/L)',
      ta: 'க.பொ.த. உயர்தரம் (A/L)',
    },
    description: {
      en: 'Final school-leaving exam at Grade 13 (around ages 18–19). Sole gateway to free state universities; selection uses district-based Z-scores.',
      si: '13 ශ්‍රේණියේ (වයස අවුරුදු 18–19 පමණ) අවසන් පාසල් විභාගයයි. නොමිලේ රාජ්‍ය විශ්වවිද්‍යාල සඳහා එකම මාර්ගය; දිස්ත්‍රික් Z-score මත තෝරා ගැනේ.',
      ta: 'தரம் 13 இல் (சுமார் 18–19 வயது) இறுதிப் பள்ளித் தேர்வு. இலவச அரசுப் பல்கலைக்கழகங்களுக்கான ஒரே வாயில்; மாவட்ட Z-மதிப்பெண் அடிப்படையில் தேர்வு.',
    },
    modules: [
      {
        title: {
          en: 'Physical Science',
          si: 'භෞතික විද්‍යා ප්‍රවාහය',
          ta: 'பௌதிக அறிவியல் பிரிவு',
        },
        description: {
          en: 'Stream subjects such as Combined Mathematics, Physics, Chemistry, or ICT.',
          si: 'සංයුක්ත ගණිතය, භෞතික විද්‍යාව, රසායන විද්‍යාව හෝ ICT වැනි විෂයන්.',
          ta: 'கூட்டுக் கணிதம், இயற்பியல், வேதியியல் அல்லது ICT போன்ற பாடங்கள்.',
        },
      },
      {
        title: {
          en: 'Biological Science',
          si: 'ජීව විද්‍යා ප්‍රවාහය',
          ta: 'உயிரியல் அறிவியல் பிரிவு',
        },
        description: {
          en: 'Stream subjects such as Biology, Chemistry, Physics, or Agricultural Science.',
          si: 'ජීව විද්‍යාව, රසායන විද්‍යාව, භෞතික විද්‍යාව හෝ කෘෂිකර්ම විද්‍යාව වැනි විෂයන්.',
          ta: 'உயிரியல், வேதியியல், இயற்பியல் அல்லது விவசாய அறிவியல் போன்ற பாடங்கள்.',
        },
      },
      {
        title: { en: 'Commerce', si: 'වාණිජ ප්‍රවාහය', ta: 'வணிகப் பிரிவு' },
        description: {
          en: 'Stream subjects such as Business Studies, Accounting, and Economics.',
          si: 'ව්‍යාපාර අධ්‍යයනය, ගිණුම්කරණය සහ ආර්ථික විද්‍යාව වැනි විෂයන්.',
          ta: 'வணிகக் கல்வி, கணக்கியல் மற்றும் பொருளியல் போன்ற பாடங்கள்.',
        },
      },
      {
        title: { en: 'Arts', si: 'කලා ප්‍රවාහය', ta: 'கலைப் பிரிவு' },
        description: {
          en: 'Humanities and social sciences stream.',
          si: 'මානව ශාස්ත්‍ර සහ සමාජ විද්‍යා ප්‍රවාහය.',
          ta: 'மனிதவியல் மற்றும் சமூக அறிவியல் பிரிவு.',
        },
      },
      {
        title: {
          en: 'Technology',
          si: 'තාක්ෂණ ප්‍රවාහය',
          ta: 'தொழில்நுட்பப் பிரிவு',
        },
        description: {
          en: 'Engineering Technology or Bio-System Technology streams.',
          si: 'ඉංජිනේරු තාක්ෂණය හෝ ජෛව පද්ධති තාක්ෂණ ප්‍රවාහ.',
          ta: 'பொறியியல் தொழில்நுட்பம் அல்லது உயிர்-அமைப்பு தொழில்நுட்பப் பிரிவுகள்.',
        },
      },
    ],
  },
  {
    title: {
      en: "Driving Licence Examination (Sri Lanka)",
      si: "රියදුරු බලපත්‍ර විභාගය (ශ්‍රී ලංකාව)",
      ta: "ஓட்டுநர் உரிமத் தேர்வு (இலங்கை)",
    },
    description: {
      en: "Motor Traffic Department written theory and practical preparation for light and heavy vehicle licence categories in Sri Lanka.",
      si: "ශ්‍රී ලංකාවේ සැහැල්ලු සහ බර රථ වාහන බලපත්‍ර කාණ්ඩ සඳහා මෝටර් රථ ප්‍රවාහන දෙපාර්තමේන්තුවේ ලිඛිත න්‍යාය සහ ප්‍රායෝගික සූදානම.",
      ta: "இலங்கையில் இலகு மற்றும் கனரக வாகன உரிம வகைகளுக்கான மோட்டார் போக்குவரத்துத் திணைக்கள எழுத்துக் கோட்பாடு மற்றும் நடைமுறைத் தயாரிப்பு.",
    },
    modules: [
      {
        title: {
      en: "Highway Code & Road Signs",
      si: "මාර්ග නීති සහ මාර්ග සංඥා",
      ta: "நெடுஞ்சாலை விதிகள் & சாலை அடையாளங்கள்",
    },
        description: {
      en: "Road signs, markings, right of way, and Motor Traffic Act basics for the written paper.",
      si: "ලිඛිත ප්‍රශ්න පත්‍රය සඳහා මාර්ග සංඥා, රේඛා, ප්‍රමුඛතාව සහ මෝටර් රථ ප්‍රවාහන පනතේ මූලික කරුණු.",
      ta: "எழுத்துத் தேர்வுக்கான சாலை அடையாளங்கள், குறியீடுகள், முன்னுரிமை மற்றும் மோட்டார் போக்குவரத்துச் சட்ட அடிப்படைகள்.",
    },
      },
      {
        title: {
      en: "Light Vehicles (Car / Motorcycle)",
      si: "සැහැල්ලු වාහන (කාර් / යතුරුපැදි)",
      ta: "இலகு வாகனங்கள் (கார் / மோட்டார் சைக்கிள்)",
    },
        description: {
      en: "Theory for Class B (car) and Class A (motorcycle) licence categories.",
      si: "B පන්තිය (කාර්) සහ A පන්තිය (යතුරුපැදි) බලපත්‍ර කාණ්ඩ සඳහා න්‍යාය.",
      ta: "B வகுப்பு (கார்) மற்றும் A வகுப்பு (மோட்டார் சைக்கிள்) உரிம வகைகளுக்கான கோட்பாடு.",
    },
      },
      {
        title: {
      en: "Heavy Vehicles & Special Categories",
      si: "බර වාහන සහ විශේෂ කාණ්ඩ",
      ta: "கனரக வாகனங்கள் & சிறப்பு வகைகள்",
    },
        description: {
      en: "Preparation for bus, lorry, and other heavy / special licence classes.",
      si: "බස්, ලොරි සහ අනෙකුත් බර / විශේෂ බලපත්‍ර පන්ති සඳහා සූදානම.",
      ta: "பேருந்து, லாரி மற்றும் பிற கனரக / சிறப்பு உரிம வகுப்புகளுக்கான தயாரிப்பு.",
    },
      }
    ],
  },
];

async function seedCourseWithModules(courseDef: SeedCourse) {
  const course = await prisma.course.create({
    data: {
      title: courseDef.title,
      description: courseDef.description,
      status: 'Published',
      modules: {
        create: courseDef.modules.map((mod, index) => ({
          title: mod.title,
          description: mod.description,
          status: 'Published',
          sortOrder: index,
        })),
      },
    },
    include: { modules: { orderBy: { sortOrder: 'asc' } } },
  });
  return course;
}

async function main() {
  console.log('Clearing database...');

  await prisma.studentResponse.deleteMany({});
  await prisma.quizAttempt.deleteMany({});
  await prisma.guestLead.deleteMany({});
  await prisma.quizQuestion.deleteMany({});
  await prisma.quizSection.deleteMany({});
  await prisma.answerChoice.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.teacherProfileQuiz.deleteMany({});
  await prisma.paymentSlipSubmission.deleteMany({});
  await prisma.quizUnlock.deleteMany({});
  await prisma.unlockVoucher.deleteMany({});
  await prisma.studentSubscription.deleteMany({});
  await prisma.paymentOrder.deleteMany({});
  await prisma.quiz.deleteMany({});
  await prisma.module.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.teacherContactInquiry.deleteMany({});
  await prisma.teacherBanner.deleteMany({});
  await prisma.teacherClass.deleteMany({});
  await prisma.teacherPoster.deleteMany({});
  await prisma.teacherProfile.deleteMany({});
  await prisma.accessReview.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.customRole.deleteMany({});
  await prisma.permissionSet.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
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
      email: 'unzoysa.un@gmail.com',
      passwordHash,
      role: Role.SUPER_ADMIN,
      name: 'Super Admin',
      firstName: 'Super',
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

  const seededCourses: Awaited<ReturnType<typeof seedCourseWithModules>>[] = [];
  for (const courseDef of NATIONAL_EXAM_COURSES) {
    seededCourses.push(await seedCourseWithModules(courseDef));
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
  console.log('Courses seeded (no quizzes/questions):');
  for (let i = 0; i < NATIONAL_EXAM_COURSES.length; i += 1) {
    const def = NATIONAL_EXAM_COURSES[i];
    const course = seededCourses[i];
    console.log(`- ${def.title.en} (${course.modules.length} modules)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
