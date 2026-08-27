import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';

import { AppException } from '../../application/errors/app.exception';
import { ErrorCode, JalaliDate, searchKey } from '../../domain';
import { Patient } from './patient.entity';
import { QueryPatientsDto } from './dto/query-patients.dto';

/**
 * Columns a client may sort by.
 *
 * An allow-list, not a pass-through: `sortBy` reaches SQL, so accepting an
 * arbitrary string would be an injection vector. Written as TypeORM property
 * paths rather than raw SQL so the builder can rewrite them for any subquery it
 * generates — a quoted identifier gets mangled by its paginated-join rewrite.
 */
const SORTABLE: Readonly<Record<string, string>> = {
  fileNo: 'p.fileNo',
  lastName: 'p.lastName',
  firstName: 'p.firstName',
  lastVisitAt: 'p.lastVisitAt',
  firstVisitAt: 'p.firstVisitAt',
  birthDate: 'p.birthDate',
  createdAt: 'p.createdAt',
  updatedAt: 'p.updatedAt',
};

/**
 * Translates a {@link QueryPatientsDto} into a TypeORM query.
 *
 * Separated from `PatientsService` so that persistence orchestration and search
 * semantics can change independently: this class knows how the practice
 * searches, the service knows what happens to a record. It holds no state and
 * performs no I/O.
 */
export class PatientQueryBuilder {
  constructor(private readonly patients: Repository<Patient>) {}

  build(dto: QueryPatientsDto): SelectQueryBuilder<Patient> {
    const qb = this.base(dto);
    this.applyFilters(qb, dto);
    this.applySearch(qb, dto.q);
    this.applySort(qb, dto);
    return qb;
  }

  /**
   * Many-to-one joins only. A one-to-many join combined with LIMIT forces
   * TypeORM into a distinct-subquery rewrite that both breaks ordering and
   * reads far more rows than the page needs; treatments are fetched separately.
   */
  private base(dto: QueryPatientsDto): SelectQueryBuilder<Patient> {
    const qb = this.patients
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.referralSource', 'rs');
    if (dto.includeArchived) qb.withDeleted();
    return qb;
  }

  /**
   * Free-text search over the folded `searchText` column.
   *
   * The query is folded exactly the way the column was, so a receptionist
   * typing Arabic ي or Persian digits matches rows stored in the Persian forms.
   * Every word must match, which is what makes a two-word query narrow the
   * result set rather than widen it.
   */
  private applySearch(qb: SelectQueryBuilder<Patient>, q?: string): void {
    const key = searchKey(q);
    if (!key) return;

    const words = key.split(' ').filter(Boolean);
    qb.andWhere(
      new Brackets((b) => {
        words.forEach((word, i) => {
          b.andWhere(`p."searchText" LIKE :w${i}`, { [`w${i}`]: `%${word}%` });
        });
      }),
    );

    // Ranking terms are exposed as select aliases: TypeORM's `orderBy` reads a
    // raw expression's leading token as a table alias and rejects it.
    qb.addSelect(`(p."fileNo" = :simKey)`, 'exact_file')
      .addSelect(`similarity(p."searchText", :simKey)`, 'sim')
      .setParameter('simKey', key);
  }

  private applyFilters(qb: SelectQueryBuilder<Patient>, dto: QueryPatientsDto): void {
    if (dto.gender) qb.andWhere('p.gender = :gender', { gender: dto.gender });
    if (dto.education) qb.andWhere('p.education = :education', { education: dto.education });
    if (dto.referralSourceId) {
      qb.andWhere('p."referralSourceId" = :rsid', { rsid: dto.referralSourceId });
    }
    if (dto.hasIssues) qb.andWhere(`jsonb_array_length(p."dataIssues") > 0`);
    if (dto.hasMedicalHistory) {
      qb.andWhere(`p."medicalHistory" IS NOT NULL AND btrim(p."medicalHistory") <> ''`);
    }

    // "Has all of these", not "has any": selecting implant and veneer should
    // find the patients who have had both.
    if (dto.treatments?.length) {
      qb.andWhere(
        `(SELECT count(DISTINCT t2."code")
            FROM patient_treatments pt2
            JOIN treatment_types t2 ON t2.id = pt2."treatmentTypeId"
           WHERE pt2."patientId" = p.id AND t2."code" IN (:...codes)) = :codeCount`,
        { codes: dto.treatments, codeCount: dto.treatments.length },
      );
    }

    if (dto.inactiveMonths) {
      qb.andWhere(
        `(p."lastVisitAt" IS NULL OR p."lastVisitAt" < (now() - (:months || ' months')::interval))`,
        { months: dto.inactiveMonths },
      );
    }

    for (const [key, op] of [
      ['lastVisitFrom', '>='],
      ['lastVisitTo', '<='],
    ] as const) {
      const raw = dto[key];
      if (!raw) continue;
      // Throws a DomainError carrying the exact reason; the filter turns it
      // into a 400 the client renders in its own language.
      qb.andWhere(`p."lastVisitAt" ${op} :${key}`, { [key]: JalaliDate.parse(raw).toIsoDate() });
    }
  }

  private applySort(qb: SelectQueryBuilder<Patient>, dto: QueryPatientsDto): void {
    if (dto.q && !dto.sortBy) {
      // Relevance only means something when there is a query. An exact file
      // number outranks everything, then trigram closeness.
      qb.orderBy('exact_file', 'DESC').addOrderBy('sim', 'DESC').addOrderBy('p.lastName', 'ASC');
      return;
    }

    const column = SORTABLE[dto.sortBy ?? 'lastName'];
    if (!column) {
      throw AppException.badRequest(ErrorCode.SortFieldUnsupported, {
        field: String(dto.sortBy),
      });
    }
    qb.orderBy(column, dto.sortDir, 'NULLS LAST');
    if (column !== SORTABLE.fileNo) qb.addOrderBy('p.fileNo', 'ASC');
  }
}
