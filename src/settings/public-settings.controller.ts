import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('Public Settings')
@Controller('public')
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('settings/seo')
  @ApiOperation({
    summary: 'Public site SEO + Google Analytics ID (no auth)',
  })
  getPublicSeo() {
    return this.settingsService.getPublicSeoSettings();
  }

  @Get('homepage')
  @ApiOperation({
    summary: 'Resolved public homepage: hero, ordered quiz sections, promo',
  })
  @ApiQuery({ name: 'guestSessionId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  getPublicHomepage(
    @Query('guestSessionId') guestSessionId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.settingsService.getPublicHomepage(guestSessionId, userId);
  }
}
