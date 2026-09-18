import { describe, expect, it } from '@jest/globals';
import type { Repository } from 'typeorm';

import { SurgeryService } from './surgery.service';
import { followUpState } from './follow-up';
import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import type { UpsertSurgeryDto } from './dto/surgery.dto';
import type { AuditService } from '../../application/services/audit.service';
import { AbutmentType, JalaliDate, SurgeryStatus } from '../../domain';

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

describe('SurgeryService.assign — follow-up date', () => {
  const service = new SurgeryService(
    {} as Repository<SurgeryQueueItem>,
    {} as Repository<ImplantCase>,
    {} as AuditService,
  );
  const helpers = service as unknown as SurgeryWriteHelpers;
  const jalali = (d: Date | null): string | null =>
    d ? (JalaliDate.fromDate(d)?.format() ?? null) : null;

  it('resolves the chosen months on the Jalali calendar, from the surgery date', async () => {
    const item = row();

    await helpers.assign(item, {
      surgeryDate: '1405/06/27',
      followUpMonths: 3,
    });

    expect(jalali(item.followUpDate)).toBe('1405/09/27');
  });

  it('clamps to the shorter month rather than spilling into the next', async () => {
    // Shahrivar has 31 days; Mehr has 30. The 31st + one month is 30 Mehr,
    // not 1 Aban — the same rule a paper diary follows.
    const item = row();

    await helpers.assign(item, {
      surgeryDate: '1405/06/31',
      followUpMonths: 1,
    });

    expect(jalali(item.followUpDate)).toBe('1405/07/30');
  });

  it('moves when the surgery date moves, and clears when either input is gone', async () => {
    const item = row();
    await helpers.assign(item, {
      surgeryDate: '1405/06/27',
      followUpMonths: 2,
    });

    await helpers.assign(item, { surgeryDate: '1405/07/01' });
    expect(jalali(item.followUpDate)).toBe('1405/09/01');

    await helpers.assign(item, { followUpMonths: null });
    expect(item.followUpDate).toBeNull();
  });

  it('records when the follow-up happened, and can reopen it', async () => {
    const item = row();
    await helpers.assign(item, {
      surgeryDate: '1405/06/27',
      followUpMonths: 3,
    });

    await helpers.assign(item, { followUpDoneAt: '1405/09/29' });
    expect(jalali(item.followUpDoneAt)).toBe('1405/09/29');
    expect(followUpState(item)).toBe('done');

    await helpers.assign(item, { followUpDoneAt: null });
    expect(item.followUpDoneAt).toBeNull();
  });
});
