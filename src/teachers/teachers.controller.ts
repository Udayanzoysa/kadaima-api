import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateTeacherInquiryDto } from './dto/teacher-inquiry.dto';
import {
  ReorderIdsDto,
  UpdateTeacherProfileDto,
  UpsertTeacherBannerDto,
  UpsertTeacherClassDto,
  UpsertTeacherPosterDto,
} from './dto/teacher-profile.dto';
import { TeachersService } from './teachers.service';

const teacherUploadDir = join(process.cwd(), 'uploads', 'teachers');
if (!existsSync(teacherUploadDir)) {
  mkdirSync(teacherUploadDir, { recursive: true });
}

@ApiTags('Teacher Public Page (Manage)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teachers/me')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get my teacher public page profile' })
  getMyProfile(@Req() req: any) {
    return this.teachersService.getMyProfile(req.user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update my teacher public page (slug, branding, publish)' })
  updateMyProfile(@Req() req: any, @Body() dto: UpdateTeacherProfileDto) {
    return this.teachersService.updateMyProfile(req.user.id, dto);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload side banner or carousel image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: teacherUploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new Error('Only image uploads are allowed') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { url: null };
    return { url: `/uploads/teachers/${file.filename}` };
  }

  @Post('banners')
  @ApiOperation({ summary: 'Add a landing carousel banner' })
  addBanner(@Req() req: any, @Body() dto: UpsertTeacherBannerDto) {
    return this.teachersService.addBanner(req.user.id, dto);
  }

  @Put('banners/reorder')
  @ApiOperation({ summary: 'Reorder carousel banners by id list' })
  reorderBanners(@Req() req: any, @Body() dto: ReorderIdsDto) {
    return this.teachersService.reorderBanners(req.user.id, dto.ids);
  }

  @Put('banners/:id')
  updateBanner(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpsertTeacherBannerDto,
  ) {
    return this.teachersService.updateBanner(req.user.id, id, dto);
  }

  @Delete('banners/:id')
  deleteBanner(@Req() req: any, @Param('id') id: string) {
    return this.teachersService.deleteBanner(req.user.id, id);
  }

  @Post('classes')
  @ApiOperation({ summary: 'Add a class card on the landing page' })
  addClass(@Req() req: any, @Body() dto: UpsertTeacherClassDto) {
    return this.teachersService.addClass(req.user.id, dto);
  }

  @Put('classes/reorder')
  @ApiOperation({ summary: 'Reorder class accordion items by id list' })
  reorderClasses(@Req() req: any, @Body() dto: ReorderIdsDto) {
    return this.teachersService.reorderClasses(req.user.id, dto.ids);
  }

  @Put('classes/:id')
  updateClass(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpsertTeacherClassDto,
  ) {
    return this.teachersService.updateClass(req.user.id, id, dto);
  }

  @Delete('classes/:id')
  deleteClass(@Req() req: any, @Param('id') id: string) {
    return this.teachersService.deleteClass(req.user.id, id);
  }

  @Post('posters')
  @ApiOperation({ summary: 'Add a dynamic poster banner (top / middle / footer)' })
  addPoster(@Req() req: any, @Body() dto: UpsertTeacherPosterDto) {
    return this.teachersService.addPoster(req.user.id, dto);
  }

  @Put('posters/reorder')
  @ApiOperation({ summary: 'Reorder poster banners by id list' })
  reorderPosters(@Req() req: any, @Body() dto: ReorderIdsDto) {
    return this.teachersService.reorderPosters(req.user.id, dto.ids);
  }

  @Put('posters/:id')
  updatePoster(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpsertTeacherPosterDto,
  ) {
    return this.teachersService.updatePoster(req.user.id, id, dto);
  }

  @Delete('posters/:id')
  deletePoster(@Req() req: any, @Param('id') id: string) {
    return this.teachersService.deletePoster(req.user.id, id);
  }

  @Get('inquiries')
  @ApiOperation({ summary: 'List student inquiries / asks for my public page' })
  listInquiries(@Req() req: any) {
    return this.teachersService.listMyInquiries(req.user.id);
  }

  @Patch('inquiries/:id')
  @ApiOperation({ summary: 'Update inquiry status (NEW / READ / ARCHIVED)' })
  updateInquiry(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTeacherInquiryDto,
  ) {
    return this.teachersService.updateMyInquiry(req.user.id, id, dto);
  }
}
