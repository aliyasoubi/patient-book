import { ErrorCode, ErrorParams } from '../errors/error-code';

/**
 * Something about a record that a human should look at.
 *
 * Carries a code and its parameters, never a sentence: these are rendered in
 * the UI, and the practice reads Persian while the API stays locale-free. The
 * offending value is kept verbatim so nothing the practice wrote down is lost.
 */
export interface DataIssue {
  /** Property the issue concerns, e.g. `birthDate`. */
  readonly field: string;
  readonly code: ErrorCode;
  readonly params: ErrorParams;
  /** Exactly what the source said. */
  readonly rawValue?: string;
  readonly severity: IssueSeverity;
}

export type IssueSeverity = 'warning' | 'error';

export function dataIssue(
  field: string,
  code: ErrorCode,
  params: ErrorParams = {},
  rawValue?: string,
  severity: IssueSeverity = 'warning',
): DataIssue {
  return { field, code, params, rawValue, severity };
}
