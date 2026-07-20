/**
 * Wipe Courses / Modules / Quizzes / Questions (and related attempt/payment links)
 * WITHOUT deleting users, roles, or workspace settings.
 *
 * Usage (on the server, with the correct DATABASE_URL in .env):
 *   npm run db:clean-content
 *
 * Optional full reset (users + content) then re-seed:
 *   npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning content: quizzes, questions, modules, courses…');
  console.log(`DATABASE_URL host hint: ${maskDbUrl(process.env.DATABASE_URL)}`);

  // Child → parent order (respect FKs)
  const responses = await prisma.studentResponse.deleteMany({});
  const attempts = await prisma.quizAttempt.deleteMany({});
  const guestLeads = await prisma.guestLead.deleteMany({});
  const quizQuestions = await prisma.quizQuestion.deleteMany({});
  const quizSections = await prisma.quizSection.deleteMany({});
  const choices = await prisma.answerChoice.deleteMany({});
  const questions = await prisma.question.deleteMany({});
  const teacherQuizLinks = await prisma.teacherProfileQuiz.deleteMany({});
  const slips = await prisma.paymentSlipSubmission.deleteMany({});
  const unlocks = await prisma.quizUnlock.deleteMany({});
  const vouchers = await prisma.unlockVoucher.deleteMany({});
  const subs = await prisma.studentSubscription.deleteMany({});
  const orders = await prisma.paymentOrder.deleteMany({});
  const quizzes = await prisma.quiz.deleteMany({});
  const modules = await prisma.module.deleteMany({});
  const courses = await prisma.course.deleteMany({});

  console.log('Deleted counts:');
  console.table({
    studentResponses: responses.count,
    quizAttempts: attempts.count,
    guestLeads: guestLeads.count,
    quizQuestions: quizQuestions.count,
    quizSections: quizSections.count,
    answerChoices: choices.count,
    questions: questions.count,
    teacherProfileQuizzes: teacherQuizLinks.count,
    paymentSlipSubmissions: slips.count,
    quizUnlocks: unlocks.count,
    unlockVouchers: vouchers.count,
    studentSubscriptions: subs.count,
    paymentOrders: orders.count,
    quizzes: quizzes.count,
    modules: modules.count,
    courses: courses.count,
  });

  console.log('Content cleaned. Users / roles / workspace kept.');
  console.log('Next: create courses/modules/quizzes in admin, or run: npx prisma db seed');
}

function maskDbUrl(url: string | undefined): string {
  if (!url) return '(DATABASE_URL not set)';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(invalid DATABASE_URL)';
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
