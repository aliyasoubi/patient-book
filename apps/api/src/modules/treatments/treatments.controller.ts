import { Body, Controller, Get, Patch, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { TreatmentType } from './treatment-type.entity';
import { ReferralSource } from './referral-source.entity';
import { ReferralKind, UserRole } from '../../domain';
import { Roles } from '../../presentation/http/decorators/roles.decorator';
import { normalizeForDisplay, searchKey } from '../../domain';
import { classifyReferral } from '../../domain';

class UpsertReferralDto {
  @Transform(({ value }) => normalizeForDisplay(String(value ?? '')))
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(ReferralKind)
  @IsOptional()
  kind?: ReferralKind;
}

@ApiTags('catalogue')
@Controller()
export class TreatmentsController {
  constructor(
    @InjectRepository(TreatmentType) private readonly types: Repository<TreatmentType>,
    @InjectRepository(ReferralSource) private readonly referrals: Repository<ReferralSource>,
  ) {}

  @Get('treatment-types')
  @ApiOperation({ summary: 'List treatment types' })
  listTypes() {
    return this.types.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
  }

  @Get('referral-sources')
  @ApiOperation({ summary: 'List referral sources with patient counts' })
  async listReferrals(@Query('q') q?: string) {
    // The patient count comes from a correlated subquery rather than a join,
    // so the GROUP BY does not have to carry every referral column.
    const qb = this.referrals
      .createQueryBuilder('rs')
      .addSelect(
        `(SELECT count(*) FROM patients p
           WHERE p."referralSourceId" = rs.id AND p."deletedAt" IS NULL)`,
        'patientCount',
      )
      .orderBy('rs.name', 'ASC');

    const key = searchKey(q);
    if (key) qb.where('rs."normalizedName" LIKE :key', { key: `%${key}%` });

    const { entities, raw } = await qb.getRawAndEntities<{ patientCount: string }>();
    return entities.map((rs, i) => ({
      ...rs,
      patientCount: Number(raw[i]?.patientCount ?? 0),
    }));
  }

  @Post('referral-sources')
  @Roles(UserRole.Admin, UserRole.Dentist, UserRole.Receptionist)
  @ApiOperation({ summary: 'Add a referral source' })
  async createReferral(@Body() dto: UpsertReferralDto) {
    const normalizedName = searchKey(dto.name);
    const existing = await this.referrals.findOne({ where: { normalizedName } });
    if (existing) return existing;
    return this.referrals.save(
      this.referrals.create({
        name: dto.name,
        normalizedName,
        kind: dto.kind ?? classifyReferral(dto.name),
      }),
    );
  }

  @Patch('referral-sources/:id')
  @Roles(UserRole.Admin, UserRole.Dentist)
  @ApiOperation({ summary: 'Update a referral source' })
  async updateReferral(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertReferralDto) {
    await this.referrals.update(id, {
      name: dto.name,
      normalizedName: searchKey(dto.name),
      ...(dto.kind ? { kind: dto.kind } : {}),
    });
    return this.referrals.findOne({ where: { id } });
  }
}
