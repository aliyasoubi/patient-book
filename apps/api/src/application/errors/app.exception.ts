import { HttpException, HttpStatus } from '@nestjs/common';
import { DomainError, ErrorCode, ErrorParams } from '../../domain';

/**
 * The transport-facing form of a failure.
 *
 * The domain raises {@link DomainError}, which knows a code and nothing about
 * HTTP. This class is the single place that decides which status each code
 * deserves, keeping that policy out of both the domain and the controllers.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    readonly params: ErrorParams = {},
    developerMessage?: string,
  ) {
    super({ code, params, message: developerMessage ?? code }, status);
  }

  static notFound(code: ErrorCode, params: ErrorParams = {}): AppException {
    return new AppException(code, HttpStatus.NOT_FOUND, params);
  }

  static conflict(code: ErrorCode, params: ErrorParams = {}): AppException {
    return new AppException(code, HttpStatus.CONFLICT, params);
  }

  static badRequest(code: ErrorCode, params: ErrorParams = {}): AppException {
    return new AppException(code, HttpStatus.BAD_REQUEST, params);
  }

  static unauthorized(code: ErrorCode, params: ErrorParams = {}): AppException {
    return new AppException(code, HttpStatus.UNAUTHORIZED, params);
  }

  static forbidden(code: ErrorCode, params: ErrorParams = {}): AppException {
    return new AppException(code, HttpStatus.FORBIDDEN, params);
  }

  /**
   * Lift a domain error into transport terms. The mapping lives here so a
   * domain rule can be added without any knowledge of status codes.
   */
  static fromDomain(error: DomainError): AppException {
    return new AppException(
      error.code,
      DOMAIN_ERROR_STATUS[error.code] ?? HttpStatus.BAD_REQUEST,
      error.params,
      error.message,
    );
  }
}

/** Status for each code. Anything unlisted is a client-input problem: 400. */
const DOMAIN_ERROR_STATUS: Partial<Record<ErrorCode, HttpStatus>> = {
  [ErrorCode.Unexpected]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.NotFound]: HttpStatus.NOT_FOUND,
  [ErrorCode.PatientNotFound]: HttpStatus.NOT_FOUND,
  [ErrorCode.RegistryCaseNotFound]: HttpStatus.NOT_FOUND,
  [ErrorCode.SurgeryItemNotFound]: HttpStatus.NOT_FOUND,
  [ErrorCode.Forbidden]: HttpStatus.FORBIDDEN,
  [ErrorCode.CannotDisableSelf]: HttpStatus.FORBIDDEN,
  [ErrorCode.CannotDemoteSelf]: HttpStatus.FORBIDDEN,
  [ErrorCode.CannotDeleteSelf]: HttpStatus.FORBIDDEN,
  [ErrorCode.Unauthorized]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.InvalidCredentials]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.SessionExpired]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.SessionRevoked]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.CurrentPasswordWrong]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.AccountDisabled]: HttpStatus.FORBIDDEN,
  [ErrorCode.FileNumberTaken]: HttpStatus.CONFLICT,
  [ErrorCode.RegistryNumberTaken]: HttpStatus.CONFLICT,
  [ErrorCode.UsernameTaken]: HttpStatus.CONFLICT,
  [ErrorCode.RateLimited]: HttpStatus.TOO_MANY_REQUESTS,
};
