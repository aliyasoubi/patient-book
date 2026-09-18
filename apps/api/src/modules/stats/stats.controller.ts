import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Practice-wide statistics' })
  dashboard() {
    return this.stats.dashboard();
  }

  @Get('follow-ups')
  @ApiOperation({ summary: "The coming week's follow-ups, soonest first" })
  followUps() {
    return this.stats.followUpsThisWeek();
  }
}
