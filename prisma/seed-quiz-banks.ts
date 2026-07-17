import { QuestionType } from '@prisma/client';

export type Localized = { en: string; si: string; ta: string };

export type SeedMcqQuestion = {
  type: 'MCQ';
  text: Localized;
  choices: Localized[];
  correct: number;
  points?: number;
};

export type SeedShortQuestion = {
  type: 'SHORT_TEXT';
  text: Localized;
  acceptedAnswers: string[];
  points?: number;
};

export type SeedNumericQuestion = {
  type: 'NUMERIC';
  text: Localized;
  correctNumber: number;
  tolerance?: number;
  points?: number;
};

export type SeedSequenceQuestion = {
  type: 'SEQUENCE';
  text: Localized;
  /** Items in the correct order (will be shuffled in UI via SEQUENCE). */
  items: Localized[];
  points?: number;
};

export type SeedQuestion =
  | SeedMcqQuestion
  | SeedShortQuestion
  | SeedNumericQuestion
  | SeedSequenceQuestion;

export type SeedQuizDef = {
  title: Localized;
  description: Localized;
  /** Course index in NATIONAL_EXAM_COURSES */
  courseIndex: number;
  /** Module index within that course */
  moduleIndex: number;
  durationMinutes: number;
  passingScorePercentage: number;
  requiresUnlock?: boolean;
  priceLkr?: number | null;
  questions: SeedQuestion[];
};

function L(en: string, si: string, ta: string): Localized {
  return { en, si, ta };
}

