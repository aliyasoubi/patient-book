import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import type { ErrorParams } from '../../../domain';

/** One field the workbook proposes changing, with what the app currently holds. */
export interface FieldDiff {
  field: string;
  current: string | null;
  proposed: string | null;
}

export interface PatientDiff {
  id: string;
  fileNo: string;
  fullName: string;
  fields: FieldDiff[];
}

export interface CaseDiff {
  id: string;
  registryNo: string;
  recordedName: string;
  fields: FieldDiff[];
}

export interface ReconcilePreviewResult {
  patients: PatientDiff[];
  implants: CaseDiff[];
  ortho: CaseDiff[];
  /** Sheet rows with no matching fileNo/registryNo in the app — counted, not detailed. */
  unmatched: { patients: number; implants: number; ortho: number };
}

/** One approved field change for one patient or registry case. */
export class ApplyFieldDto {
  @ApiProperty()
  @IsString()
  field!: string;

  @ApiProperty({ nullable: true })
  @IsDefined()
  @IsOptional()
  @IsString()
  proposed!: string | null;

  /**
   * The value the preview showed as current. Echoed back so apply can refuse
   * to overwrite an edit made after the preview was taken — `@IsDefined` (not
   * `@IsOptional` alone) so a client cannot skip the check by omitting it,
   * while still allowing an explicit `null` for a field that was empty.
   */
  @ApiProperty({ nullable: true })
  @IsDefined()
  @IsOptional()
  @IsString()
  expectedCurrent!: string | null;
}

/** An entity (patient, implant case, or ortho case) with the changes approved for it. */
export class ApplyEntityDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiProperty({ type: [ApplyFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyFieldDto)
  fields!: ApplyFieldDto[];
}

export class ApplyReconcileDto {
  @ApiProperty({ type: [ApplyEntityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyEntityDto)
  @IsOptional()
  patients?: ApplyEntityDto[];

  @ApiProperty({ type: [ApplyEntityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyEntityDto)
  @IsOptional()
  implants?: ApplyEntityDto[];

  @ApiProperty({ type: [ApplyEntityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyEntityDto)
  @IsOptional()
  ortho?: ApplyEntityDto[];
}

/**
 * Per-row outcome. Failures carry the same stable `code` + `params` vocabulary
 * every other endpoint speaks, so the client renders a real reason — "شماره
 * پرونده تکراری است" — rather than a generic "it didn't work".
 */
export interface ApplyResultRow {
  id: string;
  ok: boolean;
  code?: string;
  params?: ErrorParams;
}

export interface ApplyReconcileResult {
  patients: ApplyResultRow[];
  implants: ApplyResultRow[];
  ortho: ApplyResultRow[];
}
