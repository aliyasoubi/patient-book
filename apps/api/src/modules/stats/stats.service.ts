import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Patient } from '../patients/patient.entity';
import { SurgeryQueueItem } from '../surgery/surgery-queue-item.entity';
import { followUpState, followUpWindow } from '../surgery/follow-up';
import { JalaliDate } from '../../domain';

/** Age buckets the dashboard groups patients into. */
export type AgeBandKey =
  'under_13' | '13_19' | '20_29' | '30_39' | '40_49' | '50_64' | '65_plus';

export interface DashboardStats {
  totals: {
    patients: number;
    archived: number;
    implantCases: number;
    orthoCases: number;
    /** Open follow-ups in the coming seven days — who to call this week. */
    followUpsThisWeek: number;
    /** Follow-ups whose month has passed without being marked done. */
    followUpsOverdue: number;
    needsReview: number;
  };
  gender: Array<{ key: string; count: number }>;
  topTreatments: Array<{
    code: string;
    nameFa: string;
    icon: string;
    color: string;
    count: number;
  }>;
  topReferrals: Array<{
    id: string;
    name: string;
    kind: string;
    count: number;
  }>;
  /** New patients per Jalali month over the last two years. */
  newPatientsByMonth: Array<{ month: string; count: number }>;
  /** `band` is a stable key such as `30_39`; the client renders the label. */
  ageBands: Array<{ band: AgeBandKey; count: number }>;
  recentlyActive: number;
  inactiveOverYear: number;
}

/**
 * Count dates per Jalali month, oldest first. `yyyy/MM` keys sort as text,
 * and a date the calendar cannot place is skipped rather than invented.
 */
