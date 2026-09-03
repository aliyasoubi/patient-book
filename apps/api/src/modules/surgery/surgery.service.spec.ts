import { describe, expect, it } from '@jest/globals';
import type { Repository } from 'typeorm';

import { SurgeryService } from './surgery.service';
import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import type { UpsertSurgeryDto } from './dto/surgery.dto';
import type { AuditService } from '../../application/services/audit.service';
import { AbutmentType, SurgeryStatus } from '../../domain';

interface SurgeryWriteHelpers {
  assign(
    item: SurgeryQueueItem,
    dto: Partial<UpsertSurgeryDto>,
    implants?: Repository<ImplantCase>,
  ): Promise<void>;
}

const row = (): SurgeryQueueItem =>
  Object.assign(new SurgeryQueueItem(), {
    id: 'row-1',
    implantCaseId: null,
    implantRegistryNo: null,
    recordedName: 'مریم کریمی',
    hasNameMismatch: false,
    toothPosition: '',
    implantBrand: null,
    abutmentType: AbutmentType.Unknown,
    abutmentRaw: null,
    prosthesisDue: null,
    status: SurgeryStatus.Scheduled,
    notes: null,
  });

describe('SurgeryService.assign — implant brand precedence', () => {
  const service = new SurgeryService(
    {} as Repository<SurgeryQueueItem>,
    {} as Repository<ImplantCase>,
    {} as AuditService,
  );
  const helpers = service as unknown as SurgeryWriteHelpers;

  it('an explicit brand wins even when the tooth-position text implies a different one', async () => {
    const item = row();

    await helpers.assign(item, {
      toothPosition: 'زیمر، ۶ راست بالا',
      implantBrand: 'TRI',
    });

    expect(item.implantBrand).toBe('TRI');
  });

  it('editing only the tooth position never erases an already-explicit brand', async () => {
    const item = row();
    item.implantBrand = 'TRI';

    await helpers.assign(item, { toothPosition: '۷ چپ پایین' });

    expect(item.implantBrand).toBe('TRI');
  });

  it('still auto-detects the brand from tooth-position text when none has been set explicitly', async () => {
    const item = row();

    await helpers.assign(item, { toothPosition: 'دنتیوم، ۵ راست بالا' });

    expect(item.implantBrand).toBe('دنتیوم');
  });

  it('an explicit null clears a previously recorded brand', async () => {
    const item = row();
    item.implantBrand = 'TRI';

    await helpers.assign(item, { implantBrand: null });

    expect(item.implantBrand).toBeNull();
  });
});
