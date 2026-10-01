import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Lab } from './lab.entity';
import { CreateLabDto, UpdateLabDto } from './dto/lab.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode, searchKey, UserRole } from '../../domain';

/**
 * The labs the practice works with, managed from Settings. All of them are
 * listed, inactive ones flagged: the case form offers only the active ones,
 * but an old case still has to show the lab it went to.
 */
@ApiTags('lab')
@Controller('labs')
export class LabsController {
  constructor(
    @InjectRepository(Lab) private readonly labs: Repository<Lab>,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every lab, active and not' })
  list() {
    return this.labs.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  @Post()
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Add a lab' })
  create(@Body() dto: CreateLabDto, @CurrentUser('id') userId: string) {
    return this.labs.manager.transaction(async (manager) => {
      const labs = manager.getRepository(Lab);
      const normalizedName = searchKey(dto.name);
      if (await labs.exists({ where: { normalizedName } })) {
        throw AppException.conflict(ErrorCode.LabNameTaken, { name: dto.name });
      }
      const last = await labs.maximum('sortOrder');
      const lab = await labs.save(
        labs.create({
          name: dto.name,
          normalizedName,
          isActive: true,
          sortOrder: (last ?? 0) + 1,
        }),
      );
      await this.audit.recordRequired(
        {
          userId,
          action: 'create',
          entity: 'lab',
          entityId: lab.id,
          changes: { name: lab.name },
        },
        manager,
      );
      return lab;
    });
  }

  @Patch(':id')
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Rename a lab, or stop offering it' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.labs.manager.transaction(async (manager) => {
      const labs = manager.getRepository(Lab);
      const lab = await labs.findOne({ where: { id } });
      if (!lab) throw AppException.notFound(ErrorCode.LabNotFound);
      if (dto.name !== undefined) {
        const normalizedName = searchKey(dto.name);
        const clash = await labs.findOne({ where: { normalizedName } });
        if (clash && clash.id !== id) {
          throw AppException.conflict(ErrorCode.LabNameTaken, {
            name: dto.name,
          });
        }
        lab.name = dto.name;
        lab.normalizedName = normalizedName;
      }
      if (dto.isActive !== undefined) lab.isActive = dto.isActive;
      const saved = await labs.save(lab);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'lab',
          entityId: id,
          changes: { ...dto },
        },
        manager,
      );
      return saved;
    });
  }
}
