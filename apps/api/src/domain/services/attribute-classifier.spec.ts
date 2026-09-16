import {
  classifyAbutment,
  classifyEducation,
  classifyGender,
  classifyReferral,
  extractImplantBrand,
} from './attribute-classifier';
import {
  AbutmentType,
  EducationLevel,
  Gender,
  ReferralKind,
} from '../model/enums';

describe('classifyGender', () => {
  it('reads the two values the sheet uses', () => {
    expect(classifyGender('زن')).toBe(Gender.Female);
    expect(classifyGender('مرد')).toBe(Gender.Male);
  });

  it('survives the typos actually present in the data', () => {
    expect(classifyGender('ز ن')).toBe(Gender.Female); // stray space
    expect(classifyGender('ن')).toBe(Gender.Female); // truncated
  });

  it('falls back to unknown rather than guessing', () => {
    expect(classifyGender('')).toBe(Gender.Unknown);
    expect(classifyGender('نامشخص')).toBe(Gender.Unknown);
  });
});

describe('classifyEducation', () => {
  it('treats لیسانس and کارشناسی as one degree', () => {
    expect(classifyEducation('لیسانس')).toBe(EducationLevel.Bachelor);
    expect(classifyEducation('کارشناسی')).toBe(EducationLevel.Bachelor);
  });

  it('treats the three spellings of a master&apos;s degree as one', () => {
    expect(classifyEducation('فوق لیسانس')).toBe(EducationLevel.Master);
    expect(classifyEducation('کارشناسی ارشد')).toBe(EducationLevel.Master);
    expect(classifyEducation('ارشد')).toBe(EducationLevel.Master);
  });

  it('does not let فوق دیپلم fall through to دیپلم', () => {
    expect(classifyEducation('فوق دیپلم')).toBe(EducationLevel.Associate);
    expect(classifyEducation('دیپلم')).toBe(EducationLevel.Diploma);
  });

  it('handles both spellings of a doctorate', () => {
    expect(classifyEducation('دکتری')).toBe(EducationLevel.Doctorate);
    expect(classifyEducation('دکترا')).toBe(EducationLevel.Doctorate);
  });

  it('recognises students', () => {
    expect(classifyEducation('محصل')).toBe(EducationLevel.Student);
    expect(classifyEducation('دانشجو')).toBe(EducationLevel.Student);
  });

  it('is unknown for empty input', () => {
    expect(classifyEducation('')).toBe(EducationLevel.Unknown);
  });
});

describe('classifyReferral', () => {
  it('recognises the channels the practice records', () => {
    expect(classifyReferral('اینستاگرام')).toBe(ReferralKind.Social);
    expect(classifyReferral('سایت')).toBe(ReferralKind.Website);
    expect(classifyReferral('دکتر افخمی')).toBe(ReferralKind.Professional);
    expect(classifyReferral('معرفی')).toBe(ReferralKind.Patient);
    expect(classifyReferral('آشنایان')).toBe(ReferralKind.Patient);
  });

  it('treats a bare personal name as word of mouth', () => {
    expect(classifyReferral('ماهی صفت')).toBe(ReferralKind.Patient);
  });
});

describe('classifyAbutment', () => {
  it('distinguishes cover, healing and both', () => {
    expect(classifyAbutment('کاور')).toBe(AbutmentType.Cover);
    expect(classifyAbutment('هیلینگ')).toBe(AbutmentType.Healing);
    expect(classifyAbutment('کاور و هیلینگ')).toBe(AbutmentType.Both);
  });

  it('is unknown when the column is blank', () => {
    expect(classifyAbutment('')).toBe(AbutmentType.Unknown);
  });
});

describe('extractImplantBrand', () => {
  it('pulls the system out of the practice&apos;s tooth-position phrasing', () => {
    expect(extractImplantBrand('دنتیوم، ۶ و ۷ راست پایین')).toBe('دنتیوم');
    expect(extractImplantBrand('زیمر، فرش ساکت ۴ چپ بالا')).toBe('زیمر');
    expect(extractImplantBrand('اشترومن، ۶ و ۴ چپ پایین')).toBe('اشترومن');
  });

  it('recognises a latin-script system name', () => {
    expect(extractImplantBrand('TRI، شش راست پایین')).toBe('TRI');
  });

  it('returns null when no known system is named', () => {
    expect(extractImplantBrand('۶ راست پایین')).toBeNull();
    expect(extractImplantBrand('')).toBeNull();
  });
});
