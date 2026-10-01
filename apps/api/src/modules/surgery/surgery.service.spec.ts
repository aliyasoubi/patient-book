import { describe, expect, it } from '@jest/globals';
import type { Repository } from 'typeorm';

import { SurgeryService } from './surgery.service';
import { followUpState } from './follow-up';
import { SurgeryQueueItem } from './surgery-queue-item.entity';
import { ImplantCase } from '../implants/implant-case.entity';
import type { UpsertSurgeryDto } from './dto/surgery.dto';
import type { AuditService } from '../../application/services/audit.service';
import {
  AbutmentType,
  ErrorCode,
  JalaliDate,
  SurgeryStatus,
} from '../../domain';

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

describe('SurgeryService.update concurrency', () => {
  /**
   * A transaction whose locked read finds the row at `storedVersion`. Saving
   * is the first thing past the gate, so reaching it shows up as a sentinel
   * rejection without mocking the whole write path.
   */
  const makeService = (storedVersion: number) => {
    const repository = {
      findOne: () =>
        Promise.resolve(
          Object.assign(row(), { id: 'row-1', version: storedVersion }),
        ),
      save: () => Promise.reject(new Error('past the gate')),
    };
    const manager = { getRepository: () => repository };
    const queue = {
      manager: {
        transaction: (run: (m: unknown) => Promise<void>) => run(manager),
      },
    } as unknown as Repository<SurgeryQueueItem>;
    return new SurgeryService(
      queue,
      {} as Repository<ImplantCase>,
      {} as AuditService,
    );
  };
  const refused = { code: ErrorCode.SurgeryItemModified };
  const passedGate = { message: 'past the gate' };

  it('refuses an edit made from a stale copy of the row', async () => {
    await expect(
      makeService(4).update('row-1', { notes: 'x', expectedVersion: 3 }, 'u'),
    ).rejects.toMatchObject(refused);
  });

  it('lets an edit through when the client holds the current version', async () => {
    await expect(
      makeService(4).update('row-1', { notes: 'x', expectedVersion: 4 }, 'u'),
    ).rejects.toMatchObject(passedGate);
  });

  it('refuses an edit that carries no version at all', async () => {
    await expect(
      makeService(4).update('row-1', { notes: 'x' }, 'u'),
    ).rejects.toMatchObject(refused);
  });

  it('lets the follow-up switch through without a version: it overwrites nothing else', async () => {
    await expect(
      makeService(4).update('row-1', { followUpDoneAt: '1405/07/09' }, 'u'),
    ).rejects.toMatchObject(passedGate);
    await expect(
      makeService(4).update('row-1', { followUpDoneAt: null }, 'u'),
    ).rejects.toMatchObject(passedGate);
  });

  it('does not stretch that exemption to a switch that carries other fields', async () => {
    await expect(
      makeService(4).update(
        'row-1',
        { followUpDoneAt: '1405/07/09', notes: 'x' },
        'u',
      ),
    ).rejects.toMatchObject(refused);
  });
});

describe('SurgeryService.assign — implant register link', () => {
  const service = new SurgeryService(
    {} as Repository<SurgeryQueueItem>,
    {} as Repository<ImplantCase>,
    {} as AuditService,
  );
  const helpers = service as unknown as SurgeryWriteHelpers;

  /** An in-memory register: enough of a repository for `assign`. */
  function register(...cases: Array<Partial<ImplantCase>>) {
    const rows = cases.map(
      (c) => ({ recordedName: 'مریم کریمی', ...c }) as ImplantCase,
    );
    let created = 0;
    const repo = {
      findOne: ({ where }: { where: Partial<ImplantCase> }) =>
        Promise.resolve(
          rows.find((r) =>
            where.id !== undefined
              ? r.id === where.id
              : r.registryNo === where.registryNo,
          ) ?? null,
        ),
      create: (c: Partial<ImplantCase>) => c as ImplantCase,
      save: (c: ImplantCase) => {
        created += 1;
        const saved = { ...c, id: `new-${created}` } as ImplantCase;
        rows.push(saved);
        return Promise.resolve(saved);
      },
    };
    return {
      repo: repo as unknown as Repository<ImplantCase>,
      created: () => created,
    };
  }

  /** A surgery linked to case `case-42`, which carries number 42 when linked. */
  const linked = (): SurgeryQueueItem =>
    Object.assign(row(), { implantCaseId: 'case-42', implantRegistryNo: '42' });

  it('keeps the link when the case was renumbered and the old number comes back unchanged', async () => {
    // The register renamed 42 to 43; the surgery's copy still reads 42, and
    // an edit of the notes alone sends that copy back.
    const book = register({ id: 'case-42', registryNo: '43' });
    const item = linked();

    await helpers.assign(
      item,
      { implantRegistryNo: '42', notes: 'کنترل' },
      book.repo,
    );

    expect(item.implantCaseId).toBe('case-42');
    expect(item.implantRegistryNo).toBe('43');
    expect(book.created()).toBe(0);
  });

  it('keeps the link and refreshes the number when the number is not sent at all', async () => {
    const book = register({ id: 'case-42', registryNo: '43' });
    const item = linked();

    await helpers.assign(item, { notes: 'کنترل' }, book.repo);

    expect(item.implantCaseId).toBe('case-42');
    expect(item.implantRegistryNo).toBe('43');
  });

  it('an explicit null unlinks the surgery instead of refilling the old number', async () => {
    const book = register({ id: 'case-42', registryNo: '42' });
    const item = linked();

    await helpers.assign(item, { implantRegistryNo: null }, book.repo);

    expect(item.implantCaseId).toBeNull();
    expect(item.implantRegistryNo).toBeNull();
  });

  it('a different number relinks to that case', async () => {
    const book = register(
      { id: 'case-42', registryNo: '42' },
      { id: 'case-50', registryNo: '50' },
    );
    const item = linked();

    await helpers.assign(item, { implantRegistryNo: '50' }, book.repo);

    expect(item.implantCaseId).toBe('case-50');
    expect(item.implantRegistryNo).toBe('50');
    expect(book.created()).toBe(0);
  });

  it('a number the register does not know yet still opens a new entry for it', async () => {
    const book = register({ id: 'case-42', registryNo: '42' });
    const item = linked();

    await helpers.assign(item, { implantRegistryNo: '77' }, book.repo);

    expect(book.created()).toBe(1);
    expect(item.implantCaseId).toBe('new-1');
    expect(item.implantRegistryNo).toBe('77');
  });
});
