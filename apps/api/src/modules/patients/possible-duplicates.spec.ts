import {
  duplicateCriteria,
  duplicateRank,
  duplicateReasons,
  hasCriteria,
  type DuplicateCandidate,
} from './possible-duplicates';

const patient = (
  overrides: Partial<DuplicateCandidate> = {},
): DuplicateCandidate => ({
  firstName: 'مریم',
  lastName: 'کریمی',
  fatherName: null,
  nationalId: null,
  mobile: null,
  ...overrides,
});

describe('duplicateCriteria', () => {
  it('folds identifiers to their stored form, whichever keyboard typed them', () => {
    const c = duplicateCriteria({
      nationalId: '۰۰۷۸۹۸۰۵۰۱',
      mobile: '+98 912 123 4567',
    });
    expect(c.nationalId).toBe('0078980501');
    expect(c.mobile).toBe('09121234567');
  });

  it('ignores a number that is still being typed', () => {
    // «0912» must not match every patient whose mobile begins with it.
    const c = duplicateCriteria({ nationalId: '00789', mobile: '0912' });
    expect(c.nationalId).toBeNull();
    expect(c.mobile).toBeNull();
    expect(hasCriteria(c)).toBe(false);
  });

  it('needs both names before a name can match', () => {
    expect(duplicateCriteria({ firstName: 'مریم' }).name).toBeNull();
    expect(
      duplicateCriteria({ firstName: 'مریم', lastName: 'کریمی' }).name,
    ).toBe('مریمکریمی');
  });
});

describe('duplicateReasons', () => {
  it('matches a name across spacing and Arabic letter forms', () => {
    const c = duplicateCriteria({ firstName: 'علی رضا', lastName: 'نوري' });
    expect(
      duplicateReasons(c, patient({ firstName: 'علیرضا', lastName: 'نوری' })),
    ).toEqual(['name']);
  });

  it('sets a shared name aside when the fathers differ', () => {
    const c = duplicateCriteria({
      firstName: 'مریم',
      lastName: 'کریمی',
      fatherName: 'حسن',
    });
    expect(duplicateReasons(c, patient({ fatherName: 'حسین' }))).toEqual([]);
    // One side without a father's name cannot tell the two apart.
    expect(duplicateReasons(c, patient({ fatherName: null }))).toEqual([
      'name',
    ]);
  });

  it('sets a shared name aside when the national ids differ', () => {
    const c = duplicateCriteria({
      firstName: 'مریم',
      lastName: 'کریمی',
      nationalId: '0078980501',
    });
    expect(duplicateReasons(c, patient({ nationalId: '1234567890' }))).toEqual(
      [],
    );
  });

  it('lists every reason, strongest first', () => {
    const c = duplicateCriteria({
      firstName: 'مریم',
      lastName: 'کریمی',
      nationalId: '0078980501',
      mobile: '09121234567',
    });
    expect(
      duplicateReasons(
        c,
        patient({ nationalId: '0078980501', mobile: '09121234567' }),
      ),
    ).toEqual(['nationalId', 'name', 'mobile']);
  });
});

describe('duplicateRank', () => {
  it('puts a national id above any number of weaker reasons', () => {
    expect(duplicateRank(['nationalId'])).toBeGreaterThan(
      duplicateRank(['name', 'mobile']),
    );
    expect(duplicateRank(['name', 'mobile'])).toBeGreaterThan(
      duplicateRank(['name']),
    );
  });
});
