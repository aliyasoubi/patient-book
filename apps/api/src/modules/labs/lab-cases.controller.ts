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

import { LabCasesService } from './lab-cases.service';
import {
  CreateLabCaseDto,
  LabBoardQueryDto,
  BookLabCaseDto,
  LabCaseDateDto,
  PartsReturnedDto,
  ReceiveLabCaseDto,
  QueryLabCasesDto,
  SendLabCaseDto,
  UndoLabCaseDto,
  UpdateLabCaseDto,
} from './dto/lab.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { UserRole } from '../../domain';

/** Every role but the read-only viewer works the lab board; nothing on it is restricted further. */
const STAFF = [UserRole.Admin, UserRole.Dentist, UserRole.Receptionist];

@ApiTags('lab')
@Controller('lab-cases')
export class LabCasesController {
  constructor(private readonly cases: LabCasesService) {}

  @Get('board')
  @ApiOperation({
    summary: 'Open lab cases by where the work is, and recent deliveries',
  })
  board(@Query() query: LabBoardQueryDto) {
    return this.cases.board(query);
  }

  @Get()
  @ApiOperation({
    summary: 'Lab cases, newest first — one patient’s, or the archive',
  })
  list(@Query() query: QueryLabCasesDto) {
    return this.cases.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cases.findOne(id);
  }

  @Post()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Open a case with its first trip to the lab' })
  create(@Body() dto: CreateLabCaseDto, @CurrentUser('id') userId: string) {
    return this.cases.create(dto, userId);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Correct a case and its latest trip' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabCaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.update(id, dto, userId);
  }

  @Post(':id/receive')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Back from the lab' })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveLabCaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.receive(id, dto, userId);
  }

  @Post(':id/book')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'The patient is booked for the fitting' })
  book(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookLabCaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.book(id, dto, userId);
  }

  @Post(':id/send')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Back to the lab for the next step' })
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendLabCaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.send(id, dto, userId);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Fitted for the patient' })
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LabCaseDateDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.deliver(id, dto, userId);
  }

  @Post(':id/undo')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Take back the last move' })
  undo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UndoLabCaseDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.undo(id, dto.expectedVersion, userId);
  }

  @Post(':id/parts-returned')
  @HttpCode(200)
  @Roles(...STAFF)
  @ApiOperation({
    summary: 'The lab gave back the impression copings and analogs',
  })
  partsReturned(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PartsReturnedDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.partsReturned(id, dto.returned, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Archive a lab case' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.remove(id, userId);
  }

  @Post(':id/restore')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Restore an archived lab case' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.cases.restore(id, userId);
  }
}
