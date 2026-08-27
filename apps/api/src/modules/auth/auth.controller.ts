import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { AuthTokens, ChangePasswordDto, LoginDto, RefreshDto } from './dto/auth.dto';
import { Public } from '../../presentation/http/decorators/public.decorator';
import { CurrentUser } from '../../presentation/http/decorators/current-user.decorator';
import type { RequestUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  // Password guessing is the realistic attack on a clinic's public URL.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in' })
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto.username, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh the session' })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user' })
  me(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }

  @Post('change-password')
  @HttpCode(204)
  @ApiOperation({ summary: 'Change password' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.auth.changePassword(userId, dto);
  }
}
