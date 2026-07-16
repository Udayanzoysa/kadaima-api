import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QuizStatus,
  TeacherInquiryStatus,
  TeacherQuizVisibility,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuizService } from '../quiz/quiz.service';
import {
  CreateTeacherInquiryDto,
  UpdateTeacherInquiryDto,
} from './dto/teacher-inquiry.dto';
import {
  TEACHER_PAGE_SECTION_IDS,
  TeacherPageLayoutDto,
  UpdateTeacherProfileDto,
  UpsertTeacherBannerDto,
  UpsertTeacherClassDto,
  UpsertTeacherPosterDto,
} from './dto/teacher-profile.dto';
import { assertValidSlug, slugFromName } from './slug.util';

const DEFAULT_PAGE_LAYOUT: TeacherPageLayoutDto = {
  sections: TEACHER_PAGE_SECTION_IDS.map((id) => ({ id, visible: true })),
};

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quizService: QuizService,
  ) {}

  async ensureProfileForUser(userId: string) {
    const existing = await this.prisma.teacherProfile.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const displayName =
      user.name?.trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email.split('@')[0];

    let slug = slugFromName(displayName, user.email);
    slug = await this.uniqueSlug(slug);

    return this.prisma.teacherProfile.create({
      data: {
        userId,
        slug,
        displayName,
        title: `${displayName}'s classes`,
        description: 'Welcome to my learning page. Explore my quizzes below.',
        isPublic: false,
        quizVisibility: TeacherQuizVisibility.ALL,
      },
    });
  }

  async getMyProfile(userId: string) {
    await this.ensureProfileForUser(userId);
    const profile = await this.prisma.teacherProfile.findUniqueOrThrow({
      where: { userId },
      include: {
        banners: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        classes: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        posters: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        selectedQuizzes: { select: { quizId: true } },
      },
    });

    const myQuizzes = await this.prisma.quiz.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        coverImageUrl: true,
      },
    });

    return {
      ...profile,
      selectedQuizIds: profile.selectedQuizzes.map((r) => r.quizId),
      myQuizzes,
    };
  }

  async updateMyProfile(userId: string, dto: UpdateTeacherProfileDto) {
    const profile = await this.ensureProfileForUser(userId);

    let slug = profile.slug;
    if (dto.slug !== undefined) {
      try {
        slug = assertValidSlug(dto.slug);
      } catch (e) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Invalid slug');
      }
      if (slug !== profile.slug) {
        const taken = await this.prisma.teacherProfile.findUnique({ where: { slug } });
        if (taken) throw new ConflictException('This slug is already taken.');
      }
    }

    const quizVisibility =
      dto.quizVisibility !== undefined ? dto.quizVisibility : profile.quizVisibility;

    if (dto.selectedQuizIds !== undefined) {
      const uniqueIds = [...new Set(dto.selectedQuizIds)];
      if (uniqueIds.length) {
        const owned = await this.prisma.quiz.findMany({
          where: { id: { in: uniqueIds }, createdById: userId },
          select: { id: true },
        });
        if (owned.length !== uniqueIds.length) {
          throw new BadRequestException(
            'You can only feature quizzes that you created.',
          );
        }
      }

      await this.prisma.$transaction([
        this.prisma.teacherProfileQuiz.deleteMany({ where: { profileId: profile.id } }),
        ...(uniqueIds.length
          ? [
              this.prisma.teacherProfileQuiz.createMany({
                data: uniqueIds.map((quizId) => ({
                  profileId: profile.id,
                  quizId,
                })),
              }),
            ]
          : []),
      ]);
    }

    if (
      quizVisibility === TeacherQuizVisibility.SELECTED &&
      dto.selectedQuizIds !== undefined &&
      dto.selectedQuizIds.length === 0
    ) {
      // Allowed: SELECTED with empty list shows no quizzes until they pick some.
    }

    let pageLayoutValue: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined =
      undefined;
    if (dto.pageLayout !== undefined) {
      pageLayoutValue =
        dto.pageLayout === null
          ? Prisma.DbNull
          : (this.normalizePageLayout(dto.pageLayout) as unknown as Prisma.InputJsonValue);
    }

    await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        slug,
        displayName: dto.displayName?.trim() || profile.displayName,
        title: dto.title !== undefined ? dto.title?.trim() || null : undefined,
        description:
          dto.description !== undefined ? dto.description?.trim() || null : undefined,
        aboutText:
          dto.aboutText !== undefined ? dto.aboutText?.trim() || null : undefined,
        contactText:
          dto.contactText !== undefined ? dto.contactText?.trim() || null : undefined,
        contactPhone:
          dto.contactPhone !== undefined ? dto.contactPhone?.trim() || null : undefined,
        contactWhatsappUrl:
          dto.contactWhatsappUrl !== undefined
            ? dto.contactWhatsappUrl?.trim() || null
            : undefined,
        contactAddress:
          dto.contactAddress !== undefined
            ? dto.contactAddress?.trim() || null
            : undefined,
        sideBannerUrl:
          dto.sideBannerUrl !== undefined ? dto.sideBannerUrl || null : undefined,
        isPublic: dto.isPublic !== undefined ? dto.isPublic : undefined,
        quizVisibility,
        ...(pageLayoutValue !== undefined ? { pageLayout: pageLayoutValue } : {}),
      },
    });

    return this.getMyProfile(userId);
  }

  async getPublicBySlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    const profile = await this.prisma.teacherProfile.findFirst({
      where: { slug: normalized, isPublic: true },
      include: {
        banners: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        classes: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        posters: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        user: {
          select: { id: true, name: true, firstName: true, lastName: true },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Teacher page not found or not published.');
    }

    const { user, ...rest } = profile;
    return {
      ...rest,
      publicUrlPath: `/t/${profile.slug}`,
      teacherUserId: user.id,
    };
  }

  async listPublicQuizzes(
    slug: string,
    guestSessionId?: string,
    userId?: string,
  ) {
    await this.getPublicBySlug(slug);
    return this.quizService.listPublishedQuizzes(guestSessionId, userId, slug);
  }

  async addBanner(userId: string, dto: UpsertTeacherBannerDto) {
    const profile = await this.ensureProfileForUser(userId);
    return this.prisma.teacherBanner.create({
      data: {
        profileId: profile.id,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl ?? null,
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        ctaLabel: dto.ctaLabel ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateBanner(userId: string, bannerId: string, dto: UpsertTeacherBannerDto) {
    const banner = await this.requireOwnedBanner(userId, bannerId);
    return this.prisma.teacherBanner.update({
      where: { id: banner.id },
      data: {
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl ?? null,
        title: dto.title ?? null,
        subtitle: dto.subtitle ?? null,
        ctaLabel: dto.ctaLabel ?? null,
        sortOrder: dto.sortOrder ?? banner.sortOrder,
        isActive: dto.isActive ?? banner.isActive,
      },
    });
  }

  async deleteBanner(userId: string, bannerId: string) {
    await this.requireOwnedBanner(userId, bannerId);
    await this.prisma.teacherBanner.delete({ where: { id: bannerId } });
    return { deleted: true };
  }

  async reorderBanners(userId: string, ids: string[]) {
    const profile = await this.ensureProfileForUser(userId);
    const uniqueIds = [...new Set(ids)];
    const owned = await this.prisma.teacherBanner.findMany({
      where: { profileId: profile.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((b) => b.id));
    if (
      uniqueIds.length !== owned.length ||
      uniqueIds.some((id) => !ownedIds.has(id))
    ) {
      throw new BadRequestException(
        'Reorder list must include every banner for this page exactly once.',
      );
    }
    await this.prisma.$transaction(
      uniqueIds.map((id, index) =>
        this.prisma.teacherBanner.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getMyProfile(userId);
  }

  async addClass(userId: string, dto: UpsertTeacherClassDto) {
    const profile = await this.ensureProfileForUser(userId);
    return this.prisma.teacherClass.create({
      data: {
        profileId: profile.id,
        title: dto.title.trim(),
        description: dto.description ?? null,
        scheduleTime: dto.scheduleTime?.trim() || null,
        location: dto.location?.trim() || null,
        classDate: dto.classDate?.trim() || null,
        feeLabel: dto.feeLabel?.trim() || null,
        whatsappGroupUrl: dto.whatsappGroupUrl?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateClass(userId: string, classId: string, dto: UpsertTeacherClassDto) {
    const row = await this.requireOwnedClass(userId, classId);
    return this.prisma.teacherClass.update({
      where: { id: row.id },
      data: {
        title: dto.title.trim(),
        description: dto.description ?? null,
        scheduleTime: dto.scheduleTime?.trim() || null,
        location: dto.location?.trim() || null,
        classDate: dto.classDate?.trim() || null,
        feeLabel: dto.feeLabel?.trim() || null,
        whatsappGroupUrl:
          dto.whatsappGroupUrl !== undefined
            ? dto.whatsappGroupUrl?.trim() || null
            : row.whatsappGroupUrl,
        sortOrder: dto.sortOrder ?? row.sortOrder,
        isActive: dto.isActive ?? row.isActive,
      },
    });
  }

  async deleteClass(userId: string, classId: string) {
    await this.requireOwnedClass(userId, classId);
    await this.prisma.teacherClass.delete({ where: { id: classId } });
    return { deleted: true };
  }

  async addPoster(userId: string, dto: UpsertTeacherPosterDto) {
    const profile = await this.ensureProfileForUser(userId);
    const count = await this.prisma.teacherPoster.count({
      where: { profileId: profile.id },
    });
    return this.prisma.teacherPoster.create({
      data: {
        profileId: profile.id,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl ?? null,
        title: dto.title?.trim() || null,
        placement: dto.placement,
        sortOrder: dto.sortOrder ?? count,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePoster(userId: string, posterId: string, dto: UpsertTeacherPosterDto) {
    const poster = await this.requireOwnedPoster(userId, posterId);
    return this.prisma.teacherPoster.update({
      where: { id: poster.id },
      data: {
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl ?? null,
        title: dto.title?.trim() || null,
        placement: dto.placement,
        sortOrder: dto.sortOrder ?? poster.sortOrder,
        isActive: dto.isActive ?? poster.isActive,
      },
    });
  }

  async deletePoster(userId: string, posterId: string) {
    await this.requireOwnedPoster(userId, posterId);
    await this.prisma.teacherPoster.delete({ where: { id: posterId } });
    return { deleted: true };
  }

  async reorderPosters(userId: string, ids: string[]) {
    const profile = await this.ensureProfileForUser(userId);
    const uniqueIds = [...new Set(ids)];
    const owned = await this.prisma.teacherPoster.findMany({
      where: { profileId: profile.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((p) => p.id));
    if (
      uniqueIds.length !== owned.length ||
      uniqueIds.some((id) => !ownedIds.has(id))
    ) {
      throw new BadRequestException(
        'Reorder list must include every poster for this page exactly once.',
      );
    }
    await this.prisma.$transaction(
      uniqueIds.map((id, index) =>
        this.prisma.teacherPoster.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getMyProfile(userId);
  }

  async reorderClasses(userId: string, ids: string[]) {
    const profile = await this.ensureProfileForUser(userId);
    const uniqueIds = [...new Set(ids)];
    const owned = await this.prisma.teacherClass.findMany({
      where: { profileId: profile.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((c) => c.id));
    if (
      uniqueIds.length !== owned.length ||
      uniqueIds.some((id) => !ownedIds.has(id))
    ) {
      throw new BadRequestException(
        'Reorder list must include every class for this page exactly once.',
      );
    }
    await this.prisma.$transaction(
      uniqueIds.map((id, index) =>
        this.prisma.teacherClass.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getMyProfile(userId);
  }

  private normalizePageLayout(layout: TeacherPageLayoutDto): TeacherPageLayoutDto {
    if (!layout?.sections?.length) {
      throw new BadRequestException('pageLayout.sections is required');
    }

    const seen = new Set<string>();
    const sections = layout.sections.map((s) => {
      if (!TEACHER_PAGE_SECTION_IDS.includes(s.id as (typeof TEACHER_PAGE_SECTION_IDS)[number])) {
        throw new BadRequestException(`Invalid section id: ${s.id}`);
      }
      if (seen.has(s.id)) {
        throw new BadRequestException(`Duplicate section id: ${s.id}`);
      }
      seen.add(s.id);
      return { id: s.id, visible: Boolean(s.visible) };
    });

    for (const id of TEACHER_PAGE_SECTION_IDS) {
      if (!seen.has(id)) {
        sections.push({ id, visible: true });
      }
    }

    return { sections };
  }

  /** Expose default layout for clients that want an empty starting state. */
  getDefaultPageLayout() {
    return DEFAULT_PAGE_LAYOUT;
  }

  private async requireOwnedBanner(userId: string, bannerId: string) {
    const profile = await this.ensureProfileForUser(userId);
    const banner = await this.prisma.teacherBanner.findFirst({
      where: { id: bannerId, profileId: profile.id },
    });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  private async requireOwnedClass(userId: string, classId: string) {
    const profile = await this.ensureProfileForUser(userId);
    const row = await this.prisma.teacherClass.findFirst({
      where: { id: classId, profileId: profile.id },
    });
    if (!row) throw new NotFoundException('Class not found');
    return row;
  }

  private async requireOwnedPoster(userId: string, posterId: string) {
    const profile = await this.ensureProfileForUser(userId);
    const row = await this.prisma.teacherPoster.findFirst({
      where: { id: posterId, profileId: profile.id },
    });
    if (!row) throw new NotFoundException('Poster not found');
    return row;
  }

  async createPublicInquiry(slug: string, dto: CreateTeacherInquiryDto) {
    const normalized = slug.trim().toLowerCase();
    const profile = await this.prisma.teacherProfile.findFirst({
      where: { slug: normalized, isPublic: true },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Teacher page not found');

    const recent = await this.prisma.teacherContactInquiry.findFirst({
      where: {
        profileId: profile.id,
        mobileNumber: dto.mobileNumber.trim(),
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      throw new BadRequestException(
        'Please wait a moment before sending another inquiry.',
      );
    }

    const inquiry = await this.prisma.teacherContactInquiry.create({
      data: {
        profileId: profile.id,
        studentName: dto.studentName.trim(),
        mobileNumber: dto.mobileNumber.trim(),
        email: dto.email?.trim() || null,
        message: dto.message.trim(),
        guestSessionId: dto.guestSessionId?.trim() || null,
        userId: dto.userId?.trim() || null,
        status: TeacherInquiryStatus.NEW,
      },
    });

    return {
      id: inquiry.id,
      message: 'Inquiry sent. The teacher will get back to you soon.',
    };
  }

  async listMyInquiries(userId: string) {
    const profile = await this.ensureProfileForUser(userId);
    return this.prisma.teacherContactInquiry.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateMyInquiry(
    userId: string,
    inquiryId: string,
    dto: UpdateTeacherInquiryDto,
  ) {
    const profile = await this.ensureProfileForUser(userId);
    const existing = await this.prisma.teacherContactInquiry.findFirst({
      where: { id: inquiryId, profileId: profile.id },
    });
    if (!existing) throw new NotFoundException('Inquiry not found');

    return this.prisma.teacherContactInquiry.update({
      where: { id: inquiryId },
      data: {
        status: dto.status !== undefined ? dto.status : undefined,
      },
    });
  }

  private async uniqueSlug(base: string) {
    let candidate = base;
    let i = 0;
    while (true) {
      try {
        candidate = assertValidSlug(candidate);
      } catch {
        candidate = `teacher-${Date.now().toString(36)}`;
      }
      const exists = await this.prisma.teacherProfile.findUnique({
        where: { slug: candidate },
      });
      if (!exists) return candidate;
      i += 1;
      candidate = `${base}-${i}`;
    }
  }
}
