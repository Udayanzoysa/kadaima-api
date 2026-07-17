import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCourseDto,
  CreateModuleDto,
  UpdateCourseDto,
  UpdateModuleDto,
} from './dto/course.dto';

function toJson(value: { en: string; si: string; ta: string }): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class CourseService {
  constructor(private prisma: PrismaService) {}

  async listCourses(status?: CourseStatus) {
    return this.prisma.course.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { quizzes: true, modules: true } },
      },
    });
  }

  async listCoursesPaginated(opts: {
    status?: CourseStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10));
    const where = opts.status ? { status: opts.status } : undefined;

    const [total, items] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { quizzes: true, modules: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async bulkUpdateCourseStatus(ids: string[], status: CourseStatus) {
    if (!ids.length) throw new BadRequestException('No course IDs provided');
    const result = await this.prisma.course.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return { updated: result.count, status };
  }

  async bulkDeleteCourses(ids: string[]) {
    if (!ids.length) throw new BadRequestException('No course IDs provided');

    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids } },
      include: { _count: { select: { quizzes: true } } },
    });

    let deleted = 0;
    let archived = 0;

    for (const course of courses) {
      if (course._count.quizzes > 0) {
        await this.prisma.course.update({
          where: { id: course.id },
          data: { status: CourseStatus.Archived },
        });
        archived += 1;
      } else {
        await this.prisma.course.delete({ where: { id: course.id } });
        deleted += 1;
      }
    }

    return { deleted, archived, total: courses.length };
  }

  async getCourse(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        modules: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { quizzes: true, modules: true } },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async createCourse(dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        title: toJson(dto.title),
        description: dto.description ? toJson(dto.description) : undefined,
        status: dto.status ?? CourseStatus.Draft,
      },
      include: {
        _count: { select: { quizzes: true, modules: true } },
      },
    });
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    await this.ensureCourse(id);
    return this.prisma.course.update({
      where: { id },
      data: {
        ...(dto.title ? { title: toJson(dto.title) } : {}),
        ...(dto.description !== undefined
          ? {
              description: dto.description
                ? toJson(dto.description)
                : Prisma.DbNull,
            }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: {
        _count: { select: { quizzes: true, modules: true } },
      },
    });
  }

  async updateCourseStatus(id: string, status: CourseStatus) {
    await this.ensureCourse(id);
    return this.prisma.course.update({
      where: { id },
      data: { status },
      include: {
        _count: { select: { quizzes: true, modules: true } },
      },
    });
  }

  async deleteCourse(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: { _count: { select: { quizzes: true } } },
    });
    if (!course) throw new NotFoundException('Course not found');

    if (course._count.quizzes > 0) {
      return this.prisma.course.update({
        where: { id },
        data: { status: CourseStatus.Archived },
      });
    }

    await this.prisma.course.delete({ where: { id } });
    return { deleted: true };
  }

  async listModules(courseId: string, status?: CourseStatus) {
    await this.ensureCourse(courseId);
    return this.prisma.module.findMany({
      where: {
        courseId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listModulesPaginated(
    courseId: string,
    opts: { status?: CourseStatus; page?: number; pageSize?: number },
  ) {
    await this.ensureCourse(courseId);
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 10));
    const where = {
      courseId,
      ...(opts.status ? { status: opts.status } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.module.count({ where }),
      this.prisma.module.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async bulkUpdateModuleStatus(
    courseId: string,
    ids: string[],
    status: CourseStatus,
  ) {
    if (!ids.length) throw new BadRequestException('No module IDs provided');
    await this.ensureCourse(courseId);
    const result = await this.prisma.module.updateMany({
      where: { id: { in: ids }, courseId },
      data: { status },
    });
    return { updated: result.count, status };
  }

  async bulkDeleteModules(courseId: string, ids: string[]) {
    if (!ids.length) throw new BadRequestException('No module IDs provided');
    await this.ensureCourse(courseId);
    const result = await this.prisma.module.deleteMany({
      where: { id: { in: ids }, courseId },
    });
    return { deleted: result.count, archived: 0, total: result.count };
  }

  async getModule(courseId: string, id: string) {
    const mod = await this.prisma.module.findFirst({
      where: { id, courseId },
    });
    if (!mod) throw new NotFoundException('Module not found');
    return mod;
  }

  async createModule(courseId: string, dto: CreateModuleDto) {
    await this.ensureCourse(courseId);
    return this.prisma.module.create({
      data: {
        courseId,
        title: toJson(dto.title),
        description: dto.description ? toJson(dto.description) : undefined,
        status: dto.status ?? CourseStatus.Draft,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateModule(courseId: string, id: string, dto: UpdateModuleDto) {
    await this.getModule(courseId, id);
    return this.prisma.module.update({
      where: { id },
      data: {
        ...(dto.title ? { title: toJson(dto.title) } : {}),
        ...(dto.description !== undefined
          ? {
              description: dto.description
                ? toJson(dto.description)
                : Prisma.DbNull,
            }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async updateModuleStatus(courseId: string, id: string, status: CourseStatus) {
    await this.getModule(courseId, id);
    return this.prisma.module.update({
      where: { id },
      data: { status },
    });
  }

  async deleteModule(courseId: string, id: string) {
    await this.getModule(courseId, id);
    await this.prisma.module.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureCourse(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }
}
