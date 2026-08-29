import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

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
  @IsOptional()
  @IsString()
  proposed!: string | null;
}

/** An entity (patient, implant case, or ortho case) with the field changes approved for it. */
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

export interface ApplyResultRow {
  id: string;
  ok: boolean;
  reason?: string;
}

export interface ApplyReconcileResult {
  patients: ApplyResultRow[];
  implants: ApplyResultRow[];
  ortho: ApplyResultRow[];
}
