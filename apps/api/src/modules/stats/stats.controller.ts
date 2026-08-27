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

  @Get('upcoming-surgeries')
  @ApiOperation({ summary: 'Upcoming surgeries' })
  upcoming() {
    return this.stats.upcomingSurgeries();
  }
}
