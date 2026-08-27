import { ErrorCode, ErrorParams } from '../../domain';

/**
 * The single error shape every endpoint returns.
 *
 * `code` and `params` are what a client renders from; `message` is an English
 * developer description for logs and for anyone reading the API directly. The
 * API stays locale-free — the frontend owns all wording, which is what lets it
 * translate without a server change.
 */
export interface ErrorResponse {
  statusCode: number;
  code: ErrorCode | string;
  /** Interpolation values, e.g. `{ fileNo: '11559' }`. */
  params: ErrorParams;
  /** English, for developers. Never shown to end users. */
  message: string;
  /** Per-field validation failures, keyed by property path. */
  fieldErrors?: Record<string, FieldError[]>;
  path: string;
  timestamp: string;
}

export interface FieldError {
  code: string;
  params: ErrorParams;
}
