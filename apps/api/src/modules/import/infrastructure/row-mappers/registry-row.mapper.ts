import { SheetRow } from '../../../../application/ports/workbook.port';
import {
  LandlineNumber,
  MobileNumber,
  PatientNameMatcher,
  searchKey,
} from '../../../../domain';

export interface MappedRegistryRow {
  registryNo: string;
  recordedName: string;
  patientId: string | null;
  matchMethod: 'exact' | 'fuzzy' | 'manual' | 'unmatched';
  mobile: string | null;
  homePhone: string | null;
  searchText: string;
}

/** Column positions shared by the implant and orthodontic sheets. */
export const REGISTRY_COLUMN = {
  registryNo: 1,
  fullName: 2,
  mobile: 3,
  homePhone: 4,
} as const;

/**
 * Maps a row of the implant or orthodontic register.
 *
 * Both books number themselves independently of the main patient file, and
 * those numbers collide with main file numbers while describing different
 * people. The register's number is therefore kept as its own identifier and the
 * link to a patient is resolved from the **name**, never the number.
 */
export class RegistryRowMapper {
  constructor(private readonly matcher: PatientNameMatcher) {}

  map(row: SheetRow): MappedRegistryRow | null {
    const registryNo = row.cell(REGISTRY_COLUMN.registryNo);
    if (!registryNo) return null;

    const recordedName = row.cell(REGISTRY_COLUMN.fullName);
    const mobile = MobileNumber.normalise(row.cell(REGISTRY_COLUMN.mobile));
    const homePhone = LandlineNumber.normalise(row.cell(REGISTRY_COLUMN.homePhone));
    const match = this.matcher.match(recordedName);

    return {
      registryNo,
      recordedName,
      patientId: match.patientId,
      matchMethod: match.method,
      mobile,
      homePhone,
      searchText: searchKey([registryNo, recordedName, mobile, homePhone].filter(Boolean).join(' ')),
    };
  }
}
