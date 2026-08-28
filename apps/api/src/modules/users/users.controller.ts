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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { User } from './user.entity';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import { UserRole } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode } from '../../domain';

@ApiTags('users')
@Controller('users')
// User management is an administrator-only surface, top to bottom.
@Roles(UserRole.Admin)
export class UsersController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  findAll() {
    return this.users.find({ order: { fullName: 'ASC' } });
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  async create(@Body() dto: CreateUserDto, @CurrentUser('id') actorId: string) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.users.manager.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const exists = await users
        .createQueryBuilder('u')
        .where('lower(u.username) = lower(:username)', {
          username: dto.username,
        })
        .getOne();
      if (exists) {
        throw AppException.conflict(ErrorCode.UsernameTaken, {
          username: dto.username,
        });
      }

      const user = await users.save(
        users.create({
          username: dto.username,
          fullName: dto.fullName,
          role: dto.role,
          passwordHash,
          mustChangePassword: true,
        }),
      );
      await this.audit.recordRequired(
        {
          userId: actorId,
          action: 'create',
          entity: 'user',
          entityId: user.id,
          changes: { username: user.username, role: user.role },
        },
        manager,
      );
      return users.findOneOrFail({ where: { id: user.id } });
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    if (id === actorId && dto.isActive === false) {
      throw AppException.forbidden(ErrorCode.CannotDisableSelf);
    }
    if (id === actorId && dto.role && dto.role !== UserRole.Admin) {
      throw AppException.forbidden(ErrorCode.CannotDemoteSelf);
    }
    return this.users.manager.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const current = await users.findOne({ where: { id } });
      if (!current) {
        throw AppException.notFound(ErrorCode.NotFound, { entity: 'user' });
      }

      if (
        dto.username &&
        dto.username.toLocaleLowerCase() !==
          current.username.toLocaleLowerCase()
      ) {
        const clash = await users
          .createQueryBuilder('u')
          .where('lower(u.username) = lower(:username)', {
            username: dto.username,
          })
          .andWhere('u.id <> :id', { id })
          .getOne();
        if (clash) {
          throw AppException.conflict(ErrorCode.UsernameTaken, {
            username: dto.username,
          });
        }
      }

      const patch: Partial<User> = { ...dto };
      // Disabling an account must end its live sessions, not just block new logins.
      if (dto.isActive === false) {
        patch.tokenVersion = current.tokenVersion + 1;
      }
      await users.update(id, patch);
      await this.audit.recordRequired(
        {
          userId: actorId,
          action: 'update',
          entity: 'user',
          entityId: id,
          changes: dto as Record<string, unknown>,
        },
        manager,
      );
      return users.findOneOrFail({ where: { id } });
    });
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a new password for a user' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('id') actorId: string,
  ) {
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.users.manager.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({ where: { id } });
      if (!user) {
        throw AppException.notFound(ErrorCode.NotFound, { entity: 'user' });
      }
      await users.update(id, {
        passwordHash,
        tokenVersion: user.tokenVersion + 1,
        mustChangePassword: true,
      });
      await this.audit.recordRequired(
        {
          userId: actorId,
          action: 'update',
          entity: 'user',
          entityId: id,
          changes: { passwordReset: true },
        },
        manager,
      );
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deactivate a user' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    if (id === actorId)
      throw AppException.forbidden(ErrorCode.CannotDeleteSelf);
    await this.users.manager.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({ where: { id } });
      if (!user) {
        throw AppException.notFound(ErrorCode.NotFound, { entity: 'user' });
      }
      // Users are deactivated, never deleted — audit rows must keep pointing at
      // a real person.
      await users.update(id, {
        isActive: false,
        tokenVersion: user.tokenVersion + 1,
      });
      await this.audit.recordRequired(
        {
          userId: actorId,
          action: 'delete',
          entity: 'user',
          entityId: id,
        },
        manager,
      );
    });
  }
}