export function countByJalaliMonth(
  dates: ReadonlyArray<Date | string>,
): Array<{ month: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of dates) {
    const month = JalaliDate.fromDate(new Date(value), 'month')?.format();
    if (!month) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(SurgeryQueueItem)
    private readonly surgery: Repository<SurgeryQueueItem>,
  ) {}

  async dashboard(): Promise<DashboardStats> {
    const q = <T>(sql: string, params?: unknown[]): Promise<T[]> =>
      this.patients.query<T[]>(sql, params);
    const week = followUpWindow('week');
    const overdue = followUpWindow('overdue');

    const [
      totals,
      gender,
      topTreatments,
      topReferrals,
      monthly,
      ageBands,
      activity,
    ] = await Promise.all([
      q<Record<string, string>>(
        `
        SELECT
          (SELECT count(*) FROM patients WHERE "deletedAt" IS NULL)                    AS patients,
          (SELECT count(*) FROM patients WHERE "deletedAt" IS NOT NULL)                AS archived,
          (SELECT count(*) FROM implant_cases WHERE "deletedAt" IS NULL)                 AS "implantCases",
          (SELECT count(*) FROM ortho_cases WHERE "deletedAt" IS NULL)                   AS "orthoCases",
          -- Windows come from followUpWindow(), on the Jalali calendar, so
          -- these agree with the list's own filters to the day.
          (SELECT count(*) FROM surgery_queue
            WHERE "deletedAt" IS NULL AND "followUpDoneAt" IS NULL
              AND "followUpDate" BETWEEN $1 AND $2)                                      AS "followUpsThisWeek",
          (SELECT count(*) FROM surgery_queue
            WHERE "deletedAt" IS NULL AND "followUpDoneAt" IS NULL
              AND "followUpDate" <= $3)                                                  AS "followUpsOverdue",
          (SELECT count(*) FROM patients
            WHERE "deletedAt" IS NULL AND jsonb_array_length("dataIssues") > 0)         AS "needsReview"
      `,
        [week.from, week.to, overdue.to],
      ),
      q<{ key: string; count: string }>(`
        SELECT gender AS key, count(*)::text AS count FROM patients
        WHERE "deletedAt" IS NULL GROUP BY gender ORDER BY count(*) DESC`),
      q<Record<string, string>>(`
        SELECT t.code, t."nameFa", t.icon, t.color, count(*)::text AS count
        FROM patient_treatments pt
        JOIN treatment_types t ON t.id = pt."treatmentTypeId"
        JOIN patients p ON p.id = pt."patientId" AND p."deletedAt" IS NULL
        GROUP BY t.code, t."nameFa", t.icon, t.color, t."sortOrder"
        ORDER BY count(*) DESC`),
      q<Record<string, string>>(`
        SELECT rs.id, rs.name, rs.kind, count(*)::text AS count
        FROM patients p JOIN referral_sources rs ON rs.id = p."referralSourceId"
        WHERE p."deletedAt" IS NULL
        GROUP BY rs.id, rs.name, rs.kind ORDER BY count(*) DESC LIMIT 10`),
      // The dates come out raw and are bucketed by Jalali month in
      // {@link countByJalaliMonth}. Grouping in SQL would mean Gregorian
      // months — Postgres has no Jalali date_trunc — and a Gregorian month
      // straddles two Jalali ones, so "September" relabelled as Shahrivar
      // would carry a week of Mehr's patients. Two years of first visits is
      // a few hundred rows; counting them here is cheaper than being wrong.
      q<{ date: Date | string }>(`
        SELECT "firstVisitAt" AS date
        FROM patients
        WHERE "deletedAt" IS NULL AND "firstVisitAt" IS NOT NULL
          AND "firstVisitAt" >= (now() - interval '24 months')`),
      q<{ band: string; count: string }>(`
        -- Stable band keys, not labels: the client owns the wording, and the
        -- bounds travel with them so it can format them for any locale.
        SELECT CASE
                 WHEN age < 13  THEN 'under_13'
                 WHEN age < 20  THEN '13_19'
                 WHEN age < 30  THEN '20_29'
                 WHEN age < 40  THEN '30_39'
                 WHEN age < 50  THEN '40_49'
                 WHEN age < 65  THEN '50_64'
                 ELSE '65_plus'
               END AS band,
               count(*)::text AS count
        FROM (
          SELECT date_part('year', age("birthDate"))::int AS age
          FROM patients WHERE "deletedAt" IS NULL AND "birthDate" IS NOT NULL
        ) a
        WHERE age BETWEEN 0 AND 120
        GROUP BY band
        ORDER BY min(age)`),
      q<Record<string, string>>(`
        SELECT
          count(*) FILTER (WHERE "lastVisitAt" >= now() - interval '6 months')::text  AS recent,
          count(*) FILTER (WHERE "lastVisitAt" <  now() - interval '12 months')::text AS inactive
        FROM patients WHERE "deletedAt" IS NULL`),
    ]);

    const t = totals[0] ?? {};
    return {
      totals: {
        patients: Number(t.patients ?? 0),
        archived: Number(t.archived ?? 0),
        implantCases: Number(t.implantCases ?? 0),
        orthoCases: Number(t.orthoCases ?? 0),
        followUpsThisWeek: Number(t.followUpsThisWeek ?? 0),
        followUpsOverdue: Number(t.followUpsOverdue ?? 0),
        needsReview: Number(t.needsReview ?? 0),
      },
      gender: gender.map((g) => ({ key: g.key, count: Number(g.count) })),
      topTreatments: topTreatments.map((r) => ({
        code: r.code,
        nameFa: r.nameFa,
        icon: r.icon,
        color: r.color,
        count: Number(r.count),
      })),
      topReferrals: topReferrals.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        count: Number(r.count),
      })),
      newPatientsByMonth: countByJalaliMonth(monthly.map((m) => m.date)),
      ageBands: ageBands.map((a) => ({
        band: a.band as AgeBandKey,
        count: Number(a.count),
      })),
      recentlyActive: Number(activity[0]?.recent ?? 0),
      inactiveOverYear: Number(activity[0]?.inactive ?? 0),
    };
  }

  /**
   * Who to call in the coming week, for the dashboard panel — exactly the
   * rows the `followUpsThisWeek` total counts, soonest first, so the panel
   * and the tile above it can never disagree. Missed ones have their own
   * tile and list.
   */
  async followUpsThisWeek(limit = 8): Promise<unknown[]> {
    const { from, to } = followUpWindow('week');
    const rows = await this.surgery
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.implantCase', 'ic')
      .leftJoinAndSelect('ic.patient', 'p')
      .where('s."followUpDoneAt" IS NULL')
      .andWhere('s."followUpDate" BETWEEN :from AND :to', { from, to })
      .orderBy('s.followUpDate', 'ASC')
      .limit(limit)
      .getMany();

    return rows.map((s) => ({
      id: s.id,
      recordedName: s.recordedName,
      implantRegistryNo: s.implantRegistryNo,
      patientId: s.implantCase?.patient?.id ?? null,
      mobile: s.implantCase?.patient?.mobile ?? null,
      followUpDate: s.followUpDate
        ? (JalaliDate.fromDate(new Date(s.followUpDate))?.format() ?? null)
        : null,
      followUpState: followUpState(s),
      hasNameMismatch: s.hasNameMismatch,
    }));
  }
}
