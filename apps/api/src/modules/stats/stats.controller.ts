import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: "The front desk's work: what needs attention" })
  dashboard() {
    return this.stats.dashboard();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Practice-wide statistics' })
  overview() {
    return this.stats.overview();
  }

  @Get('follow-ups')
  @ApiOperation({ summary: "The coming week's follow-ups, soonest first" })
  followUps() {
    return this.stats.followUpsThisWeek();
  }
}
