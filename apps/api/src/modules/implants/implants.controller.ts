import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ImplantRegistryService } from './implant-registry.service';
import {
  QueryRegistryDto,
  UpdateRegistryCaseDto,
  UpsertRegistryCaseDto,
} from '../registries/registry.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { UserRole } from '../../domain';

/** The implant register. Its numbering is independent of the patient file. */
@ApiTags('implants')
@Controller('implant-cases')
export class ImplantsController {
  constructor(private readonly registry: ImplantRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List implant register entries' })
  findAll(@Query() query: QueryRegistryDto) {
    return this.registry.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one implant register entry' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.registry.findOne(id);
  }

  @Post()
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Create an implant register entry' })
  create(@Body() dto: UpsertRegistryCaseDto, @CurrentUser('id') userId: string) {
    return this.registry.create(dto, userId);
  }

  @Patch(':id')
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Update an implant register entry' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRegistryCaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.registry.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.Admin, UserRole.Dentist)
  @ApiOperation({ summary: 'Delete an implant register entry' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.registry.remove(id, userId);
  }
}
