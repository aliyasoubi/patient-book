import {
  loosePersianKey,
  MobileNumber,
  NationalId,
  PatientNameMatcher,
} from '../../domain';

/** Why an existing record may be the person being registered. */
export type DuplicateReason = 'nationalId' | 'name' | 'mobile';

/** What the registration form has typed so far, as it arrives. */
export interface DuplicateQuery {
  firstName?: string | null;
  lastName?: string | null;
  fatherName?: string | null;
  nationalId?: string | null;
  mobile?: string | null;
}

/**
 * The query in the forms the database stores: a padded national id, a mobile
 * in `09…` form, and the space-insensitive name key. A value that is not yet
 * a whole identifier — the receptionist is still typing it — is `null`, so a
 * half-typed number never matches the patient whose number it begins.
 */
export interface DuplicateCriteria {
  nationalId: string | null;
  mobile: string | null;
  /** {@link loosePersianKey} of "first last"; only when both are given. */
  name: string | null;
  fatherName: string | null;
}

/** An existing record the registration form should point the user to. */
export interface PossibleDuplicate {
  id: string;
  fileNo: string;
  fullName: string;
  fatherName: string | null;
  /** Archived files count: restoring one beats opening a second. */
  archived: boolean;
  /** Strongest first. */
  reasons: DuplicateReason[];
}

/** The candidate's columns the rules read. */
export interface DuplicateCandidate {
  firstName: string;
  lastName: string;
  fatherName: string | null;
  nationalId: string | null;
  mobile: string | null;
}

export function duplicateCriteria(query: DuplicateQuery): DuplicateCriteria {
  const first = query.firstName?.trim() ?? '';
  const last = query.lastName?.trim() ?? '';
  return {
    nationalId: NationalId.tryCreate(query.nationalId)?.value ?? null,
    mobile: MobileNumber.tryCreate(query.mobile)?.value ?? null,
    name: first && last ? loosePersianKey(`${first} ${last}`) || null : null,
    fatherName: query.fatherName?.trim() || null,
  };
}

export function hasCriteria(c: DuplicateCriteria): boolean {
  return Boolean(c.nationalId || c.mobile || c.name);
}

/**
 * Every reason this record may be the same person, strongest first; empty
 * when it is not a candidate at all.
 *
 * A shared name is set aside when the two records say they are different
 * people: both carry a national id and the ids differ, or both name a father
 * and the fathers differ — two «علی رضایی» with different fathers are the very
 * case the father's name is recorded to tell apart. A shared mobile is kept
 * but ranked last: a parent's number on a child's file is ordinary.
 */
export function duplicateReasons(
  c: DuplicateCriteria,
  p: DuplicateCandidate,
): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  if (c.nationalId && p.nationalId === c.nationalId) reasons.push('nationalId');
  const otherId = Boolean(
    c.nationalId && p.nationalId && p.nationalId !== c.nationalId,
  );
  if (
    c.name &&
    !otherId &&
    loosePersianKey(`${p.firstName} ${p.lastName}`) === c.name &&
    !PatientNameMatcher.namesDiffer(c.fatherName ?? '', p.fatherName ?? '')
  ) {
    reasons.push('name');
  }
  if (c.mobile && p.mobile === c.mobile) reasons.push('mobile');
  return reasons;
}

/** National id outranks everything; then the more reasons, the likelier. */
export function duplicateRank(reasons: readonly DuplicateReason[]): number {
  return (reasons.includes('nationalId') ? 10 : 0) + reasons.length;
}
