import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { BCRYPT_COST, User } from '../users/user.entity';
import { AuthTokens, ChangePasswordDto, JwtPayload } from './dto/auth.dto';
import type { AppConfig } from '../../config/configuration';
import { AppException } from '../../application/errors/app.exception';
import { ErrorCode } from '../../domain';
import { AuditService } from '../../application/services/audit.service';

/** What `jsonwebtoken` accepts for a duration: "30m", "7d", seconds, … */
type ExpiresIn = NonNullable<Parameters<JwtService['sign']>[1]>['expiresIn'];

/**
 * Compared against when the username is unknown, so that path costs the same
 * ~200 ms as a real comparison. It must be a *valid* hash at the real cost: a
 * malformed one is rejected by bcrypt in microseconds, which would reveal
 * through timing exactly the username existence the constant-message reply
 * is meant to hide.
 */
const UNKNOWN_USER_HASH = bcrypt.hashSync(
  'unknown-user-placeholder',
  BCRYPT_COST,
);

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Verify credentials and mint a token pair.
   *
   * The same message is returned for an unknown username and a wrong password,
   * and the bcrypt comparison runs either way, so the response neither reveals
   * which usernames exist nor leaks it through timing.
   */
  async login(username: string, password: string): Promise<AuthTokens> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.username) = lower(:username)', { username })
      .getOne();

    const ok = await bcrypt.compare(
      password,
      user?.passwordHash ?? UNKNOWN_USER_HASH,
    );

    if (!user || !ok) {
      await this.audit.record({
        userId: user?.id ?? null,
        username,
        action: 'login_failed',
        entity: 'auth',
      });
      throw AppException.unauthorized(ErrorCode.InvalidCredentials);
    }
    if (!user.isActive) {
      throw AppException.forbidden(ErrorCode.AccountDisabled);
    }

    await this.users.manager.transaction(async (manager) => {
      await manager.getRepository(User).update(user.id, {
        lastLoginAt: new Date(),
      });
      await this.audit.recordRequired(
        {
          userId: user.id,
          username: user.username,
          action: 'login',
          entity: 'auth',
          entityId: user.id,
        },
        manager,
      );
    });
    return this.issueTokens(user);
  }

  /** Exchange a refresh token for a new pair. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const jwtConfig = this.config.get<AppConfig['jwt']>('jwt')!;
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: jwtConfig.refreshSecret,
      });
    } catch {
      throw AppException.unauthorized(ErrorCode.SessionExpired);
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw AppException.unauthorized(ErrorCode.SessionRevoked);
    }
    // A password change or a forced logout bumps tokenVersion, retiring every
    // refresh token issued before it.
    if (user.tokenVersion !== payload.tv) {
      throw AppException.unauthorized(ErrorCode.SessionRevoked);
    }
    return this.issueTokens(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :userId', { userId })
      .getOne();
    if (!user) throw AppException.unauthorized(ErrorCode.Unauthorized);

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw AppException.unauthorized(ErrorCode.CurrentPasswordWrong);

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    await this.users.manager.transaction(async (manager) => {
      const users = manager.getRepository(User);
      await users.update(user.id, {
        passwordHash,
        mustChangePassword: false,
      });
      // Atomic increment avoids losing a concurrent logout/deactivation bump.
      await users.increment({ id: user.id }, 'tokenVersion', 1);
      await this.audit.recordRequired(
        {
          userId: user.id,
          username: user.username,
          action: 'update',
          entity: 'user',
          entityId: user.id,
          changes: { passwordChanged: true },
        },
        manager,
      );
    });
  }

  /** Revoke every token represented by a still-valid refresh cookie. */
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;

    const jwtConfig = this.config.get<AppConfig['jwt']>('jwt')!;
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: jwtConfig.refreshSecret,
      });
    } catch {
      // Idempotent logout: an expired/invalid cookie is still cleared by the
      // controller and does not need to become a user-visible error.
      return;
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (user?.isActive && user.tokenVersion === payload.tv) {
      await this.users.increment({ id: user.id }, 'tokenVersion', 1);
    }
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const jwtConfig = this.config.get<AppConfig['jwt']>('jwt')!;
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tv: user.tokenVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: jwtConfig.secret,
        expiresIn: jwtConfig.expiresIn as ExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret: jwtConfig.refreshSecret,
        expiresIn: jwtConfig.refreshExpiresIn as ExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
