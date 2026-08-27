import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import {
  IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';
import { UserRole } from '../../../domain';

export class CreateUserDto {
  @ApiProperty({ example: 'reception1' })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,64}$/)
  username!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'زهرا محمدی' })
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

/** Password is set through the dedicated reset endpoint, not a general update. */
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}
