import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../users/user.entity';
import type { AppConfig } from '../../config/configuration';
import { ApplicationModule } from '../../application/application.module';

/** What `jsonwebtoken` accepts for a duration: "30m", "7d", seconds, … */
type ExpiresIn = NonNullable<Parameters<JwtService['sign']>[1]>['expiresIn'];

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ApplicationModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<AppConfig['jwt']>('jwt')!.secret,
        // `expiresIn` is typed as a `ms` duration literal; the value is
        // operator-supplied config, so it is narrowed at the boundary.
        signOptions: {
          expiresIn: config.get<AppConfig['jwt']>('jwt')!
            .expiresIn as ExpiresIn,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
