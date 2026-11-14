import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ example: 'ChangeMe!2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}

/**
 * The one algorithm tokens are signed with, and the only one accepted back:
 * named on both sides rather than left to the library's defaults.
 */
export const JWT_ALGORITHM = 'HS256';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  /** Matched against the user row to invalidate sessions on password change. */
  tv: number;
}

export interface AuthUserResponse {
  id: string;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
}

export class AuthSession {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  user!: AuthUserResponse;
}

/** Internal token pair; the controller stores refreshToken in an HttpOnly cookie. */
export class AuthTokens extends AuthSession {
  @ApiProperty()
  refreshToken!: string;
}
