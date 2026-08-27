import { ValidationError } from 'class-validator';
import type { ErrorParams } from '../../domain';
import type { FieldError } from './error-response';

/**
 * Carries per-field validation failures as codes rather than sentences.
 *
 * class-validator produces English prose by default. Passing that to the user
 * would either ship an untranslated string or force the API to pick a language.
 * Instead each failure is reduced to its constraint name — `isNotEmpty`,
 * `maxLength`, `matches` — optionally overridden by a `context.code`, together
 * with the constraint's arguments so the client can interpolate.
 */
export class ValidationException extends Error {
  constructor(readonly fieldErrors: Record<string, FieldError[]>) {
    super('Request validation failed');
    this.name = 'ValidationException';
    Object.setPrototypeOf(this, ValidationException.prototype);
  }

  /** Build from class-validator's tree, flattening nested property paths. */
  static fromValidationErrors(errors: ValidationError[]): ValidationException {
    const fieldErrors: Record<string, FieldError[]> = {};

    const walk = (nodes: ValidationError[], prefix: string): void => {
      for (const node of nodes) {
        const path = prefix ? `${prefix}.${node.property}` : node.property;

        if (node.constraints) {
          const codes: FieldError[] = Object.keys(node.constraints).map((constraint) => ({
            // A decorator may pin an explicit domain code via its `context`;
            // otherwise the constraint name is a perfectly good stable key.
            code: ValidationException.codeFor(node, constraint),
            params: ValidationException.paramsFor(node, constraint),
          }));
          fieldErrors[path] = [...(fieldErrors[path] ?? []), ...codes];
        }

        if (node.children?.length) walk(node.children, path);
      }
    };

    walk(errors, '');
    return new ValidationException(fieldErrors);
  }

  private static codeFor(node: ValidationError, constraint: string): string {
    const context = node.contexts?.[constraint] as { code?: string } | undefined;
    return context?.code ?? constraint;
  }

  private static paramsFor(node: ValidationError, constraint: string): ErrorParams {
    const context = node.contexts?.[constraint] as
      | { params?: Record<string, string | number> }
      | undefined;
    return context?.params ?? {};
  }
}
