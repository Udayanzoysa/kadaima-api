import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CourseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCourseDto,
  CreateModuleDto,
  UpdateCourseDto,
  UpdateModuleDto,
} from './dto/course.dto';
import {
  asLocalized,
  jsonDownload,
  parseJsonBuffer,
  readWorkbook,
  sheetToRows,
  xlsxDownload,
  type Localized,
} from '../common/backup/backup.util';

type ExportModule = {
  title: Localized;
  description?: Localized | null;
  status: CourseStatus;
  sortOrder: number;
};

type ExportCourse = {
  title: Localized;
  description?: Localized | null;
  status: CourseStatus;
  modules: ExportModule[];
};

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

  async exportBackup(format: 'json' | 'xlsx' = 'json') {
    const courses = await this.prisma.course.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        modules: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    const payload: ExportCourse[] = courses.map((course) => ({
      title: asLocalized(course.title),
      description: course.description
        ? asLocalized(course.description)
        : null,
      status: course.status,
      modules: course.modules.map((mod) => ({
        title: asLocalized(mod.title),
        description: mod.description ? asLocalized(mod.description) : null,
        status: mod.status,
        sortOrder: mod.sortOrder,
      })),
    }));

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const courseRows = payload.map((c, index) => ({
        course_index: index + 1,
        title_en: c.title.en,
        title_si: c.title.si,
        title_ta: c.title.ta,
        description_en: c.description?.en ?? '',
        description_si: c.description?.si ?? '',
        description_ta: c.description?.ta ?? '',
        status: c.status,
      }));
      const moduleRows = payload.flatMap((c, index) =>
        c.modules.map((m) => ({
          course_index: index + 1,
          title_en: m.title.en,
          title_si: m.title.si,
          title_ta: m.title.ta,
          description_en: m.description?.en ?? '',
          description_si: m.description?.si ?? '',
          description_ta: m.description?.ta ?? '',
          status: m.status,
          sort_order: m.sortOrder,
        })),
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(courseRows),
        'Courses',
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(moduleRows),
        'Modules',
      );
      return xlsxDownload(workbook, `courses-backup-${stamp}.xlsx`);
    }

    return jsonDownload(
      {
        version: 1,
        type: 'courses',
        exportedAt: new Date().toISOString(),
        count: payload.length,
        courses: payload,
      },
      `courses-backup-${stamp}.json`,
    );
  }

  private parseImportCourses(raw: unknown): ExportCourse[] {
    if (Array.isArray(raw)) return raw as ExportCourse[];
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.courses)) return obj.courses as ExportCourse[];
    }
    throw new BadRequestException(
      'Invalid backup file. Expected { type: "courses", courses: [...] } or an array.',
    );
  }

  private parseCoursesFromExcel(buffer: Buffer): ExportCourse[] {
    const workbook = readWorkbook(buffer);
    const courseSheet =
      workbook.Sheets.Courses || workbook.Sheets[workbook.SheetNames[0]];
    if (!courseSheet) throw new BadRequestException('Excel file has no Courses sheet');

    const courseRows = sheetToRows(courseSheet);
    const moduleSheet = workbook.Sheets.Modules;
    const moduleRows = moduleSheet ? sheetToRows(moduleSheet) : [];

    return courseRows.map((row, i) => {
      const courseIndex = Number(row.course_index) || i + 1;
      const title = asLocalized({
        en: row.title_en || row.title || '',
        si: row.title_si || '',
        ta: row.title_ta || '',
      });
      if (!title.en.trim()) {
        throw new BadRequestException(`Course row ${i + 2}: title_en is required`);
      }
      const statusRaw = row.status || CourseStatus.Draft;
      if (!Object.values(CourseStatus).includes(statusRaw as CourseStatus)) {
        throw new BadRequestException(`Course row ${i + 2}: invalid status`);
      }

      const modules = moduleRows
        .filter((m) => Number(m.course_index) === courseIndex)
        .map((m, mi) => {
          const modTitle = asLocalized({
            en: m.title_en || m.title || '',
            si: m.title_si || '',
            ta: m.title_ta || '',
          });
          if (!modTitle.en.trim()) {
            throw new BadRequestException(
              `Module for course ${courseIndex} row ${mi + 2}: title_en is required`,
            );
          }
          const modStatus = m.status || CourseStatus.Draft;
          if (!Object.values(CourseStatus).includes(modStatus as CourseStatus)) {
            throw new BadRequestException(
              `Module for course ${courseIndex}: invalid status`,
            );
          }
          return {
            title: modTitle,
            description: asLocalized({
              en: m.description_en || '',
              si: m.description_si || '',
              ta: m.description_ta || '',
            }),
            status: modStatus as CourseStatus,
            sortOrder: Number(m.sort_order) || mi,
          };
        });

      return {
        title,
        description: asLocalized({
          en: row.description_en || '',
          si: row.description_si || '',
          ta: row.description_ta || '',
        }),
        status: statusRaw as CourseStatus,
        modules,
      };
    });
  }

  async importBackup(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Backup file is required');
    }

    const name = (file.originalname || '').toLowerCase();
    let items: ExportCourse[] = [];

    if (name.endsWith('.json') || file.mimetype === 'application/json') {
      items = this.parseImportCourses(parseJsonBuffer(file.buffer));
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      items = this.parseCoursesFromExcel(file.buffer);
    } else {
      throw new BadRequestException('Supported formats: .json, .xlsx');
    }

    if (!items.length) {
      throw new BadRequestException('No courses found in backup file');
    }

    let created = 0;
    let modulesCreated = 0;
    const failures: string[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        const courseDto: CreateCourseDto = {
          title: asLocalized(item.title),
          description: item.description
            ? asLocalized(item.description)
            : undefined,
          status: item.status ?? CourseStatus.Draft,
        };
        const course = await this.createCourse(courseDto);
        created += 1;

        const modules = item.modules ?? [];
        for (let mi = 0; mi < modules.length; mi += 1) {
          const mod = modules[mi];
          const moduleDto: CreateModuleDto = {
            title: asLocalized(mod.title),
            description: mod.description
              ? asLocalized(mod.description)
              : undefined,
            status: mod.status ?? CourseStatus.Draft,
            sortOrder: mod.sortOrder ?? mi,
          };
          await this.createModule(course.id, moduleDto);
          modulesCreated += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        failures.push(`Course ${i + 1}: ${msg}`);
      }
    }

    return {
      created,
      modulesCreated,
      failed: failures.length,
      total: items.length,
      failures: failures.slice(0, 25),
    };
  }

  async exportModulesBackup(courseId: string, format: 'json' | 'xlsx' = 'json') {
    await this.getCourse(courseId);
    const modules = await this.prisma.module.findMany({
      where: { courseId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const payload: ExportModule[] = modules.map((mod) => ({
      title: asLocalized(mod.title),
      description: mod.description ? asLocalized(mod.description) : null,
      status: mod.status,
      sortOrder: mod.sortOrder,
    }));

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const rows = payload.map((m, index) => ({
        sort_order: m.sortOrder ?? index,
        title_en: m.title.en,
        title_si: m.title.si,
        title_ta: m.title.ta,
        description_en: m.description?.en ?? '',
        description_si: m.description?.si ?? '',
        description_ta: m.description?.ta ?? '',
        status: m.status,
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(rows),
        'Modules',
      );
      return xlsxDownload(workbook, `modules-backup-${stamp}.xlsx`);
    }

    return jsonDownload(
      {
        version: 1,
        type: 'modules',
        courseId,
        exportedAt: new Date().toISOString(),
        count: payload.length,
        modules: payload,
      },
      `modules-backup-${stamp}.json`,
    );
  }

  private parseImportModules(raw: unknown): ExportModule[] {
    if (Array.isArray(raw)) return raw as ExportModule[];
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.modules)) return obj.modules as ExportModule[];
    }
    throw new BadRequestException(
      'Invalid backup file. Expected { type: "modules", modules: [...] } or an array.',
    );
  }

  private parseModulesFromExcel(buffer: Buffer): ExportModule[] {
    const workbook = readWorkbook(buffer);
    const sheet =
      workbook.Sheets.Modules || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new BadRequestException('Excel file has no Modules sheet');
    const rows = sheetToRows(sheet);
    return rows.map((row, i) => {
      const title = asLocalized({
        en: row.title_en || row.title || '',
        si: row.title_si || '',
        ta: row.title_ta || '',
      });
      if (!title.en.trim()) {
        throw new BadRequestException(`Module row ${i + 2}: title_en is required`);
      }
      const statusRaw = row.status || CourseStatus.Draft;
      if (!Object.values(CourseStatus).includes(statusRaw as CourseStatus)) {
        throw new BadRequestException(`Module row ${i + 2}: invalid status`);
      }
      return {
        title,
        description: asLocalized({
          en: row.description_en || '',
          si: row.description_si || '',
          ta: row.description_ta || '',
        }),
        status: statusRaw as CourseStatus,
        sortOrder: Number(row.sort_order) || i,
      };
    });
  }

  async importModulesBackup(courseId: string, file: Express.Multer.File) {
    await this.getCourse(courseId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Backup file is required');
    }

    const name = (file.originalname || '').toLowerCase();
    let items: ExportModule[] = [];

    if (name.endsWith('.json') || file.mimetype === 'application/json') {
      items = this.parseImportModules(parseJsonBuffer(file.buffer));
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      items = this.parseModulesFromExcel(file.buffer);
    } else {
      throw new BadRequestException('Supported formats: .json, .xlsx');
    }

    if (!items.length) {
      throw new BadRequestException('No modules found in backup file');
    }

    let created = 0;
    const failures: string[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        const dto: CreateModuleDto = {
          title: asLocalized(item.title),
          description: item.description
            ? asLocalized(item.description)
            : undefined,
          status: item.status ?? CourseStatus.Draft,
          sortOrder: item.sortOrder ?? i,
        };
        await this.createModule(courseId, dto);
        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        failures.push(`Module ${i + 1}: ${msg}`);
      }
    }

    return {
      created,
      failed: failures.length,
      total: items.length,
      failures: failures.slice(0, 25),
    };
  }
}
