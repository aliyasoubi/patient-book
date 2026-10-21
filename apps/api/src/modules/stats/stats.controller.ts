import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { MaterialConsumptionService } from './material-consumption.service';
import { ConsumptionQueryDto } from './dto/consumption.dto';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly materials: MaterialConsumptionService,
  ) {}

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

  @Get('consumption')
  @ApiOperation({
    summary: 'Material consumption: units used per item, per Jalali month',
  })
  consumption(@Query() query: ConsumptionQueryDto) {
    return this.materials.consumption(query.months, query.q);
  }

  @Get('follow-ups')
  @ApiOperation({ summary: "The coming week's follow-ups, soonest first" })
  followUps() {
    return this.stats.followUpsThisWeek();
  }
}
