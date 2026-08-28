import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';

import { User } from '../../users/user.entity';
import type { JwtPayload } from '../dto/auth.dto';
import type { AppConfig } from '../../../config/configuration';
import { AppException } from '../../../application/errors/app.exception';
import { ErrorCode } from '../../../domain';

/** The authenticated principal attached to every request. */
export interface RequestUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<AppConfig['jwt']>('jwt')!.secret,
    });
  }

  /**
   * Re-check the user on every request rather than trusting the token alone —
   * a disabled account or a revoked session must stop working immediately, not
   * when the access token happens to expire.
   */
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw AppException.unauthorized(ErrorCode.SessionRevoked);
    }
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
