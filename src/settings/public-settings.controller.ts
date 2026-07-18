import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('Public Settings')
@Controller('public/settings')
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('seo')
  @ApiOperation({
    summary: 'Public site SEO + Google Analytics ID (no auth)',
  })
  getPublicSeo() {
    return this.settingsService.getPublicSeoSettings();
  }
}
