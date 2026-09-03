import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PatientsService } from './patients.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { UserRole, ErrorCode } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';

@ApiTags('patients')
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List patients with search and filters' })
  findAll(@Query() query: QueryPatientsDto) {
    return this.patients.findAll(query);
  }

  @Get('suggest')
  @ApiOperation({ summary: 'Type-ahead suggestions for the search bar' })
  suggest(@Query('q') q: string) {
    return this.patients.suggest(q ?? '');
  }

  @Get('name-suggestions')
  @ApiOperation({ summary: 'Distinct first/last-name spellings on file, for the registration form' })
  nameSuggestions(@Query('field') field: string) {
    if (field !== 'firstName' && field !== 'lastName') {
      throw AppException.badRequest(ErrorCode.ValidationFailed, { field: 'field' });
    }
    return this.patients.nameSuggestions(field);
  }

  @Get('next-file-no')
  @ApiOperation({ summary: 'Next unused file number' })
  nextFileNo() {
    return this.patients.nextFileNo();
  }

  @Get('by-file-no/:fileNo')
  @ApiOperation({ summary: 'Find a patient by file number' })
  findByFileNo(@Param('fileNo') fileNo: string) {
    return this.patients.findByFileNo(fileNo);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one patient record' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.patients.findOne(id);
  }

  @Get(':id/history')
  @Roles(UserRole.Admin, UserRole.Dentist)
  @ApiOperation({ summary: 'Change history for a record' })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.audit.forEntity('patient', id);
  }

  @Post()
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Create a patient' })
  create(@Body() dto: CreatePatientDto, @CurrentUser('id') userId: string) {
    return this.patients.create(dto, userId);
  }

  @Patch(':id')
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Update a patient' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.patients.update(id, dto, userId);
  }

  @Patch(':id/resolve-issue/:field')
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Acknowledge and clear a data-review flag' })
  resolveIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('field') field: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.patients.resolveIssue(id, field, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  // Archiving is a clinical-record decision, not a front-desk one.
  @Roles(UserRole.Admin, UserRole.Dentist)
  @ApiOperation({ summary: 'Archive a record (never deleted)' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.patients.archive(id, userId);
  }

  @Post(':id/restore')
  @Roles(UserRole.Admin, UserRole.Dentist)
  @ApiOperation({ summary: 'Restore a record from the archive' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.patients.restore(id, userId);
  }
}