/** 5 quizzes × 4 courses = 20 published quizzes with real multilingual content. */
export const PUBLISHED_QUIZ_BANK: SeedQuizDef[] = [
  // ─── Grade 5 Scholarship (5) — mixed MCQ / fill-blank / numeric / sequence ───
  {
    courseIndex: 0,
    moduleIndex: 0,
    durationMinutes: 20,
    passingScorePercentage: 60,
    title: L(
      'Scholarship Aptitude — Paper 01',
      'ශිෂ්‍යත්ව දක්ෂතාව — ප්‍රශ්න පත්‍රය 01',
      'புலமைப்பரிசில் திறன் — வினாத்தாள் 01',
    ),
    description: L(
      'MCQ aptitude set: patterns, number sense, and everyday reasoning for Grade 5 Scholarship.',
      '5 ශ්‍රේණියේ ශිෂ්‍යත්වය සඳහා රටා, සංඛ්‍යා බුද්ධිය සහ එදිනෙදා තර්කන MCQ කට්ටලයකි.',
      'தரம் 5 புலமைப்பரிசிலுக்கான வடிவங்கள், எண் உணர்வு மற்றும் அன்றாட பகுத்தறிவு MCQ தொகுப்பு.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('What is the next number: 2, 4, 6, 8, ?', 'ඊළඟ සංඛ්‍යාව කුමක්ද: 2, 4, 6, 8, ?', 'அடுத்த எண் என்ன: 2, 4, 6, 8, ?'),
        choices: [L('9', '9', '9'), L('10', '10', '10'), L('12', '12', '12'), L('14', '14', '14')],
        correct: 1,
      },
      {
        type: 'MCQ',
        text: L('Which shape has 3 sides?', 'පැති 3ක් ඇති හැඩය කුමක්ද?', '3 பக்கங்கள் உள்ள வடிவம் எது?'),
        choices: [L('Square', 'චතුරස්‍රය', 'சதுரம்'), L('Triangle', 'ත්‍රිකෝණය', 'முக்கோணம்'), L('Circle', 'වෘත්තය', 'வட்டம்'), L('Rectangle', 'සෘජුකෝණාස්‍රය', 'செவ்வகம்')],
        correct: 1,
      },
      {
        type: 'MCQ',
        text: L('If today is Monday, what day is after 2 days?', 'අද සඳුදා නම්, දින 2කට පසු කුමන දිනයද?', 'இன்று திங்கள் என்றால், 2 நாட்களுக்குப் பிறகு எந்த நாள்?'),
        choices: [L('Tuesday', 'අඟහරුවාදා', 'செவ்வாய்'), L('Wednesday', 'බදාදා', 'புதன்'), L('Thursday', 'බ්‍රහස්පතින්දා', 'வியாழன்'), L('Friday', 'සිකුරාදා', 'வெள்ளி')],
        correct: 1,
      },
      {
        type: 'MCQ',
        text: L('How many months have 31 days?', 'දින 31ක් ඇති මාස කීයක්ද?', '31 நாட்கள் உள்ள மாதங்கள் எத்தனை?'),
        choices: [L('5', '5', '5'), L('6', '6', '6'), L('7', '7', '7'), L('8', '8', '8')],
        correct: 2,
      },
      {
        type: 'MCQ',
        text: L('Which is the odd one out: cat, dog, cow, car?', 'වෙනස් එක කුමක්ද: බළලා, බල්ලා, ගවයා, මෝටර් රථය?', 'வேறுபட்டது எது: பூனை, நாய், பசு, கார்?'),
        choices: [L('cat', 'බළලා', 'பூனை'), L('dog', 'බල්ලා', 'நாய்'), L('cow', 'ගවයා', 'பசு'), L('car', 'මෝටර් රථය', 'கார்')],
        correct: 3,
      },
    ],
  },
  {
    courseIndex: 0,
    moduleIndex: 1,
    durationMinutes: 20,
    passingScorePercentage: 60,
    title: L(
      'Scholarship Intelligence — Patterns',
      'ශිෂ්‍යත්ව බුද්ධිය — රටා',
      'புலமைப்பரிசில் அறிவுத்திறன் — வடிவங்கள்',
    ),
    description: L(
      'Intelligence-style items: sequences, odd-one-out, and ordering practice.',
      'අනුක්‍රම, වෙනස් එක සහ අනුපිළිවෙල පුහුණුව ඇතුළු බුද්ධි වර්ගයේ ප්‍රශ්න.',
      'வரிசைகள், வேறுபட்டவை மற்றும் வரிசைப்படுத்தல் பயிற்சி உள்ளிட்ட அறிவுத்திறன் கேள்விகள்.',
    ),
    questions: [
      {
        type: 'SEQUENCE',
        text: L('Arrange from smallest to largest.', 'කුඩාම සිට විශාලතම දක්වා පෙළගස්වන්න.', 'சிறியதிலிருந்து பெரியது வரை வரிசைப்படுத்துங்கள்.'),
        items: [L('1', '1', '1'), L('3', '3', '3'), L('5', '5', '5'), L('8', '8', '8')],
      },
      {
        type: 'MCQ',
        text: L('Complete: A, C, E, G, ?', 'සම්පූර්ණ කරන්න: A, C, E, G, ?', 'நிறைவு செய்க: A, C, E, G, ?'),
        choices: [L('H', 'H', 'H'), L('I', 'I', 'I'), L('J', 'J', 'J'), L('K', 'K', 'K')],
        correct: 1,
      },
      {
        type: 'MCQ',
        text: L('Which does not belong: spoon, fork, knife, book?', 'අයත් නොවන්නේ: හැන්ද, ගෑරුප්පුව, පිහිය, පොත?', 'சேராதது: கரண்டி, முள்வேல், கத்தி, புத்தகம்?'),
        choices: [L('spoon', 'හැන්ද', 'கரண்டி'), L('fork', 'ගෑරුප්පුව', 'முள்வேல்'), L('knife', 'පිහිය', 'கத்தி'), L('book', 'පොත', 'புத்தகம்')],
        correct: 3,
      },
      {
        type: 'NUMERIC',
        text: L('How many legs do 3 cats have in total?', 'බළලුන් 3 දෙනෙකුට මුළු කකුල් කීයක්ද?', '3 பூனைகளுக்கு மொத்தம் எத்தனை கால்கள்?'),
        correctNumber: 12,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in the blank: The opposite of hot is ____.', 'හිස්තැන පුරවන්න: උණුසුමට විරුද්ධ වචනය ____ වේ.', 'வெற்றிடத்தை நிரப்புக: சூடானதற்கு எதிர்ச்சொல் ____.'),
        acceptedAnswers: ['cold', 'Cold', 'ශීතල', 'குளிர்', 'குளிர்ச்சி'],
      },
    ],
  },
  {
    courseIndex: 0,
    moduleIndex: 2,
    durationMinutes: 25,
    passingScorePercentage: 60,
    title: L(
      'Scholarship Sinhala — Language Skills',
      'ශිෂ්‍යත්ව සිංහල — භාෂා කුසලතා',
      'புலமைப்பரிசில் சிங்களம் — மொழித் திறன்',
    ),
    description: L(
      'Sinhala comprehension and fill-in-the-blank language practice for scholarship.',
      'ශිෂ්‍යත්වය සඳහා සිංහල අවබෝධය සහ හිස්තැන් පිරවීමේ භාෂා පුහුණුව.',
      'புலமைப்பரிசிலுக்கான சிங்களப் புரிதல் மற்றும் வெற்றிட நிரப்பும் மொழிப் பயிற்சி.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Which word means “school” in Sinhala?', 'සිංහලෙන් “පාසල” යන්නෙහි අර්ථය නිවැරදි වචනය කුමක්ද?', 'சிங்களத்தில் “பள்ளி” என்பதன் பொருள் எந்தச் சொல்?'),
        choices: [L('පොත', 'පොත', 'புத்தகம்'), L('පාසල', 'පාසල', 'பள்ளி'), L('ගෙදර', 'ගෙදර', 'வீடு'), L('මිතුරා', 'මිතුරා', 'நண்பர்')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: අම්මා සහ ____ ගෙදර සිටිති. (father)', 'හිස්තැන: අම්මා සහ ____ ගෙදර සිටිති.', 'நிரப்புக: அம்மா மற்றும் ____ வீட்டில் இருக்கிறார்கள். (தந்தை)'),
        acceptedAnswers: ['තාත්තා', 'පියා', 'appa', 'அப்பா', 'தந்தை'],
      },
      {
        type: 'MCQ',
        text: L('How many letters are in the English word “APPLE”?', '“APPLE” යන ඉංග්‍රීසි වචනයේ අකුරු කීයක්ද?', '“APPLE” என்ற ஆங்கிலச் சொல்லில் எத்தனை எழுத்துகள்?'),
        choices: [L('4', '4', '4'), L('5', '5', '5'), L('6', '6', '6'), L('7', '7', '7')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Write the plural of “book”.', '“book” යන වචනයේ බහු වචනය ලියන්න.', '“book” என்பதன் பன்மை வடிவை எழுதுங்கள்.'),
        acceptedAnswers: ['books', 'Books'],
      },
      {
        type: 'MCQ',
        text: L('Which sentence is a question?', 'ප්‍රශ්නයක් වන වාක්‍යය කුමක්ද?', 'கேள்வியாக உள்ள வாக்கியம் எது?'),
        choices: [
          L('I go to school.', 'මම පාසලට යමි.', 'நான் பள்ளிக்குச் செல்கிறேன்.'),
          L('Where is my bag?', 'මගේ බෑගය කොහෙද?', 'என் பை எங்கே?'),
          L('She is happy.', 'ඇය සතුටුයි.', 'அவள் மகிழ்ச்சியாக இருக்கிறாள்.'),
          L('We play cricket.', 'අපි ක්‍රිකට් ක්‍රීඩා කරමු.', 'நாங்கள் கிரிக்கெட் விளையாடுகிறோம்.'),
        ],
        correct: 1,
      },
    ],
  },
  {
    courseIndex: 0,
    moduleIndex: 0,
    durationMinutes: 25,
    passingScorePercentage: 55,
    requiresUnlock: true,
    priceLkr: null,
    title: L(
      'Scholarship Mixed Practice — Fill & Numbers',
      'ශිෂ්‍යත්ව මිශ්‍ර පුහුණුව — පිරවීම සහ සංඛ්‍යා',
      'புலமைப்பரிசில் கலப்புப் பயிற்சி — நிரப்புதல் & எண்கள்',
    ),
    description: L(
      'Locked monthly practice mixing fill-in-the-blank, numeric answers, and MCQ.',
      'හිස්තැන් පිරවීම, සංඛ්‍යාත්මක පිළිතුරු සහ MCQ මිශ්‍ර අගුළු ලූ මාසික පුහුණුව.',
      'வெற்றிட நிரப்புதல், எண் விடைகள் மற்றும் MCQ கலந்த பூட்டிய மாதப் பயிற்சி.',
    ),
    questions: [
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: Water freezes at ____ degrees Celsius.', 'හිස්තැන: ජලය ____ °C දී කැටි වේ.', 'நிரப்புக: நீர் ____ °C இல் உறைகிறது.'),
        acceptedAnswers: ['0', 'zero', 'Zero'],
      },
      {
        type: 'NUMERIC',
        text: L('What is 15 + 27?', '15 + 27 කුමක්ද?', '15 + 27 என்ன?'),
        correctNumber: 42,
      },
      {
        type: 'NUMERIC',
        text: L('A pencil costs Rs 20. Cost of 3 pencils?', 'පැන්සලක මිල රු. 20යි. පැන්සල් 3ක මිල?', 'ஒரு பென்சில் ரூ.20. 3 பென்சில்களின் விலை?'),
        correctNumber: 60,
      },
      {
        type: 'MCQ',
        text: L('Half of 48 is:', '48 න් අඩක්:', '48 இன் பாதி:'),
        choices: [L('12', '12', '12'), L('24', '24', '24'), L('36', '36', '36'), L('48', '48', '48')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: The capital of Sri Lanka is ____.', 'හිස්තැන: ශ්‍රී ලංකාවේ අගනුවර ____ වේ.', 'நிரப்புக: இலங்கையின் தலைநகரம் ____.'),
        acceptedAnswers: [
          'Sri Jayawardenepura Kotte',
          'Sri Jayawardenapura Kotte',
          'Kotte',
          'ශ්‍රී ජයවර්ධනපුර කෝට්ටේ',
          'කෝට්ටේ',
          'ஸ்ரீ ஜயவர்தனபுர கோட்டே',
          'கோட்டே',
        ],
      },
      {
        type: 'SEQUENCE',
        text: L('Order the days: start from Monday.', 'දින පෙළගස්වන්න: සඳුදා සිට.', 'நாட்களை வரிசைப்படுத்துங்கள்: திங்கள் முதல்.'),
        items: [
          L('Monday', 'සඳුදා', 'திங்கள்'),
          L('Tuesday', 'අඟහරුවාදා', 'செவ்வாய்'),
          L('Wednesday', 'බදාදා', 'புதன்'),
        ],
      },
    ],
  },
  {
    courseIndex: 0,
    moduleIndex: 3,
    durationMinutes: 20,
    passingScorePercentage: 60,
    title: L(
      'Scholarship Tamil Language — Basics',
      'ශිෂ්‍යත්ව දෙමළ භාෂාව — මූලික',
      'புலமைப்பரிசில் தமிழ் மொழி — அடிப்படை',
    ),
    description: L(
      'Tamil first-language basics with MCQ and short fill answers.',
      'MCQ සහ කෙටි පිරවුම් සහිත දෙමළ මාතෘ භාෂා මූලික පුහුණුව.',
      'MCQ மற்றும் குறுகிய நிரப்பு விடைகளுடன் தமிழ் தாய்மொழி அடிப்படைப் பயிற்சி.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Which is a Tamil greeting?', 'දෙමළ ආචාරයක් කුමක්ද?', 'தமிழ் வாழ்த்து எது?'),
        choices: [L('Ayubowan', 'ආයුබෝවන්', 'ஆயுபோவன்'), L('Vanakkam', 'වණක්කම්', 'வணக்கம்'), L('Hello only', 'Hello පමණි', 'Hello மட்டும்'), L('Goodbye', 'සුබ ගමන්', 'போய் வருக')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in Tamil: அம்மா means ____ in English.', 'හිස්තැන: அம்மா යනු ඉංග්‍රීසියෙන් ____ ය.', 'நிரப்புக: அம்மா என்றால் ஆங்கிலத்தில் ____.'),
        acceptedAnswers: ['mother', 'Mother', 'mom', 'Mum', 'amma'],
      },
      {
        type: 'MCQ',
        text: L('How many vowels are commonly taught first in Tamil?', 'දෙමළෙන් පළමුව ඉගැන්වෙන ස්වර කීයක්ද?', 'தமிழில் முதலில் கற்பிக்கப்படும் உயிரெழுத்துகள் எத்தனை?'),
        choices: [L('5', '5', '5'), L('10', '10', '10'), L('12', '12', '12'), L('18', '18', '18')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('Count: ௧ + ௨ = ? (Tamil digits 1+2)', 'ගණන් කරන්න: ௧ + ௨ = ?', 'எண்ணுங்கள்: ௧ + ௨ = ?'),
        correctNumber: 3,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Write “water” in Tamil (நீர்).', '“ජලය” දෙමළෙන් ලියන්න (நீர்).', '“நீர்” என்று தமிழில் எழுதுங்கள்.'),
        acceptedAnswers: ['நீர்', 'neer', 'Neer'],
      },
    ],
  },

  // ─── O/L (5) ───
  {
    courseIndex: 1,
    moduleIndex: 0,
    durationMinutes: 40,
    passingScorePercentage: 50,
    title: L(
      'O/L Mathematics — Algebra & Numbers',
      'O/L ගණිතය — වීජ ගණිතය සහ සංඛ්‍යා',
      'O/L கணிதம் — இயற்கணிதம் & எண்கள்',
    ),
    description: L(
      'Real O/L-style Mathematics: fractions, equations, percentages, and number work.',
      'O/L විලාසිතා ගණිතය: භාග, සමීකරණ, ප්‍රතිශත සහ සංඛ්‍යා කාර්ය.',
      'O/L பாணி கணிதம்: பின்னங்கள், சமன்பாடுகள், சதவீதங்கள் மற்றும் எண் வேலை.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Simplify: 2/4', 'සරල කරන්න: 2/4', 'எளிதாக்குக: 2/4'),
        choices: [L('1/4', '1/4', '1/4'), L('1/2', '1/2', '1/2'), L('2/2', '2/2', '2/2'), L('4/2', '4/2', '4/2')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('Solve for x: x + 7 = 15', 'x සොයන්න: x + 7 = 15', 'x ஐத் தீர்க்க: x + 7 = 15'),
        correctNumber: 8,
      },
      {
        type: 'MCQ',
        text: L('25% of 200 is:', '200 න් 25%:', '200 இன் 25%:'),
        choices: [L('25', '25', '25'), L('40', '40', '40'), L('50', '50', '50'), L('75', '75', '75')],
        correct: 2,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: The square of 9 is ____.', 'හිස්තැන: 9 හි වර්ගය ____ වේ.', 'நிரப்புக: 9 இன் வர்க்கம் ____.'),
        acceptedAnswers: ['81'],
      },
      {
        type: 'MCQ',
        text: L('Perimeter of a square of side 5 cm is:', 'පැත්ත 5 cm වූ චතුරස්‍රයක පරිමිතිය:', 'பக்கம் 5 cm உள்ள சதுரத்தின் சுற்றளவு:'),
        choices: [L('10 cm', '10 cm', '10 cm'), L('15 cm', '15 cm', '15 cm'), L('20 cm', '20 cm', '20 cm'), L('25 cm', '25 cm', '25 cm')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('What is 12 × 11?', '12 × 11 කුමක්ද?', '12 × 11 என்ன?'),
        correctNumber: 132,
      },
    ],
  },
  {
    courseIndex: 1,
    moduleIndex: 1,
    durationMinutes: 35,
    passingScorePercentage: 50,
    title: L(
      'O/L Science — Matter & Life',
      'O/L විද්‍යාව — ද්‍රව්‍ය සහ ජීවය',
      'O/L அறிவியல் — பொருள் & உயிர்',
    ),
    description: L(
      'O/L Science practice: states of matter, photosynthesis, and human body basics.',
      'O/L විද්‍යා පුහුණුව: ද්‍රව්‍ය අවස්ථා, ප්‍රභාසංශ්ලේෂණය සහ මානව ශරීර මූලික.',
      'O/L அறிவியல் பயிற்சி: பொருளின் நிலைகள், ஒளிச்சேர்க்கை மற்றும் மனித உடல் அடிப்படை.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Which is a solid at room temperature?', 'කාමර උෂ්ණත්වයේ ඝන වන්නේ කුමක්ද?', 'அறை வெப்பநிலையில் திடமாக இருப்பது எது?'),
        choices: [L('Water', 'ජලය', 'நீர்'), L('Oxygen', 'ඔක්සිජන්', 'ஆக்ஸிஜன்'), L('Iron', 'යකඩ', 'இரும்பு'), L('Nitrogen', 'නයිට්‍රජන්', 'நைட்ரஜன்')],
        correct: 2,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: Plants make food by ____.', 'හිස්තැන: ශාක ____ මගින් ආහාර සාදයි.', 'நிரப்புக: தாவரங்கள் ____ மூலம் உணவு தயாரிக்கின்றன.'),
        acceptedAnswers: ['photosynthesis', 'Photosynthesis', 'ප්‍රභාසංශ්ලේෂණය', 'ஒளிச்சேர்க்கை'],
      },
      {
        type: 'MCQ',
        text: L('The organ that pumps blood is the:', 'ලේ පොම්ප කරන අවයවය:', 'இரத்தத்தை பம்ப் செய்யும் உறுப்பு:'),
        choices: [L('Lung', 'පෙනහළුව', 'நுரையீரல்'), L('Heart', 'හෘදය', 'இதயம்'), L('Liver', 'අක්මාව', 'கல்லீரல்'), L('Kidney', 'වකුගඩුව', 'சிறுநீரகம்')],
        correct: 1,
      },
      {
        type: 'MCQ',
        text: L('Boiling point of pure water at 1 atm is about:', '1 atm දී පිරිසිදු ජලයේ තාපාංකය ආසන්න වශයෙන්:', '1 atm இல் தூய நீரின் கொதிநிலை சுமார்:'),
        choices: [L('0 °C', '0 °C', '0 °C'), L('50 °C', '50 °C', '50 °C'), L('100 °C', '100 °C', '100 °C'), L('212 °C', '212 °C', '212 °C')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('How many bones are commonly cited in an adult human skeleton?', 'වැඩිහිටි මානව ඇටසැකිල්ලේ සාමාන්‍යයෙන් සඳහන් අස්ථි ගණන?', 'வயது வந்தோர் எலும்புக்கூட்டில் பொதுவாகக் கூறப்படும் எலும்புகள் எத்தனை?'),
        correctNumber: 206,
      },
    ],
  },
  {
    courseIndex: 1,
    moduleIndex: 3,
    durationMinutes: 30,
    passingScorePercentage: 50,
    title: L(
      'O/L English — Grammar & Vocabulary',
      'O/L ඉංග්‍රීසි — ව්‍යාකරණ සහ වචන මාලාව',
      'O/L ஆங்கிலம் — இலக்கணம் & சொல்லகராதி',
    ),
    description: L(
      'Compulsory O/L English practice: articles, tenses, and vocabulary fill-ins.',
      'අනිවාර්ය O/L ඉංග්‍රීසි පුහුණුව: නාම පද උපසර්ග, කාල සහ වචන මාලා පිරවුම්.',
      'கட்டாய O/L ஆங்கிலப் பயிற்சி: உருபுகள், காலங்கள் மற்றும் சொல்லகராதி நிரப்புதல்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Choose the correct article: ___ apple', 'නිවැරදි article තෝරන්න: ___ apple', 'சரியான உருபைத் தேர்ந்தெடுக்க: ___ apple'),
        choices: [L('a', 'a', 'a'), L('an', 'an', 'an'), L('the', 'the', 'the'), L('no article', 'article නැත', 'உருபு இல்லை')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in past tense: Yesterday I ____ (go) to school.', 'අතීත කාලය: Yesterday I ____ (go) to school.', 'இறந்தகாலம்: Yesterday I ____ (go) to school.'),
        acceptedAnswers: ['went', 'Went'],
      },
      {
        type: 'MCQ',
        text: L('Synonym of “happy”:', '“happy” යන වචනයේ සමානාර්ථය:', '“happy” என்பதன் ஒத்தசொல்:'),
        choices: [L('sad', 'දුක්ඛිත', 'வருத்தம்'), L('angry', 'කෝප', 'கோபம்'), L('joyful', 'සතුටු', 'மகிழ்ச்சி'), L('tired', 'වෙහෙස', 'சோர்வு')],
        correct: 2,
      },
      {
        type: 'MCQ',
        text: L('Which is a noun?', 'නාම පදයක් කුමක්ද?', 'பெயர்ச்சொல் எது?'),
        choices: [L('quickly', 'quickly', 'quickly'), L('beautiful', 'beautiful', 'beautiful'), L('teacher', 'teacher', 'teacher'), L('run', 'run', 'run')],
        correct: 2,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: She ____ (be) a student.', 'හිස්තැන: She ____ (be) a student.', 'நிரப்புக: She ____ (be) a student.'),
        acceptedAnswers: ['is', 'Is'],
      },
    ],
  },
  {
    courseIndex: 1,
    moduleIndex: 5,
    durationMinutes: 30,
    passingScorePercentage: 50,
    title: L(
      'O/L History — Sri Lanka Basics',
      'O/L ඉතිහාසය — ශ්‍රී ලංකා මූලික',
      'O/L வரலாறு — இலங்கை அடிப்படை',
    ),
    description: L(
      'Compulsory History themes: ancient kingdoms, independence, and national symbols.',
      'අනිවාර්ය ඉතිහාස තේමා: පුරාණ රාජධානි, නිදහස සහ ජාතික සංකේත.',
      'கட்டாய வரலாற்றுத் தலைப்புகள்: பண்டைய அரசுகள், சுதந்திரம் மற்றும் தேசியச் சின்னங்கள்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Sri Lanka gained independence in:', 'ශ්‍රී ලංකාවට නිදහස ලැබුණේ:', 'இலங்கை சுதந்திரம் பெற்ற ஆண்டு:'),
        choices: [L('1942', '1942', '1942'), L('1948', '1948', '1948'), L('1956', '1956', '1956'), L('1972', '1972', '1972')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: Anuradhapura was an ancient ____ of Sri Lanka.', 'හිස්තැන: අනුරාධපුරය ශ්‍රී ලංකාවේ පුරාණ ____ විය.', 'நிரப்புக: அனுராதபுரம் இலங்கையின் பண்டைய ____ ஆகும்.'),
        acceptedAnswers: ['capital', 'Capital', 'kingdom', 'city', 'අගනුවර', 'රාජධානිය', 'தலைநகரம்', 'அரசு'],
      },
      {
        type: 'MCQ',
        text: L('The national flower of Sri Lanka is the:', 'ශ්‍රී ලංකාවේ ජාතික මල:', 'இலங்கையின் தேசிய மலர்:'),
        choices: [L('Rose', 'රෝස', 'ரோஜா'), L('Blue water lily (Nil Manel)', 'නිල් මානෙල්', 'நீல அல்லி (நில மானெல்)'), L('Lotus only in India', 'ඉන්දියාවේ පමණි', 'இந்தியாவில் மட்டும்'), L('Jasmine', 'සමන්', 'மல்லி')],
        correct: 1,
      },
      {
        type: 'MCQ',
        text: L('Sigiriya is best known as a:', 'සීගිරිය ප්‍රසිද්ධ වන්නේ:', 'சிகிரியா அறியப்படுவது:'),
        choices: [L('Beach', 'වෙරළ', 'கடற்கரை'), L('Rock fortress / palace', 'ගල් බලකොටුව / මාලිගාව', 'பாறைக் கோட்டை / அரண்மனை'), L('Harbour', 'වරාය', 'துறைமுகம்'), L('Tea factory', 'තේ කර්මාන්තශාලාව', 'தேயிலை தொழிற்சாலை')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('In which year did Sri Lanka become a republic (Sri Lanka)?', 'ශ්‍රී ලංකාව ජනරජයක් වූ වර්ෂය?', 'இலங்கை குடியரசாக மாறிய ஆண்டு?'),
        correctNumber: 1972,
      },
    ],
  },
  {
    courseIndex: 1,
    moduleIndex: 0,
    durationMinutes: 45,
    passingScorePercentage: 45,
    requiresUnlock: true,
    priceLkr: 250,
    title: L(
      'O/L Mathematics — Practice Paper (Premium)',
      'O/L ගණිතය — පුහුණු ප්‍රශ්න පත්‍රය (Premium)',
      'O/L கணிதம் — பயிற்சி வினாத்தாள் (Premium)',
    ),
    description: L(
      'Special-priced O/L Maths paper: geometry, ratios, and word problems.',
      'විශේෂ මිලක් සහිත O/L ගණිත පත්‍රය: ජ්‍යාමිතිය, අනුපාත සහ වචන ගැටලු.',
      'சிறப்பு விலையுள்ள O/L கணிதத்தாள்: வடிவியல், விகிதங்கள் மற்றும் சொல் சிக்கல்கள்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Area of a rectangle 8 cm by 3 cm is:', '8 cm × 3 cm සෘජුකෝණාස්‍රයක වර්ගඵලය:', '8 cm × 3 cm செவ்வகத்தின் பரப்பளவு:'),
        choices: [L('11 cm²', '11 cm²', '11 cm²'), L('22 cm²', '22 cm²', '22 cm²'), L('24 cm²', '24 cm²', '24 cm²'), L('48 cm²', '48 cm²', '48 cm²')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('Ratio 2:3. If first part is 10, second part is?', 'අනුපාතය 2:3. පළමු කොටස 10 නම් දෙවැන්න?', 'விகிதம் 2:3. முதல் பகுதி 10 என்றால் இரண்டாவது?'),
        correctNumber: 15,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: π is approximately ____ (use 22/7 or 3.14).', 'හිස්තැන: π ආසන්න වශයෙන් ____.', 'நிரப்புக: π தோராயமாக ____.'),
        acceptedAnswers: ['3.14', '22/7', '3.142'],
      },
      {
        type: 'MCQ',
        text: L('The mean of 2, 4, 6 is:', '2, 4, 6 හි මධ්‍යකය:', '2, 4, 6 இன் சராசரி:'),
        choices: [L('3', '3', '3'), L('4', '4', '4'), L('5', '5', '5'), L('6', '6', '6')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('A bus travels 60 km in 2 hours. Speed in km/h?', 'බස් රථයක් පැය 2කින් කි.මී. 60ක් යයි. වේගය කි.මී./පැය?', 'பேருந்து 2 மணிநேரத்தில் 60 கி.மீ செல்கிறது. வேகம் கி.மீ/மணி?'),
        correctNumber: 30,
      },
    ],
  },

  // ─── A/L (5) ───
  {
    courseIndex: 2,
    moduleIndex: 0,
    durationMinutes: 40,
    passingScorePercentage: 45,
    title: L(
      'A/L Combined Mathematics — Functions',
      'A/L සංයුක්ත ගණිතය — ශ්‍රිත',
      'A/L கூட்டுக் கணிதம் — சார்புகள்',
    ),
    description: L(
      'Physical Science stream: basic functions, limits intro, and algebra.',
      'භෞතික විද්‍යා ප්‍රවාහය: මූලික ශ්‍රිත, සීමා හැඳින්වීම සහ වීජ ගණිතය.',
      'பௌதிக அறிவியல் பிரிவு: அடிப்படைச் சார்புகள், எல்லை அறிமுகம் மற்றும் இயற்கணிதம்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('If f(x)=2x+1, then f(3)=', 'f(x)=2x+1 නම් f(3)=', 'f(x)=2x+1 என்றால் f(3)='),
        choices: [L('5', '5', '5'), L('6', '6', '6'), L('7', '7', '7'), L('8', '8', '8')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('Derivative of x² with respect to x at x=3 (2x at 3)?', 'x=3 දී x² හි අවකලනය (2x)?', 'x=3 இல் x² இன் வகைக்கெழு (2x)?'),
        correctNumber: 6,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: The quadratic formula solves ____ equations.', 'හිස්තැන: වර්ගජ සූත්‍රය ____ සමීකරණ විසඳයි.', 'நிரப்புக: இருபடிச் சூத்திரம் ____ சமன்பாடுகளைத் தீர்க்கிறது.'),
        acceptedAnswers: ['quadratic', 'Quadratic', 'වර්ගජ', 'இருபடி'],
      },
      {
        type: 'MCQ',
        text: L('sin(90°) equals:', 'sin(90°) =', 'sin(90°) =' ),
        choices: [L('0', '0', '0'), L('1/2', '1/2', '1/2'), L('1', '1', '1'), L('√2/2', '√2/2', '√2/2')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('log₁₀(100) =', 'log₁₀(100) =', 'log₁₀(100) ='),
        correctNumber: 2,
      },
    ],
  },
  {
    courseIndex: 2,
    moduleIndex: 1,
    durationMinutes: 35,
    passingScorePercentage: 45,
    title: L(
      'A/L Biology — Cell & Genetics Intro',
      'A/L ජීව විද්‍යාව — සෛල සහ ජාන විද්‍යා හැඳින්වීම',
      'A/L உயிரியல் — செல் & மரபியல் அறிமுகம்',
    ),
    description: L(
      'Biological Science stream: cells, DNA basics, and classification.',
      'ජීව විද්‍යා ප්‍රවාහය: සෛල, DNA මූලික සහ වර්ගීකරණය.',
      'உயிரியல் அறிவியல் பிரிவு: செல்கள், DNA அடிப்படை மற்றும் வகைப்பாடு.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Powerhouse of the cell is the:', 'සෛලයේ බලාගාරය:', 'செல்லின் ஆற்றல் நிலையம்:'),
        choices: [L('Nucleus', 'න්‍යෂ්ටිය', 'அணுக்கரு'), L('Mitochondrion', 'මයිටොකොන්ඩ්‍රියාව', 'மைட்டோகாண்ட்ரியா'), L('Ribosome', 'රයිබොසෝමය', 'ரைபோசோம்'), L('Golgi body', 'ගොල්ගි කාය', 'கோல்கி உடல்')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: DNA stands for ____.', 'හිස්තැන: DNA යනු ____ යන්නෙහි කෙටි යෙදුමයි.', 'நிரப்புக: DNA என்பதன் விரிவாக்கம் ____.'),
        acceptedAnswers: [
          'Deoxyribonucleic acid',
          'deoxyribonucleic acid',
          'Deoxyribonucleic Acid',
        ],
      },
      {
        type: 'MCQ',
        text: L('Photosynthesis mainly occurs in:', 'ප්‍රභාසංශ්ලේෂණය ප්‍රධාන වශයෙන් සිදුවන්නේ:', 'ஒளிச்சேர்க்கை முக்கியமாக நடைபெறுவது:'),
        choices: [L('Roots', 'මුල්', 'வேர்கள்'), L('Chloroplasts', 'ක්ලෝරෝප්ලාස්ට', 'பச்சையங்கள்'), L('Xylem only', 'දාරුකාව පමණි', 'சைலம் மட்டும்'), L('Stomata only', 'පත්‍රසිදුරු පමණි', 'இலைத்துளைகள் மட்டும்')],
        correct: 1,
      },
      {
        type: 'MCQ',
        text: L('Humans have how many pairs of chromosomes?', 'මිනිසුන්ට ක්‍රෝමොසෝම යුගල කීයක්ද?', 'மனிதர்களுக்கு எத்தனை இணை குரோமோசோம்கள்?'),
        choices: [L('22', '22', '22'), L('23', '23', '23'), L('24', '24', '24'), L('46', '46', '46')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('Number of chambers in a human heart?', 'මානව හෘදයේ කුටි ගණන?', 'மனித இதயத்தில் உள்ள அறைகளின் எண்ணிக்கை?'),
        correctNumber: 4,
      },
    ],
  },
  {
    courseIndex: 2,
    moduleIndex: 2,
    durationMinutes: 35,
    passingScorePercentage: 45,
    title: L(
      'A/L Business Studies — Basics',
      'A/L ව්‍යාපාර අධ්‍යයනය — මූලික',
      'A/L வணிகக் கல்வி — அடிப்படை',
    ),
    description: L(
      'Commerce stream: forms of business, marketing mix, and accounting terms.',
      'වාණිජ ප්‍රවාහය: ව්‍යාපාර ආකාර, අලෙවිකරණ මිශ්‍රණය සහ ගිණුම්කරණ පද.',
      'வணிகப் பிரிவு: வணிக வடிவங்கள், சந்தைப்படுத்தல் கலவை மற்றும் கணக்கியல் சொற்கள்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Which is a sole proprietorship feature?', 'තනි හිමිකාරීත්වයක ලක්ෂණයක්:', 'தனி உரிமையின் அம்சம்:'),
        choices: [
          L('Owned by one person', 'එක් අයෙකුට අයිති', 'ஒருவருக்குச் சொந்தம்'),
          L('Must have 50 partners', 'සහකරුවන් 50ක් අනිවාර්යයි', '50 பங்குதாரர்கள் கட்டாயம்'),
          L('Always a government company', 'සැමවිට රජයේ සමාගමකි', 'எப்போதும் அரசு நிறுவனம்'),
          L('No owner', 'හිමිකරු නැත', 'உரிமையாளர் இல்லை'),
        ],
        correct: 0,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: The 4Ps of marketing include Product, Price, Place and ____.', 'හිස්තැන: අලෙවිකරණ 4P තුළ Product, Price, Place සහ ____ ඇත.', 'நிரப்புக: சந்தைப்படுத்தலின் 4P இல் Product, Price, Place மற்றும் ____.'),
        acceptedAnswers: ['Promotion', 'promotion', 'ප්‍රවර්ධනය', 'விளம்பரம்'],
      },
      {
        type: 'MCQ',
        text: L('Assets − Liabilities =', 'වත්කම් − වගකීම් =', 'சொத்துகள் − பொறுப்புகள் ='),
        choices: [L('Revenue', 'ආදායම', 'வருவாய்'), L('Equity / Capital', 'අයිතිය / ප්‍රාග්ධනය', 'முதல் / மூலதனம்'), L('Expense', 'වියදම', 'செலவு'), L('Dividend only', 'ලාභාංශ පමණි', 'ஈவுத்தொகை மட்டும்')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('If revenue is 100 and expenses are 40, profit is?', 'ආදායම 100 සහ වියදම් 40 නම් ලාභය?', 'வருவாய் 100, செலவு 40 என்றால் இலாபம்?'),
        correctNumber: 60,
      },
      {
        type: 'MCQ',
        text: L('GDP stands for:', 'GDP යනු:', 'GDP என்பது:'),
        choices: [
          L('Gross Domestic Product', 'දළ දේශීය නිෂ්පාදිතය', 'மொத்த உள்நாட்டு உற்பத்தி'),
          L('General Direct Pay', 'සාමාන්‍ය සෘජු ගෙවීම', 'பொது நேரடி ஊதியம்'),
          L('Government Debt Plan', 'රජයේ ණය සැලැස්ම', 'அரசு கடன் திட்டம்'),
          L('Global Data Point', 'ගෝලීය දත්ත ලක්ෂ්‍යය', 'உலகத் தரவுப் புள்ளி'),
        ],
        correct: 0,
      },
    ],
  },
  {
    courseIndex: 2,
    moduleIndex: 3,
    durationMinutes: 30,
    passingScorePercentage: 50,
    title: L(
      'A/L Arts — Civics & Society Intro',
      'A/L කලා — පුරවැසිභාවය සහ සමාජ හැඳින්වීම',
      'A/L கலை — குடியுரிமை & சமூக அறிமுகம்',
    ),
    description: L(
      'Arts stream warm-up: constitution basics and civic concepts.',
      'කලා ප්‍රවාහ ආරම්භක: ආණ්ඩුක්‍රම මූලික සහ පුරවැසි සංකල්ප.',
      'கலைப் பிரிவு அறிமுகம்: அரசியலமைப்பு அடிப்படை மற்றும் குடியுரிமைக் கருத்துகள்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('A democracy is a system where power is with the:', 'ප්‍රජාතන්ත්‍රවාදයේ බලය තිබෙන්නේ:', 'ஜனநாயகத்தில் அதிகாரம் உள்ளது:'),
        choices: [L('People', 'ජනතාව', 'மக்கள்'), L('Only army', 'හමුදාව පමණි', 'இராணுவம் மட்டும்'), L('Foreign kings', 'විදේශ රජුන්', 'வெளிநாட்டு அரசர்கள்'), L('Banks only', 'බැංකු පමණි', 'வங்கிகள் மட்டும்')],
        correct: 0,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: The supreme law of a country is often called the ____.', 'හිස්තැන: රටක උත්තරීතර නීතිය බොහෝ විට ____ ලෙස හඳුන්වයි.', 'நிரப்புக: ஒரு நாட்டின் உயர்ந்த சட்டம் பெரும்பாலும் ____ எனப்படும்.'),
        acceptedAnswers: ['constitution', 'Constitution', 'ආණ්ඩුක්‍රම ව්‍යවස්ථාව', 'அரசியலமைப்பு'],
      },
      {
        type: 'MCQ',
        text: L('Human rights protect:', 'මානව හිමිකම් ආරක්ෂා කරන්නේ:', 'மனித உரிமைகள் பாதுகாப்பது:'),
        choices: [L('Only companies', 'සමාගම් පමණි', 'நிறுவனங்கள் மட்டும்'), L('Basic freedoms of people', 'මිනිසුන්ගේ මූලික නිදහස', 'மக்களின் அடிப்படை சுதந்திரங்கள்'), L('Only sports', 'ක්‍රීඩා පමණි', 'விளையாட்டு மட்டும்'), L('Only taxes', 'බදු පමණි', 'வரிகள் மட்டும்')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('Universal Declaration of Human Rights year?', 'විශ්ව මානව හිමිකම් ප්‍රකාශනයේ වර්ෂය?', 'மனித உரிமைகள் அனைத்துலகப் பிரகடன ஆண்டு?'),
        correctNumber: 1948,
      },
      {
        type: 'MCQ',
        text: L('Local government in Sri Lanka includes:', 'ශ්‍රී ලංකාවේ ප්‍රාදේශීය පාලනයට ඇතුළත්:', 'இலங்கையில் உள்ளாட்சியில் அடங்குவது:'),
        choices: [
          L('Municipal / Urban / Pradeshiya Sabhas', 'නගර සභා / නගර සභා / ප්‍රාදේශීය සභා', 'நகராட்சி / நகரசபை / பிரதேச சபைகள்'),
          L('Only the UN', 'එක්සත් ජාතීන් පමණි', 'ஐ.நா மட்டும்'),
          L('Only private clubs', 'පුද්ගලික සමාජ පමණි', 'தனியார் கழகங்கள் மட்டும்'),
          L('Only schools', 'පාසල් පමණි', 'பள்ளிகள் மட்டும்'),
        ],
        correct: 0,
      },
    ],
  },
  {
    courseIndex: 2,
    moduleIndex: 4,
    durationMinutes: 35,
    passingScorePercentage: 45,
    title: L(
      'A/L Technology — ICT Fundamentals',
      'A/L තාක්ෂණය — ICT මූලික',
      'A/L தொழில்நுட்பம் — ICT அடிப்படை',
    ),
    description: L(
      'Technology stream: hardware, software, networks, and digital safety.',
      'තාක්ෂණ ප්‍රවාහය: දෘඪාංග, මෘදුකාංග, ජාල සහ ඩිජිටල් ආරක්ෂාව.',
      'தொழில்நுட்பப் பிரிவு: வன்பொருள், மென்பொருள், பிணையங்கள் மற்றும் டிஜிட்டல் பாதுகாப்பு.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('CPU stands for:', 'CPU යනු:', 'CPU என்பது:'),
        choices: [
          L('Central Processing Unit', 'මධ්‍යම සැකසුම් ඒකකය', 'மையச் செயலாக்க அலகு'),
          L('Computer Personal User', 'පරිගණක පුද්ගලික පරිශීලක', 'கணினி தனிப்பட்ட பயனர்'),
          L('Control Power Utility', 'පාලන බල උපයෝගිතාව', 'கட்டுப்பாட்டு ஆற்றல் பயன்பாடு'),
          L('Cache Print Unit', 'කෑෂ් මුද්‍රණ ඒකකය', 'கேச் அச்சு அலகு'),
        ],
        correct: 0,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: HTTP is used on the ____.', 'හිස්තැන: HTTP ____ මත භාවිතා වේ.', 'நிரப்புக: HTTP ____ இல் பயன்படுத்தப்படுகிறது.'),
        acceptedAnswers: ['internet', 'Internet', 'web', 'World Wide Web', 'www', 'අන්තර්ජාලය', 'இணையம்'],
      },
      {
        type: 'MCQ',
        text: L('Which is an input device?', 'ආදාන උපාංගයක් කුමක්ද?', 'உள்ளீட்டுச் சாதனம் எது?'),
        choices: [L('Monitor', 'මොනිටරය', 'மானிட்டர்'), L('Printer', 'මුද්‍රණ යන්ත්‍රය', 'பிரிண்டர்'), L('Keyboard', 'යතුරු පුවරුව', 'விசைப்பலகை'), L('Speaker', 'ස්පීකරය', 'ஸ்பீக்கர்')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('How many bits in one byte?', 'බයිට් එකක බිටු කීයක්ද?', 'ஒரு பைட்டில் எத்தனை பிட்டுகள்?'),
        correctNumber: 8,
      },
      {
        type: 'MCQ',
        text: L('A strong password should be:', 'ශක්තිමත් මුරපදයක් විය යුත්තේ:', 'வலுவான கடவுச்சொல் இருக்க வேண்டியது:'),
        choices: [
          L('Long and mixed characters', 'දිගු සහ මිශ්‍ර අක්ෂර', 'நீண்ட மற்றும் கலப்பு எழுத்துகள்'),
          L('Your name only', 'නම පමණි', 'பெயர் மட்டும்'),
          L('1234', '1234', '1234'),
          L('Shared with everyone', 'සැමට බෙදා ගන්නා', 'அனைவருக்கும் பகிரப்பட்ட'),
        ],
        correct: 0,
      },
    ],
  },

  // ─── International Cambridge/Edexcel (5) ───
  {
    courseIndex: 3,
    moduleIndex: 0,
    durationMinutes: 35,
    passingScorePercentage: 50,
    title: L(
      'IGCSE Mathematics — Core Practice',
      'IGCSE ගණිතය — මූලික පුහුණුව',
      'IGCSE கணிதம் — அடிப்படைப் பயிற்சி',
    ),
    description: L(
      'Cambridge / Edexcel O-Level style numeracy and algebra warm-up.',
      'කේම්බ්‍රිජ් / එඩෙක්සෙල් O-Level විලාසිතා සංඛ්‍යාතත්ත්වය සහ වීජ ගණිත ආරම්භක.',
      'கேம்பிரிட்ஜ் / எடெக்ஸெல் O-Level பாணி எண்ணறிவு மற்றும் இயற்கணித அறிமுகம்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('3² + 4² =', '3² + 4² =', '3² + 4² ='),
        choices: [L('7', '7', '7'), L('12', '12', '12'), L('25', '25', '25'), L('49', '49', '49')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('Convert 0.5 to a percentage.', '0.5 ප්‍රතිශතයට පරිවර්තනය කරන්න.', '0.5 ஐ சதவீதமாக மாற்றுங்கள்.'),
        correctNumber: 50,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: The gradient of y = 3x + 2 is ____.', 'හිස්තැන: y = 3x + 2 හි බෑවුම ____ වේ.', 'நிரப்புக: y = 3x + 2 இன் சாய்வு ____.'),
        acceptedAnswers: ['3'],
      },
      {
        type: 'MCQ',
        text: L('A fair coin P(heads) is:', 'සාධාරණ කාසියක P(හිස) =', 'நேர்மையான நாணயத்தில் P(தலை) ='),
        choices: [L('0', '0', '0'), L('1/4', '1/4', '1/4'), L('1/2', '1/2', '1/2'), L('1', '1', '1')],
        correct: 2,
      },
      {
        type: 'NUMERIC',
        text: L('Solve: 5x = 45. x = ?', 'විසඳන්න: 5x = 45. x = ?', 'தீர்க்க: 5x = 45. x = ?'),
        correctNumber: 9,
      },
    ],
  },
  {
    courseIndex: 3,
    moduleIndex: 0,
    durationMinutes: 30,
    passingScorePercentage: 50,
    title: L(
      'IGCSE Coordinated Science — Starter',
      'IGCSE සම්බන්ධිත විද්‍යාව — ආරම්භක',
      'IGCSE ஒருங்கிணைந்த அறிவியல் — தொடக்கம்',
    ),
    description: L(
      'International O-Level science: forces, atoms, and ecology basics.',
      'ජාත්‍යන්තර O-Level විද්‍යාව: බල, පරමාණු සහ පරිසර මූලික.',
      'சர்வதேச O-Level அறிவியல்: விசைகள், அணுக்கள் மற்றும் சூழலியல் அடிப்படை.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Unit of force is the:', 'බලයේ ඒකකය:', 'விசையின் அலகு:'),
        choices: [L('Joule', 'ජූල්', 'ஜூல்'), L('Newton', 'නිව්ටන්', 'நியூட்டன்'), L('Watt', 'වොට්', 'வாட்'), L('Pascal', 'පැස්කල්', 'பாஸ்கல்')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: H₂O is the formula for ____.', 'හිස්තැන: H₂O යනු ____ සඳහා සූත්‍රයයි.', 'நிரப்புக: H₂O என்பது ____ இன் வாய்பாடு.'),
        acceptedAnswers: ['water', 'Water', 'ජලය', 'நீர்'],
      },
      {
        type: 'MCQ',
        text: L('Producers in a food chain are usually:', 'ආහාර දාමයේ නිෂ්පාදකයන් සාමාන්‍යයෙන්:', 'உணவுச் சங்கிலியில் உற்பத்தியாளர்கள் பொதுவாக:'),
        choices: [L('Plants', 'ශාක', 'தாவரங்கள்'), L('Lions', 'සිංහයන්', 'சிங்கங்கள்'), L('Fungi only', 'දිලීර පමණි', 'பூஞ்சைகள் மட்டும்'), L('Humans only', 'මිනිසුන් පමණි', 'மனிதர்கள் மட்டும்')],
        correct: 0,
      },
      {
        type: 'NUMERIC',
        text: L('Atomic number of carbon?', 'කාබන්හි පරමාණුක අංකය?', 'கார்பனின் அணு எண்?'),
        correctNumber: 6,
      },
      {
        type: 'MCQ',
        text: L('Speed = distance / ____', 'වේගය = දුර / ____', 'வேகம் = தூரம் / ____'),
        choices: [L('mass', 'ස්කන්ධය', 'நிறை'), L('time', 'කාලය', 'நேரம்'), L('force', 'බලය', 'விசை'), L('energy', 'ශක්තිය', 'ஆற்றல்')],
        correct: 1,
      },
    ],
  },
  {
    courseIndex: 3,
    moduleIndex: 0,
    durationMinutes: 25,
    passingScorePercentage: 55,
    title: L(
      'IGCSE English Language — Skills',
      'IGCSE ඉංග්‍රීසි භාෂාව — කුසලතා',
      'IGCSE ஆங்கில மொழி — திறன்கள்',
    ),
    description: L(
      'Reading and writing warm-up for international English papers.',
      'ජාත්‍යන්තර ඉංග්‍රීසි ප්‍රශ්න පත්‍ර සඳහා කියවීම සහ ලිවීමේ ආරම්භක.',
      'சர்வதேச ஆங்கில வினாத்தாள்களுக்கான வாசிப்பு மற்றும் எழுத்து அறிமுகம்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Choose correct spelling:', 'නිවැරදි අක්ෂර වින්‍යාසය තෝරන්න:', 'சரியான எழுத்துப்பிழையைத் தேர்ந்தெடுக்க:'),
        choices: [L('recieve', 'recieve', 'recieve'), L('receive', 'receive', 'receive'), L('receeve', 'receeve', 'receeve'), L('receve', 'receve', 'receve')],
        correct: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: Their / There / They’re — ____ going to the library.', 'හිස්තැන: ____ going to the library.', 'நிரப்புக: ____ going to the library.'),
        acceptedAnswers: ["They're", "they're", 'They are'],
      },
      {
        type: 'MCQ',
        text: L('A metaphor is:', 'රූපකයක් යනු:', 'உருவகம் என்பது:'),
        choices: [
          L('A direct comparison without like/as', 'like/as නැතිව සෘජු සංසන්දනය', 'like/as இல்லாமல் நேரடி ஒப்பீடு'),
          L('Only a number', 'සංඛ්‍යාවක් පමණි', 'எண் மட்டும்'),
          L('A type of printer', 'මුද්‍රණ යන්ත්‍ර වර්ගයකි', 'ஒரு அச்சுப்பொறி வகை'),
          L('A sports rule', 'ක්‍රීඩා නීතියකි', 'விளையாட்டு விதி'),
        ],
        correct: 0,
      },
      {
        type: 'MCQ',
        text: L('Antonym of “ancient”:', '“ancient” යන වචනයේ විරුද්ධාර්ථය:', '“ancient” என்பதன் எதிர்ச்சொல்:'),
        choices: [L('modern', 'නවීන', 'நவீன'), L('old', 'පැරණි', 'பழைய'), L('historic', 'ඓතිහාසික', 'வரலாற்று'), L('aged', 'වයස්ගත', 'வயதான')],
        correct: 0,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Write a synonym of “big”.', '“big” යන වචනයේ සමානාර්ථ පදයක් ලියන්න.', '“big” என்பதன் ஒத்தசொல்லை எழுதுங்கள்.'),
        acceptedAnswers: ['large', 'Large', 'huge', 'Huge', 'enormous', 'great', 'big'],
      },
    ],
  },
  {
    courseIndex: 3,
    moduleIndex: 1,
    durationMinutes: 40,
    passingScorePercentage: 45,
    title: L(
      'International A-Level Mathematics — Starter',
      'ජාත්‍යන්තර A-Level ගණිතය — ආරම්භක',
      'சர்வதேச A-Level கணிதம் — தொடக்கம்',
    ),
    description: L(
      'Cambridge / Edexcel A-Level warm-up: calculus and algebra essentials.',
      'කේම්බ්‍රිජ් / එඩෙක්සෙල් A-Level ආරම්භක: කලනය සහ වීජ ගණිත අත්‍යවශ්‍ය.',
      'கேம்பிரிட்ஜ் / எடெக்ஸெல் A-Level அறிமுகம்: நுண்கணிதம் மற்றும் இயற்கணித அத்தியாவசியங்கள்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('∫ 2x dx =', '∫ 2x dx =', '∫ 2x dx ='),
        choices: [L('x² + C', 'x² + C', 'x² + C'), L('2x² + C', '2x² + C', '2x² + C'), L('2 + C', '2 + C', '2 + C'), L('x + C', 'x + C', 'x + C')],
        correct: 0,
      },
      {
        type: 'NUMERIC',
        text: L('lim x→0 of (sin x)/x approaches?', 'x→0 දී (sin x)/x සීමාව?', 'x→0 இல் (sin x)/x எல்லை?'),
        correctNumber: 1,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: The derivative of a constant is ____.', 'හිස්තැන: නියතයක අවකලනය ____ වේ.', 'நிரப்புக: மாறிலியின் வகைக்கெழு ____.'),
        acceptedAnswers: ['0', 'zero', 'Zero'],
      },
      {
        type: 'MCQ',
        text: L('Matrix [[1,0],[0,1]] is the:', 'අනුකෘතිය [[1,0],[0,1]] යනු:', 'அணி [[1,0],[0,1]] என்பது:'),
        choices: [L('Zero matrix', 'ශුන්‍ය අනුකෘතිය', 'சுழிய அணி'), L('Identity matrix', 'අනන්‍යතා අනුකෘතිය', 'அடையாள அணி'), L('Singular only', 'එකම අනන්‍ය', 'ஒற்றை மட்டும்'), L('Row vector', 'පේළි දෛශිකය', 'வரிசை வெக்டர்')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('If dy/dx = 4 and y(0)=1 for y=4x+c, then c=?', 'y=4x+c සහ y(0)=1 නම් c=?', 'y=4x+c மற்றும் y(0)=1 என்றால் c=?'),
        correctNumber: 1,
      },
    ],
  },
  {
    courseIndex: 3,
    moduleIndex: 1,
    durationMinutes: 35,
    passingScorePercentage: 45,
    requiresUnlock: true,
    priceLkr: null,
    title: L(
      'International A-Level Physics — Mechanics',
      'ජාත්‍යන්තර A-Level භෞතික විද්‍යාව — යාන්ත්‍ර විද්‍යාව',
      'சர்வதேச A-Level இயற்பியல் — இயக்கவியல்',
    ),
    description: L(
      'Monthly-locked A-Level mechanics: motion, energy, and Newton laws.',
      'මාසිකව අගුළු ලූ A-Level යාන්ත්‍ර විද්‍යාව: චලිතය, ශක්තිය සහ නිව්ටන් නියම.',
      'மாதப் பூட்டிய A-Level இயக்கவியல்: இயக்கம், ஆற்றல் மற்றும் நியூட்டன் விதிகள்.',
    ),
    questions: [
      {
        type: 'MCQ',
        text: L('Newton’s second law is often written as:', 'නිව්ටන්ගේ දෙවන නියමය බොහෝ විට:', 'நியூட்டனின் இரண்டாம் விதி பெரும்பாலும்:'),
        choices: [L('F = ma', 'F = ma', 'F = ma'), L('E = mc² only', 'E = mc² පමණි', 'E = mc² மட்டும்'), L('V = IR', 'V = IR', 'V = IR'), L('PV = nRT', 'PV = nRT', 'PV = nRT')],
        correct: 0,
      },
      {
        type: 'NUMERIC',
        text: L('A car travels 100 m in 5 s at constant speed. Speed (m/s)?', 'මෝටර් රථයක් තත් 5කින් මීටර් 100ක් යයි. වේගය (m/s)?', 'கார் 5 வினாடியில் 100 மீ செல்கிறது. வேகம் (m/s)?'),
        correctNumber: 20,
      },
      {
        type: 'SHORT_TEXT',
        text: L('Fill in: KE = ½ m ____²', 'හිස්තැන: KE = ½ m ____²', 'நிரப்புக: KE = ½ m ____²'),
        acceptedAnswers: ['v', 'V', 'velocity', 'speed'],
      },
      {
        type: 'MCQ',
        text: L('Unit of energy is the:', 'ශක්තියේ ඒකකය:', 'ஆற்றலின் அலகு:'),
        choices: [L('Newton', 'නිව්ටන්', 'நியூட்டன்'), L('Joule', 'ජූල්', 'ஜூல்'), L('Ampere', 'ඇම්පියර්', 'ஆம்பியர்'), L('Candela', 'කැන්ඩෙලා', 'கேண்டெலா')],
        correct: 1,
      },
      {
        type: 'NUMERIC',
        text: L('g near Earth is about ____ m/s² (use 10).', 'පෘථිවිය අසල g ආසන්න වශයෙන් ____ m/s² (10 භාවිතා කරන්න).', 'பூமிக்கு அருகில் g சுமார் ____ m/s² (10 பயன்படுத்துக).'),
        correctNumber: 10,
        tolerance: 0.5,
      },
    ],
  },
];

export { QuestionType };
