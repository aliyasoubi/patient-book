import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBackupDirDto {
  /**
   * An absolute directory that already exists and is writable. Pointing this at
   * a cloud-synced folder is a supported setup: dumps are AES-256 encrypted
   * before they are written, so the sync provider never holds readable records.
   */
  @ApiProperty({ example: '/Volumes/PracticeBackup/PatientBook' })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  dir!: string;
}
