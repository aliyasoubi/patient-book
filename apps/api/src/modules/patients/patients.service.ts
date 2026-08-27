import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Patient } from './patient.entity';
import { PatientTreatment } from '../treatments/patient-treatment.entity';
import { TreatmentType } from '../treatments/treatment-type.entity';
import { ReferralSource } from '../treatments/referral-source.entity';
import { CreatePatientDto, TreatmentInputDto, UpdatePatientDto } from './dto/patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { PatientQueryBuilder } from './patient-query.builder';
import { PageResult } from '../../presentation/http/dto/pagination.dto';
import { PatientResponse, toPatientResponse } from './patient.mapper';
import { JalaliDate } from '../../domain';
import { searchKey, normalizeForDisplay } from '../../domain';
import { classifyReferral } from '../../domain';
import { DatePrecisionEnum } from '../../domain';
import { AuditService } from '../../application/services/audit.service';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode } from '../../domain';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(ReferralSource) private readonly referrals: Repository<ReferralSource>,
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
    return PageResult.of(rows.map((p) => toPatientResponse(p)), total, dto);
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
        (a, b) => (a.treatmentType?.sortOrder ?? 0) - (b.treatmentType?.sortOrder ?? 0),
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
    if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound, { fileNo });
    return toPatientResponse(patient, true);
  }

  /**
   * Type-ahead for the search bar. Returns the few best matches only, ranked by
   * trigram similarity so a partial or slightly misspelled Persian name still
   * surfaces the right patient.
   */
  async suggest(q: string, limit = 8): Promise<Array<Pick<PatientResponse, 'id' | 'fileNo' | 'fullName' | 'mobile'>>> {
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

  /** The next unused file number, so staff never have to guess one. */
  async nextFileNo(): Promise<{ fileNo: string }> {
    const row = await this.dataSource.query<Array<{ max: string | null }>>(
      `SELECT max("fileNo"::bigint)::text AS max FROM patients WHERE "fileNo" ~ '^[0-9]+$'`,
    );
    const max = Number(row[0]?.max ?? 0);
    return { fileNo: String(max + 1) };
  }

  // ── Write ────────────────────────────────────────────────────────

  async create(dto: CreatePatientDto, userId: string | null): Promise<PatientResponse> {
    const clash = await this.patients.findOne({
      where: { fileNo: dto.fileNo },
      withDeleted: true,
    });
    if (clash) throw AppException.conflict(ErrorCode.FileNumberTaken, { fileNo: dto.fileNo });

    const patient = this.patients.create();
    await this.assign(patient, dto);
    patient.createdById = userId;
    patient.updatedById = userId;
    patient.isImported = false;

    const saved = await this.dataSource.transaction(async (manager) => {
      const row = await manager.save(Patient, patient);
      if (dto.treatments?.length) {
        await this.replaceTreatments(manager, row.id, dto.treatments);
      }
      return row;
    });

    await this.audit.record({
      userId,
      action: 'create',
      entity: 'patient',
      entityId: saved.id,
      changes: { fileNo: saved.fileNo, fullName: `${saved.firstName} ${saved.lastName}` },
    });
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdatePatientDto, userId: string | null): Promise<PatientResponse> {
    const patient = await this.patients.findOne({ where: { id } });
    if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);

    if (dto.fileNo && dto.fileNo !== patient.fileNo) {
      const clash = await this.patients.findOne({
        where: { fileNo: dto.fileNo },
        withDeleted: true,
      });
      if (clash) throw AppException.conflict(ErrorCode.FileNumberTaken, { fileNo: dto.fileNo });
    }

    const before = this.snapshot(patient);
    await this.assign(patient, dto);
    patient.updatedById = userId;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Patient, patient);
      if (dto.treatments) {
        await this.replaceTreatments(manager, patient.id, dto.treatments);
      }
    });

    await this.audit.record({
      userId,
      action: 'update',
      entity: 'patient',
      entityId: id,
      changes: this.diff(before, this.snapshot(patient)),
    });
    return this.findOne(id);
  }

  /** Archive, never destroy — a dental record is a legal document. */
  async archive(id: string, userId: string | null): Promise<void> {
    const patient = await this.patients.findOne({ where: { id } });
    if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);
    await this.patients.softDelete(id);
    await this.audit.record({
      userId,
      action: 'delete',
      entity: 'patient',
      entityId: id,
      changes: { fileNo: patient.fileNo },
    });
  }

  async restore(id: string, userId: string | null): Promise<PatientResponse> {
    const patient = await this.patients.findOne({ where: { id }, withDeleted: true });
    if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);
    await this.patients.restore(id);
    await this.audit.record({ userId, action: 'restore', entity: 'patient', entityId: id });
    return this.findOne(id);
  }

  /** Clear a flagged import issue once staff have checked the value. */
  async resolveIssue(id: string, field: string, userId: string | null): Promise<PatientResponse> {
    const patient = await this.patients.findOne({ where: { id } });
    if (!patient) throw AppException.notFound(ErrorCode.PatientNotFound);
    patient.dataIssues = (patient.dataIssues ?? []).filter((i) => i.field !== field);
    await this.patients.save(patient);
    await this.audit.record({
      userId,
      action: 'update',
      entity: 'patient',
      entityId: id,
      changes: { resolvedIssue: field },
    });
    return this.findOne(id);
  }

  // ── Mapping helpers ──────────────────────────────────────────────

  private async assign(patient: Patient, dto: CreatePatientDto | UpdatePatientDto): Promise<void> {
    const set = <K extends keyof Patient>(key: K, value: Patient[K] | undefined): void => {
      if (value !== undefined) patient[key] = value;
    };

    set('fileNo', dto.fileNo);
    set('firstName', dto.firstName);
    set('lastName', dto.lastName);
    set('fatherName', dto.fatherName ?? undefined);
    set('nationalId', dto.nationalId ?? undefined);
    set('gender', dto.gender);
    set('mobile', dto.mobile ?? undefined);
    set('homePhone', dto.homePhone ?? undefined);
    set('occupation', dto.occupation ?? undefined);
    set('education', dto.education);
    set('medicalHistory', dto.medicalHistory ?? undefined);
    set('homeAddress', dto.homeAddress ?? undefined);
    set('workAddress', dto.workAddress ?? undefined);
    set('notes', dto.notes ?? undefined);

    // Explicit nulls clear a field; `undefined` leaves it alone.
    if (dto.fatherName === null) patient.fatherName = null;
    if (dto.nationalId === null) patient.nationalId = null;
    if (dto.mobile === null) patient.mobile = null;
    if (dto.homePhone === null) patient.homePhone = null;

    this.assignDate(patient, 'birthDate', dto.birthDate);
    this.assignDate(patient, 'firstVisitAt', dto.firstVisitAt);
    this.assignDate(patient, 'lastVisitAt', dto.lastVisitAt);

    if (dto.referralSourceId !== undefined) {
      patient.referralSourceId = dto.referralSourceId;
    } else if (dto.referralSourceName) {
      patient.referralSourceId = (await this.findOrCreateReferral(dto.referralSourceName)).id;
    }

    patient.buildSearchText();
  }

  private assignDate(
    patient: Patient,
    field: 'birthDate' | 'firstVisitAt' | 'lastVisitAt',
    value: string | null | undefined,
  ): void {
    if (value === undefined) return;
    const rawField = (
      field === 'birthDate' ? 'birthDateRaw' : field === 'firstVisitAt' ? 'firstVisitRaw' : 'lastVisitRaw'
    ) as 'birthDateRaw' | 'firstVisitRaw' | 'lastVisitRaw';

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

  private async findOrCreateReferral(name: string): Promise<ReferralSource> {
    const normalizedName = searchKey(name);
    const existing = await this.referrals.findOne({ where: { normalizedName } });
    if (existing) return existing;
    return this.referrals.save(
      this.referrals.create({
        name: normalizeForDisplay(name),
        normalizedName,
        kind: classifyReferral(name),
      }),
    );
  }

  /** Replace the patient's treatment set with exactly what the client sent. */
  private async replaceTreatments(
    manager: ReturnType<DataSource['createEntityManager']>,
    patientId: string,
    inputs: TreatmentInputDto[],
  ): Promise<void> {
    const types = await manager.find(TreatmentType);
    const byCode = new Map(types.map((t) => [t.code, t]));

    const unknown = inputs.map((i) => i.code).filter((c) => !byCode.has(c));
    if (unknown.length) {
      throw AppException.badRequest(ErrorCode.UnknownTreatmentCode, {
        codes: unknown.join(', '),
      });
    }

    await manager.delete(PatientTreatment, { patientId });
    if (!inputs.length) return;

    const rows = inputs.map((input) => {
      const link = new PatientTreatment();
      link.patientId = patientId;
      link.treatmentTypeId = byCode.get(input.code)!.id;
      link.notes = input.notes ?? null;
      if (input.performedAt) {
        const parsed = JalaliDate.parse(input.performedAt);
        link.performedAt = parsed.date;
        link.performedAtRaw = parsed.format();
      }
      return link;
    });
    await manager.save(PatientTreatment, rows);
  }

  private snapshot(p: Patient): Record<string, unknown> {
    return {
      fileNo: p.fileNo,
      firstName: p.firstName,
      lastName: p.lastName,
      nationalId: p.nationalId,
      mobile: p.mobile,
      homePhone: p.homePhone,
      gender: p.gender,
      birthDate: p.birthDateRaw,
      occupation: p.occupation,
      education: p.education,
      medicalHistory: p.medicalHistory,
      homeAddress: p.homeAddress,
      lastVisitAt: p.lastVisitRaw,
    };
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after)) {
      if (before[key] !== after[key]) changes[key] = { from: before[key], to: after[key] };
    }
    return changes;
  }
}
