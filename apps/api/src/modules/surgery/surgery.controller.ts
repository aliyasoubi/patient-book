import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { SurgeryService } from './surgery.service';
import { QuerySurgeryDto, UpdateSurgeryDto, UpsertSurgeryDto } from './dto/surgery.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { UserRole } from '../../domain';

@ApiTags('surgery')
@Controller('surgery-queue')
export class SurgeryController {
  constructor(private readonly surgery: SurgeryService) {}

  @Get()
  @ApiOperation({ summary: 'Second-stage surgery waiting list' })
  findAll(@Query() query: QuerySurgeryDto) {
    return this.surgery.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.surgery.findOne(id);
  }

  @Post()
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  create(@Body() dto: UpsertSurgeryDto, @CurrentUser('id') userId: string) {
    return this.surgery.create(dto, userId);
  }

  @Patch(':id')
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSurgeryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.surgery.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.Admin, UserRole.Dentist)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.surgery.remove(id, userId);
  }
}
