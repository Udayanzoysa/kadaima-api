import { Controller, Get, Query } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard(
    @Query('module') moduleId?: string,
    @Query('timeframe') timeframe?: 'weekly' | 'all_time',
  ) {
    return this.leaderboardService.getLeaderboard(moduleId, timeframe);
  }
}
