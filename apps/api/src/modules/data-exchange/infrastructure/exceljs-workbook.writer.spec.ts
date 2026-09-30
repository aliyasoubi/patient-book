import { classifyEducation, EducationLevel } from '../../../domain';
import { educationCell } from './exceljs-workbook.writer';

describe('educationCell', () => {
  it('keeps the imported spelling while it still matches the level', () => {
    expect(
      educationCell({
        education: EducationLevel.Master,
        educationRaw: 'کارشناسی ارشد',
      }),
    ).toBe('کارشناسی ارشد');
  });

  it('writes the edited level, not stale imported text', () => {
    expect(
      educationCell({
        education: EducationLevel.Doctorate,
        educationRaw: 'دیپلم',
      }),
    ).toBe('دکترا');
  });

  it('writes a level entered in the app, with no imported text', () => {
    expect(
      educationCell({ education: EducationLevel.Bachelor, educationRaw: null }),
    ).toBe('لیسانس');
  });

  it.each(Object.values(EducationLevel))(
    'round-trips %s through the importer',
    (level) => {
      const cell = educationCell({ education: level, educationRaw: null });
      expect(classifyEducation(cell)).toBe(level);
    },
  );
});
