import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';

import { AppException } from '../../application/errors/app.exception';
import {
  ErrorCode,
  JalaliDate,
  MobileNumber,
  searchKey,
  toLatinDigits,
} from '../../domain';
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

/** Which identifier a search matched exactly. */
export type IdentifierMatch = 'fileNo' | 'nationalId' | 'mobile';

/** A search typed as a number, in the forms the database holds. */
export interface IdentifierQuery {
  /** What to look for in `searchText`; also compared with the file number. */
  key: string;
  nationalId: string | null;
  mobile: string | null;
}

/** Digits plus the punctuation phone numbers are written with. */
const NUMBER_SHAPED = /^\+?[\d\s\-().]+$/;

/**
 * Reads a query typed as a number — a file number, a national id, a mobile
 * written any of the ways the practice writes them (`+98 912 …`,
 * `0912-123-4567`, Persian digits) — or `null` for anything with letters.
 *
 * The search key is the bare digits, so `007-898-0501` finds 0078980501 and
 * `0912 123 4567` is one number rather than three fragments. Only a mobile
 * written with its country code is rewritten to the stored `09…` form: its
 * digits are not part of that form, so they could never match it.
 */
export function identifierQuery(q: string | undefined): IdentifierQuery | null {
  const text = toLatinDigits(q ?? '').trim();
  if (!NUMBER_SHAPED.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  const mobile = MobileNumber.tryCreate(text)?.value ?? null;
  return {
    key: mobile && !mobile.includes(digits) ? mobile : digits,
    nationalId: digits.length === 10 ? digits : null,
    mobile,
  };
}

/** The identifier `p` shares exactly with the query, if any. */
export function exactIdentifier(
  ids: IdentifierQuery | null,
  p: Pick<Patient, 'fileNo' | 'nationalId' | 'mobile'>,
): IdentifierMatch | null {
  if (!ids) return null;
  if (p.fileNo === ids.key) return 'fileNo';
  if (ids.nationalId && p.nationalId === ids.nationalId) return 'nationalId';
  if (ids.mobile && p.mobile === ids.mobile) return 'mobile';
  return null;
}

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
   * The search bar's type-ahead: the same matching and ranking as the list,
   * cut to the few best rows. Returns `null` for a query too short to search.
   */
  suggest(q: string, limit: number): SelectQueryBuilder<Patient> | null {
    const key = searchKey(q);
    if (key.length < 2) return null;

    // `nationalId` is read to tell which identifier matched, not returned.
    const qb = this.patients
      .createQueryBuilder('p')
      .select([
        'p.id',
        'p.fileNo',
        'p.firstName',
        'p.lastName',
        'p.mobile',
        'p.nationalId',
      ]);
    this.applySearch(qb, key);
    this.orderByRelevance(qb);
    return qb.limit(limit);
  }

  /**
   * Free-text search over the folded `searchText` column.
   *
   * The query is folded exactly the way the column was, so a receptionist
   * typing Arabic ي or Persian digits matches rows stored in the Persian forms.
   * Every word must match, in any order and as any fragment, which is what
   * makes "محمد مرادی" find محمدرضا مرادی and narrows a two-word query rather
   * than widening it. A number is read as one, see {@link identifierQuery}.
   */
  private applySearch(qb: SelectQueryBuilder<Patient>, q?: string): void {
    const ids = identifierQuery(q);
    const key = ids?.key ?? searchKey(q);
    if (!key) return;

    const words = key.split(' ').filter(Boolean);
    qb.andWhere(
      new Brackets((b) => {
        words.forEach((word, i) => {
          b.andWhere(`p."searchText" LIKE :w${i}`, { [`w${i}`]: `%${word}%` });
        });
      }),
    );

    // How many query words begin a word of the patient's own name. This is
    // what ranks the people *called* مرادی above those who merely live on a
    // street of that name — `searchText` also holds addresses and occupation,
    // so its similarity alone buries a patient with a long address.
    const nameHits = words
      .map((_, i) => `((' ' || p."nameKey") LIKE :n${i})::int`)
      .join(' + ');
    words.forEach((word, i) => qb.setParameter(`n${i}`, `% ${word}%`));

    // A number typed whole — file, national id, mobile — names one record.
    // `coalesce`: a NULL column makes its comparison NULL, and DESC sorts
    // NULLs first, which would float every patient without one to the top.
    const exact = [`p."fileNo" = :simKey`];
    if (ids?.nationalId) {
      exact.push(`p."nationalId" = :exactNid`);
      qb.setParameter('exactNid', ids.nationalId);
    }
    if (ids?.mobile) {
      exact.push(`p."mobile" = :exactMobile`);
      qb.setParameter('exactMobile', ids.mobile);
    }

    // Ranking terms are exposed as select aliases: TypeORM's `orderBy` reads a
    // raw expression's leading token as a table alias and rejects it.
    qb.addSelect(`coalesce(${exact.join(' OR ')}, false)`, 'exact_id')
      .addSelect(`(${nameHits})`, 'name_hits')
      .addSelect(`similarity(p."nameKey", :simKey)`, 'name_sim')
      .addSelect(`similarity(p."searchText", :simKey)`, 'sim')
      .setParameter('simKey', key);
  }

  /**
   * An exact identifier outranks everything, then the patient whose name
   * matches the most query words, then the closest name, and only then the
   * rest of the record.
   */
  private orderByRelevance(qb: SelectQueryBuilder<Patient>): void {
    qb.orderBy('exact_id', 'DESC')
      .addOrderBy('name_hits', 'DESC')
      .addOrderBy('name_sim', 'DESC')
      .addOrderBy('sim', 'DESC')
      .addOrderBy('p.lastName', 'ASC');
  }

  private applyFilters(
    qb: SelectQueryBuilder<Patient>,
    dto: QueryPatientsDto,
  ): void {
    if (dto.gender) qb.andWhere('p.gender = :gender', { gender: dto.gender });
    if (dto.education)
      qb.andWhere('p.education = :education', { education: dto.education });
    if (dto.referralSourceId) {
      qb.andWhere('p."referralSourceId" = :rsid', {
        rsid: dto.referralSourceId,
      });
    }
    if (dto.hasIssues) qb.andWhere(`jsonb_array_length(p."dataIssues") > 0`);
    if (dto.hasMedicalHistory) {
      qb.andWhere(
        `p."medicalHistory" IS NOT NULL AND btrim(p."medicalHistory") <> ''`,
      );
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
      qb.andWhere(`p."lastVisitAt" ${op} :${key}`, {
        [key]: JalaliDate.parse(raw).toIsoDate(),
      });
    }
  }

  private applySort(
    qb: SelectQueryBuilder<Patient>,
    dto: QueryPatientsDto,
  ): void {
    if (searchKey(dto.q) && !dto.sortBy) {
      // Relevance only means something when there is a query.
      this.orderByRelevance(qb);
      return;
    }

    // `hasOwn`, not a plain lookup: every object literal inherits
    // `constructor`, `toString` and friends, so `?sortBy=constructor` would
    // otherwise pass this allow-list and hand a function to `orderBy`.
    const requested = dto.sortBy ?? 'lastName';
    const column = Object.hasOwn(SORTABLE, requested)
      ? SORTABLE[requested]
      : undefined;
    if (!column) {
      throw AppException.badRequest(ErrorCode.SortFieldUnsupported, {
        field: requested,
      });
    }
    if (column === SORTABLE.fileNo) {
      // File numbers are digit strings; sorting them as text puts "10"
      // before "2" in both directions. Cast to a number instead, the same
      // way the registry lists order their own `registryNo`. A legacy value
      // with no digits at all (`nextFileNo` already has to allow for these)
      // has no numeric key and sorts last regardless of direction.
      qb.addSelect(
        `NULLIF(regexp_replace(p."fileNo", '\\D', '', 'g'), '')::bigint`,
        'file_num',
      ).orderBy('file_num', dto.sortDir, 'NULLS LAST');
    } else {
      qb.orderBy(column, dto.sortDir, 'NULLS LAST');
      qb.addOrderBy('p.fileNo', 'ASC');
    }
  }
}
