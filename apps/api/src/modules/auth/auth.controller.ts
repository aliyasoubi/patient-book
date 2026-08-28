import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';
import { AuthSession, ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { Public } from '../../presentation/http/decorators/public.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import type { RequestUser } from './strategies/jwt.strategy';
import type { AppConfig } from '../../config/configuration';
import { AllowPasswordChangePending } from '../../presentation/http/decorators/allow-password-change-pending.decorator';

@ApiTags('auth')
@Controller('auth')
@AllowPasswordChangePending()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  // Password guessing is the realistic attack on a clinic's public URL.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    const { refreshToken, ...session } = await this.auth.login(
      dto.username,
      dto.password,
    );
    this.setRefreshCookie(response, refreshToken);
    return session;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh the session' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    const { refreshToken, ...session } = await this.auth.refresh(
      this.readRefreshCookie(request),
    );
    this.setRefreshCookie(response, refreshToken);
    return session;
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user' })
  me(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }

  @Post('change-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Change password' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(userId, dto);
    this.clearRefreshCookie(response);
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session on every device' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    try {
      await this.auth.logout(this.readRefreshCookie(request));
    } finally {
      // Logout remains effective even when the access token has just expired.
      this.clearRefreshCookie(response);
    }
  }

  private get cookieName(): string {
    return this.config.get<AppConfig['auth']>('auth')!.refreshCookieName;
  }

  private refreshCookieOptions(): CookieOptions {
    const authConfig = this.config.get<AppConfig['auth']>('auth')!;
    return {
      httpOnly: true,
      secure: this.config.get<string>('env') === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: authConfig.refreshCookieMaxAgeMs,
    };
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(this.cookieName, token, this.refreshCookieOptions());
  }

  private clearRefreshCookie(response: Response): void {
    const options = this.refreshCookieOptions();
    delete options.maxAge;
    response.clearCookie(this.cookieName, options);
  }

  private readRefreshCookie(request: Request): string {
    const encodedName = encodeURIComponent(this.cookieName);
    for (const part of (request.headers.cookie ?? '').split(';')) {
      const [name, ...value] = part.trim().split('=');
      if (name === encodedName) return decodeURIComponent(value.join('='));
    }
    return '';
  }
}
