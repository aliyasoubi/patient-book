import { PatientNameMatcher } from './patient-matcher';

describe('PatientNameMatcher', () => {
  const matcher = (): PatientNameMatcher => new PatientNameMatcher();

  it('matches an identical name exactly', () => {
    const m = matcher();
    m.index('مریم', 'کریمی', 'p1');
    expect(m.match('مریم کریمی')).toEqual({ patientId: 'p1', method: 'exact' });
  });

  it('matches across Arabic and Persian spellings of the same letters', () => {
    const m = matcher();
    m.index('مریم', 'کریمی', 'p1');
    expect(m.match('مريم كريمي').patientId).toBe('p1');
  });

  it('falls back to a space-insensitive match', () => {
    const m = matcher();
    m.index('علیرضا', 'نوری', 'p1');
    const result = m.match('علی رضا نوری');
    expect(result).toEqual({ patientId: 'p1', method: 'fuzzy' });
  });

  it('refuses to guess when two patients share a name', () => {
    // Attaching a surgical record to the wrong patient is far worse than
    // leaving the row for a human, so an ambiguous name yields nothing.
    const m = matcher();
    m.index('مریم', 'کریمی', 'p1');
    m.index('مریم', 'کریمی', 'p2');
    expect(m.match('مریم کریمی')).toEqual({ patientId: null, method: 'unmatched' });
  });

  it('returns unmatched for an unknown or empty name', () => {
    const m = matcher();
    m.index('مریم', 'کریمی', 'p1');
    expect(m.match('کسی که نیست').method).toBe('unmatched');
    expect(m.match('').method).toBe('unmatched');
  });

  it('tolerates patients indexed with only one name part', () => {
    const m = matcher();
    m.index('', 'دماوندی', 'p1');
    expect(m.match('دماوندی').patientId).toBe('p1');
  });

  describe('namesDiffer', () => {
    it('is false for the same name written differently', () => {
      expect(PatientNameMatcher.namesDiffer('علی رضا نوری', 'علیرضا نوری')).toBe(false);
      expect(PatientNameMatcher.namesDiffer('مريم كريمي', 'مریم کریمی')).toBe(false);
    });

    it('is true for genuinely different people', () => {
      // This is what flags a reused implant register number.
      expect(PatientNameMatcher.namesDiffer('مرضیه محمدی', 'محمد محمدپور')).toBe(true);
    });

    it('is false when either name is missing, rather than claiming a mismatch', () => {
      expect(PatientNameMatcher.namesDiffer('', 'مریم کریمی')).toBe(false);
      expect(PatientNameMatcher.namesDiffer('مریم کریمی', '')).toBe(false);
    });
  });
});
