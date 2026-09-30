import { ErrorCode, UserRole } from '../../domain';
import { AppException } from '../errors/app.exception';

/** Blank and missing are the same note; so are two spellings of nothing. */
const text = (value: string | null | undefined): string => value?.trim() ?? '';

/**
 * The front desk reads clinical notes — medical history, a patient's notes, a
 * surgery's notes — but does not write them. Forms send every field back, so
 * what is refused is a *change*: a receptionist saving a record with its notes
 * untouched goes through. `undefined` for `role` is the system itself (the
 * reconcile tool, the importer) and is never restricted.
 *
 * `fields` pairs each submitted value with the stored one; a value of
 * `undefined` was not submitted and cannot be a change.
 */
export function assertMayWriteClinicalNotes(
  role: string | undefined,
  fields: ReadonlyArray<
    readonly [submitted: string | null | undefined, stored: string | null]
  >,
): void {
  if (role !== UserRole.Receptionist) return;
  const changed = fields.some(
    ([submitted, stored]) =>
      submitted !== undefined && text(submitted) !== text(stored),
  );
  if (changed) throw AppException.forbidden(ErrorCode.Forbidden);
}
