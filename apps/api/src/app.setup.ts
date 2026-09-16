import { INestApplication, ValidationPipe } from '@nestjs/common';

import { ValidationException } from './presentation/http/validation.exception';

/**
 * The part of bootstrap that defines how the API behaves — the `/api` prefix
 * and request validation — as opposed to how it is hardened for the network
 * (helmet, CORS, compression, trust proxy), which stays in `main.ts`.
 *
 * Shared with the e2e tests so they exercise the same validation, transforms
 * and error shapes a real client sees; a test app without this pipe would
 * accept bodies production refuses.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Unknown fields are a client bug; failing loudly beats silently dropping
      // a value someone believed they had saved.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Failures leave as codes keyed by field path, never as English prose:
      // the client owns the wording so it can render Persian, or anything else.
      exceptionFactory: (errors) =>
        ValidationException.fromValidationErrors(errors),
    }),
  );
}
