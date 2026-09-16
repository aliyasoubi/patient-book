import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const port = config.get<number>('port')!;
  const corsOrigin = config.get<string[]>('corsOrigin')!;
  const isProd = config.get<string>('env') === 'production';
  const trustProxy = config.get<number>('trustProxy')!;

  // Before anything that reads an address: the throttler and the audit trail
  // both take `req.ip`, and behind nginx that is the proxy until this is set.
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  configureApp(app);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.enableCors({ origin: corsOrigin, credentials: true });

  if (!isProd) {
    const swagger = new DocumentBuilder()
      .setTitle('Dentixo API')
      .setDescription(
        'API for a dental practice patient register. Errors return a stable ' +
          "`code` plus `params`; all wording is the client's responsibility.",
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swagger),
    );
  }

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/api`);
  if (!isProd) logger.log(`Swagger at http://localhost:${port}/api/docs`);
}

void bootstrap();
