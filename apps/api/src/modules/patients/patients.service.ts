import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Patient } from './patient.entity';
import { PatientTreatment } from '../treatments/patient-treatment.entity';
import { TreatmentType } from '../treatments/treatment-type.entity';
import { ReferralSource } from '../treatments/referral-source.entity';
import {
  CreatePatientDto,
  TreatmentInputDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { PatientQueryBuilder } from './patient-query.builder';
import { PageResult } from '../../presentation/http/dto/pagination.dto';
import { PatientResponse, toPatientResponse } from './patient.mapper';
import { JalaliDate } from '../../domain';
import { searchKey, normalizeForDisplay, loosePersianKey } from '../../domain';
import { classifyReferral } from '../../domain';
import { DatePrecisionEnum } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode } from '../../domain';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(ReferralSource)
    private readonly referrals: Repository<ReferralSource>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {
    this.queries = new PatientQueryBuilder(this.patients);
  }

  /** Owns how the practice searches; this service owns what happens to records. */
  private readonly queries: PatientQueryBuilder;

  // ── Read ─────────────────────────────────────────────────────────

  /**
   * Paged patient list.
   *
   * Treatments are fetched in a second query for the page's patients rather
   * than joined in. A one-to-many join plus LIMIT forces TypeORM into a
   * distinct-subquery rewrite that both breaks ordering and reads far more
   * rows than the page needs.
   */
  async findAll(dto: QueryPatientsDto): Promise<PageResult<PatientResponse>> {
    const qb = this.queries.build(dto).skip(dto.skip).take(dto.limit);
    const [rows, total] = await qb.getManyAndCount();
    await this.attachTreatments(rows);
    return PageResult.of(
      rows.map((p) => toPatientResponse(p)),
      total,
      dto,
    );
  }

  /** Load treatments for an already-paged set of patients, in one query. */
  private async attachTreatments(patients: Patient[]): Promise<void> {
    if (!patients.length) return;
    const links = await this.dataSource.getRepository(PatientTreatment).find({
      where: { patientId: In(patients.map((p) => p.id)) },
      relations: { treatmentType: true },
    });
    const byPatient = new Map<string, PatientTreatment[]>();
    for (const link of links) {
      const list = byPatient.get(link.patientId) ?? [];
      list.push(link);
      byPatient.set(link.patientId, list);
    }
    for (const p of patients) {
      p.treatments = (byPatient.get(p.id) ?? []).sort(
        (a, b) =>
          (a.treatmentType?.sortOrder ?? 0) - (b.treatmentType?.sortOrder ?? 0),
      );
    }
  }

  async findOne(id: string): Promise<PatientResponse> {
    const patient = await this.patients.findOne({
      where: { id },
      relations: {
        referralSource: true,
        treatments: { treatmentType: true },
        implantCases: true,
        orthoCases: true,
      },
      withDeleted: true,
    });
    if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);
    return toPatientResponse(patient, true);
  }

  async findByFileNo(fileNo: string): Promise<PatientResponse> {
    const patient = await this.patients.findOne({
      where: { fileNo },
      relations: { referralSource: true, treatments: { treatmentType: true } },
    });
    if (!patient)
      throw AppException.notFound(ErrorCode.PatientNotFound, { fileNo });
    return toPatientResponse(patient, true);
  }

  /**
   * Type-ahead for the search bar. Returns the few best matches only, ranked by
   * trigram similarity so a partial or slightly misspelled Persian name still
   * surfaces the right patient.
   */
  async suggest(
    q: string,
    limit = 8,
  ): Promise<
    Array<Pick<PatientResponse, 'id' | 'fileNo' | 'fullName' | 'mobile'>>
  > {
    const key = searchKey(q);
    if (key.length < 2) return [];

    const rows = await this.patients
      .createQueryBuilder('p')
      .select(['p.id', 'p.fileNo', 'p.firstName', 'p.lastName', 'p.mobile'])
      .where('p."searchText" LIKE :like', { like: `%${key}%` })
      .orderBy('similarity(p."searchText", :key)', 'DESC')
      .addOrderBy('length(p."searchText")', 'ASC')
      .setParameter('key', key)
      .limit(limit)
      .getMany();

    return rows.map((p) => ({
      id: p.id,
      fileNo: p.fileNo,
      fullName: `${p.firstName} ${p.lastName}`.trim(),
      mobile: p.mobile,
    }));
  }

  /**
   * Distinct first/last-name spellings already on file, for the registration
   * form's autocomplete — folded with {@link loosePersianKey} so visual
   * duplicates ("علي" vs "علی") collapse into one suggestion (the spelling
   * used most often) instead of listing both, which is what nudges new
   * entries toward the spelling already in use rather than adding a third.
   */
  async nameSuggestions(
    field: 'firstName' | 'lastName',
  ): Promise<Array<{ name: string; count: number }>> {
    const rows = await this.patients
      .createQueryBuilder('p')
      .select(`p."${field}"`, 'name')
      .addSelect('COUNT(*)', 'count')
      .where(`p."${field}" != ''`)
      .groupBy(`p."${field}"`)
      .getRawMany<{ name: string; count: string }>();

    const variantsByKey = new Map<string, Array<{ name: string; count: number }>>();
    for (const row of rows) {
      const key = loosePersianKey(row.name);
      if (!key) continue;
      const list = variantsByKey.get(key) ?? [];
      list.push({ name: row.name, count: Number(row.count) });
      variantsByKey.set(key, list);
    }

    return [...variantsByKey.values()]
      .map((variants) => ({
        name: variants.reduce((a, b) => (b.count > a.count ? b : a)).name,
        count: variants.reduce((sum, v) => sum + v.count, 0),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /** The next unused file number, so staff never have to guess one. */
  async nextFileNo(): Promise<{ fileNo: string }> {
    const row = await this.dataSource.query<Array<{ max: string | null }>>(
      `SELECT max("fileNo"::bigint)::text AS max FROM patients WHERE "fileNo" ~ '^[0-9]+$'`,
    );
    const max = Number(row[0]?.max ?? 0);
    return { fileNo: String(max + 1) };
  }

  // ── Write ────────────────────────────────────────────────────────

  async create(
    dto: CreatePatientDto,
    userId: string | null,
  ): Promise<PatientResponse> {
    const id = await this.dataSource.transaction(async (manager) => {
      const clash = await manager.findOne(Patient, {
        where: { fileNo: dto.fileNo },
        withDeleted: true,
      });
      if (clash) {
        throw AppException.conflict(ErrorCode.FileNumberTaken, {
          fileNo: dto.fileNo,
        });
      }

      const patient = manager.create(Patient);
      await this.assign(patient, dto, manager.getRepository(ReferralSource));
      patient.createdById = userId;
      patient.updatedById = userId;
      patient.isImported = false;

      const row = await manager.save(Patient, patient);
      if (dto.treatments?.length) {
        await this.syncTreatments(manager, row.id, dto.treatments);
      }

      const created = await this.findPatientForAudit(manager, row.id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'create',
          entity: 'patient',
          entityId: row.id,
          changes: this.snapshot(created),
        },
        manager,
      );
      return row.id;
    });
    return this.findOne(id);
  }

  async update(
    id: string,
    dto: UpdatePatientDto,
    userId: string | null,
  ): Promise<PatientResponse> {
    await this.dataSource.transaction(async (manager) => {
      const patient = await this.findPatientForAudit(manager, id, false, false);
      if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);

      if (dto.fileNo && dto.fileNo !== patient.fileNo) {
        const clash = await manager.findOne(Patient, {
          where: { fileNo: dto.fileNo },
          withDeleted: true,
        });
        if (clash) {
          throw AppException.conflict(ErrorCode.FileNumberTaken, {
            fileNo: dto.fileNo,
          });
        }
      }

      const before = this.snapshot(patient);
      await this.assign(patient, dto, manager.getRepository(ReferralSource));
      patient.updatedById = userId;

      await manager.save(Patient, patient);
      if (dto.treatments !== undefined) {
        await this.syncTreatments(manager, patient.id, dto.treatments);
      }

      const updated = await this.findPatientForAudit(manager, id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'patient',
          entityId: id,
          changes: this.diff(before, this.snapshot(updated)),
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /** Archive, never destroy — a dental record is a legal document. */
  async archive(id: string, userId: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const patient = await this.findPatientForAudit(manager, id, false, false);
      if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);

      await manager.softDelete(Patient, id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'delete',
          entity: 'patient',
          entityId: id,
          changes: { fileNo: patient.fileNo },
        },
        manager,
      );
    });
  }

  async restore(id: string, userId: string | null): Promise<PatientResponse> {
    await this.dataSource.transaction(async (manager) => {
      const patient = await this.findPatientForAudit(manager, id, true, false);
      if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);

      await manager.restore(Patient, id);
      await this.audit.recordRequired(
        {
          userId,
          action: 'restore',
          entity: 'patient',
          entityId: id,
          changes: { fileNo: patient.fileNo },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  /** Clear a flagged import issue once staff have checked the value. */
  async resolveIssue(
    id: string,
    field: string,
    userId: string | null,
  ): Promise<PatientResponse> {
    await this.dataSource.transaction(async (manager) => {
      const patient = await manager.findOne(Patient, { where: { id } });
      if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);

      patient.dataIssues = (patient.dataIssues ?? []).filter(
        (issue) => issue.field !== field,
      );
      await manager.save(Patient, patient);
      await this.audit.recordRequired(
        {
          userId,
          action: 'update',
          entity: 'patient',
          entityId: id,
          changes: { resolvedIssue: field },
        },
        manager,
      );
    });
    return this.findOne(id);
  }

  // ── Mapping helpers ──────────────────────────────────────────────

  private async findPatientForAudit(
    manager: EntityManager,
    id: string,
  ): Promise<Patient>;
  private async findPatientForAudit(
    manager: EntityManager,
    id: string,
    withDeleted: boolean,
  ): Promise<Patient>;
  private async findPatientForAudit(
    manager: EntityManager,
    id: string,
    withDeleted: boolean,
    required: true,
  ): Promise<Patient>;
  private async findPatientForAudit(
    manager: EntityManager,
    id: string,
    withDeleted: boolean,
    required: false,
  ): Promise<Patient | null>;
  private async findPatientForAudit(
    manager: EntityManager,
    id: string,
    withDeleted = false,
    required = true,
  ): Promise<Patient | null> {
    const patient = await manager.findOne(Patient, {
      where: { id },
      relations: { referralSource: true, treatments: { treatmentType: true } },
      withDeleted,
    });
    if (!patient && required)
      throw AppException.notFound(ErrorCode.PatientNotFound);
    return patient;
  }

  private async assign(
    patient: Patient,
    dto: CreatePatientDto | UpdatePatientDto,
    referrals: Repository<ReferralSource> = this.referrals,
  ): Promise<void> {
    const set = <K extends keyof Patient>(
      key: K,
      value: Patient[K] | undefined,
    ): void => {
      if (value !== undefined) patient[key] = value;
    };

    set('fileNo', dto.fileNo);
    set('firstName', dto.firstName);
    set('lastName', dto.lastName);
    set('fatherName', dto.fatherName);
    set('nationalId', dto.nationalId);
    set('gender', dto.gender);
    set('mobile', dto.mobile);
    set('homePhone', dto.homePhone);
    set('occupation', dto.occupation);
    set('education', dto.education);
    set('medicalHistory', dto.medicalHistory);
    set('homeAddress', dto.homeAddress);
    set('workAddress', dto.workAddress);
    set('notes', dto.notes);

    this.assignDate(patient, 'birthDate', dto.birthDate);
    this.assignDate(patient, 'firstVisitAt', dto.firstVisitAt);
    this.assignDate(patient, 'lastVisitAt', dto.lastVisitAt);

    if (dto.referralSourceId !== undefined) {
      patient.referralSourceId = dto.referralSourceId;
    } else if (dto.referralSourceName !== undefined) {
      patient.referralSourceId = dto.referralSourceName
        ? (await this.findOrCreateReferral(dto.referralSourceName, referrals))
            .id
        : null;
    }

    patient.buildSearchText();
  }

  private assignDate(
    patient: Patient,
    field: 'birthDate' | 'firstVisitAt' | 'lastVisitAt',
    value: string | null | undefined,
  ): void {
    if (value === undefined) return;
    const rawField =
      field === 'birthDate'
        ? 'birthDateRaw'
        : field === 'firstVisitAt'
          ? 'firstVisitRaw'
          : 'lastVisitRaw';

    if (value === null || value === '') {
      patient[field] = null;
      patient[rawField] = null;
      if (field === 'birthDate') patient.birthDatePrecision = null;
      return;
    }

    const parsed = JalaliDate.parse(value);
    patient[field] = parsed.date;
    patient[rawField] = parsed.format();
    if (field === 'birthDate') {
      patient.birthDatePrecision = parsed.precision as DatePrecisionEnum;
    }
  }

  private async findOrCreateReferral(
    name: string,
    referrals: Repository<ReferralSource> = this.referrals,
  ): Promise<ReferralSource> {
    const normalizedName = searchKey(name);
    const existing = await referrals.findOne({ where: { normalizedName } });
    if (existing) return existing;
    return referrals.save(
      referrals.create({
        name: normalizeForDisplay(name),
        normalizedName,
        kind: classifyReferral(name),
      }),
    );
  }

  /** Synchronize selected treatment tags without erasing dates, notes, or row identity. */
  private async syncTreatments(
    manager: EntityManager,
    patientId: string,
    inputs: TreatmentInputDto[],
  ): Promise<void> {
    const requested = [
      ...new Map(inputs.map((input) => [input.code, input])).values(),
    ];
    const types = await manager.find(TreatmentType);
    const byCode = new Map(types.map((t) => [t.code, t]));

    const unknown = requested
      .map((input) => input.code)
      .filter((code) => !byCode.has(code));
    if (unknown.length) {
      throw AppException.badRequest(ErrorCode.UnknownTreatmentCode, {
        codes: unknown.join(', '),
      });
    }

    const existing = await manager.find(PatientTreatment, {
      where: { patientId },
      relations: { treatmentType: true },
    });
    const existingByType = new Map(
      existing.map((link) => [link.treatmentTypeId, link]),
    );
    const requestedTypeIds = new Set(
      requested.map((input) => byCode.get(input.code)!.id),
    );
    const removedIds = existing
      .filter((link) => !requestedTypeIds.has(link.treatmentTypeId))
      .map((link) => link.id);
    if (removedIds.length) {
      await manager.delete(PatientTreatment, { id: In(removedIds) });
    }

    const rows: PatientTreatment[] = [];
    for (const input of requested) {
      const type = byCode.get(input.code)!;
      const link =
        existingByType.get(type.id) ??
        manager.create(PatientTreatment, {
          patientId,
          treatmentTypeId: type.id,
          performedAt: null,
          performedAtRaw: null,
          notes: null,
        });

      if (input.notes !== undefined) link.notes = input.notes;
      if (input.performedAt !== undefined) {
        if (input.performedAt === null || input.performedAt === '') {
          link.performedAt = null;
          link.performedAtRaw = null;
        } else {
          const parsed = JalaliDate.parse(input.performedAt);
          link.performedAt = parsed.date;
          link.performedAtRaw = parsed.format();
        }
      }
      rows.push(link);
    }
    if (rows.length) await manager.save(PatientTreatment, rows);
  }

  private snapshot(p: Patient): Record<string, unknown> {
    return {
      fileNo: p.fileNo,
      firstName: p.firstName,
      lastName: p.lastName,
      fatherName: p.fatherName,
      nationalId: p.nationalId,
      mobile: p.mobile,
      homePhone: p.homePhone,
      gender: p.gender,
      birthDate: p.birthDateRaw,
      occupation: p.occupation,
      education: p.education,
      educationRaw: p.educationRaw,
      referralSource: p.referralSource
        ? { id: p.referralSource.id, name: p.referralSource.name }
        : null,
      medicalHistory: p.medicalHistory,
      homeAddress: p.homeAddress,
      workAddress: p.workAddress,
      firstVisitAt: p.firstVisitRaw,
      lastVisitAt: p.lastVisitRaw,
      notes: p.notes,
      treatments: (p.treatments ?? [])
        .map((link) => ({
          code: link.treatmentType?.code ?? link.treatmentTypeId,
          performedAt: link.performedAtRaw,
          notes: link.notes,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      dataIssues: p.dataIssues ?? [],
      isArchived: p.deletedAt !== null,
    };
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after)) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }
    return changes;
  }
}
