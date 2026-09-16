import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';

import { AppException } from '../../../application/errors/app.exception';
import { DomainError, ErrorCode, ErrorParams } from '../../../domain';
import { ErrorResponse, FieldError } from '../error-response';
import { ValidationException } from '../validation.exception';

/** Postgres SQLSTATE codes worth translating rather than leaking. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Which domain rule each unique index enforces. The services check these
 * before writing, but two requests can pass that check together and let the
 * index catch the second; naming the index here keeps the client's error the
 * same either way instead of a generic "validation failed". Names are the ones
 * the migrations create — the entities' own `@Index` decorators are unnamed.
 */
const UNIQUE_INDEX_CODES: Readonly<Record<string, ErrorCode>> = {
  idx_patients_fileno: ErrorCode.FileNumberTaken,
  idx_implant_registry: ErrorCode.RegistryNumberTaken,
  idx_ortho_registry: ErrorCode.RegistryNumberTaken,
  idx_users_username: ErrorCode.UsernameTaken,
  IDX_users_username_lower_unique: ErrorCode.UsernameTaken,
};

/** The fields node-postgres attaches to a constraint failure. */
interface PgDriverError extends Error {
  code?: string;
  constraint?: string;
}

/**
 * Normalises every failure into one {@link ErrorResponse}.
 *
 * Two rules hold here. Nothing user-facing is written in a natural language —
 * clients get a code and render their own wording. And no driver-level detail
 * escapes: a raw Postgres message would leak column names to the browser, so
 * database errors are mapped to codes and the original is logged instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const resolved = this.resolve(exception);

    // `statusCode` is a plain number on the wire; compare it as one.
    const serverError: number = HttpStatus.INTERNAL_SERVER_ERROR;
    if (resolved.statusCode >= serverError) {
      // The response body deliberately carries no detail, so this is the only
      // record of what actually failed — keep the value itself when a thrown
      // non-Error leaves us no stack to print.
      this.logger.error(
        `${request.method} ${request.url} -> ${resolved.statusCode} ${resolved.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = {
      ...resolved,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(resolved.statusCode).json(body);
  }

  private resolve(
    exception: unknown,
  ): Omit<ErrorResponse, 'path' | 'timestamp'> {
    if (exception instanceof ValidationException) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.ValidationFailed,
        params: {},
        message: 'Request validation failed',
        fieldErrors: exception.fieldErrors,
      };
    }

    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        params: exception.params,
        message: exception.message,
      };
    }

    // A domain rule that reached the transport layer unwrapped.
    if (exception instanceof DomainError) {
      const lifted = AppException.fromDomain(exception);
      return {
        statusCode: lifted.getStatus(),
        code: lifted.code,
        params: lifted.params,
        message: exception.message,
      };
    }

    if (exception instanceof QueryFailedError) {
      return this.fromDatabase(exception as QueryFailedError<PgDriverError>);
    }

    if (exception instanceof HttpException) {
      return this.fromHttp(exception);
    }

    // Nothing recognised. An unmapped message is exactly the kind that carries
    // a filesystem path or a driver string, so it is logged in `catch` and a
    // fixed one is returned — same rule the database branch above follows.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.Unexpected,
      params: {},
      message: 'Unexpected error',
    };
  }

  private fromDatabase(
    exception: QueryFailedError<PgDriverError>,
  ): Omit<ErrorResponse, 'path' | 'timestamp'> {
    const driver = exception.driverError;
    const driverCode = driver.code;

    if (driverCode === PG_UNIQUE_VIOLATION) {
      const known = driver.constraint
        ? UNIQUE_INDEX_CODES[driver.constraint]
        : undefined;
      return {
        statusCode: HttpStatus.CONFLICT,
        code: known ?? ErrorCode.ValidationFailed,
        params: {},
        message: 'Unique constraint violated',
      };
    }
    if (driverCode === PG_FOREIGN_KEY_VIOLATION) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.ValidationFailed,
        params: {},
        message: 'Referenced record is still in use',
      };
    }

    this.logger.error(`Database error ${driverCode}: ${exception.message}`);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.Unexpected,
      params: {},
      message: 'Database error',
    };
  }

  /**
   * Framework-raised HttpExceptions — 401 from the auth guard, 429 from the
   * throttler, 404 from an unmatched route. Mapped onto domain codes so the
   * client has one vocabulary to render from.
   */
  private fromHttp(
    exception: HttpException,
  ): Omit<ErrorResponse, 'path' | 'timestamp'> {
    const status = exception.getStatus();
    const byStatus: Partial<Record<number, ErrorCode>> = {
      [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthorized,
      [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
      [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RateLimited,
      [HttpStatus.BAD_REQUEST]: ErrorCode.ValidationFailed,
    };

    const payload = exception.getResponse();
    const params: ErrorParams = {};
    let message = exception.message;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload
    ) {
      const raw = (payload as { message?: string | string[] }).message;
      message = Array.isArray(raw) ? raw.join('; ') : (raw ?? message);
    }

    return {
      statusCode: status,
      code: byStatus[status] ?? ErrorCode.Unexpected,
      params,
      message,
    };
  }
}

export type { FieldError };
