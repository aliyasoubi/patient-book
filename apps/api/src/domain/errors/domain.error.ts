import { ErrorCode, ErrorParams } from './error-code';

/**
 * A rule of the domain was broken.
 *
 * Carries a machine-readable {@link ErrorCode} and the values needed to render
 * it, never a translated sentence. The transport layer decides the HTTP status
 * and the client decides the wording — this class knows about neither, which is
 * what keeps the domain free of framework and locale concerns.
 *
 * `message` holds a plain-English developer description. It is for logs and
 * stack traces; it is never what the user reads.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
    developerMessage?: string,
  ) {
    super(developerMessage ?? code);
    this.name = new.target.name;
    // Restore the prototype chain: TypeScript's ES5 target breaks `instanceof`
    // for subclasses of built-ins without this.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A requested aggregate does not exist. */
export class NotFoundError extends DomainError {}

/** The caller's input is structurally or semantically invalid. */
export class InvalidInputError extends DomainError {}

/** The operation would violate a uniqueness or state invariant. */
export class ConflictError extends DomainError {}
