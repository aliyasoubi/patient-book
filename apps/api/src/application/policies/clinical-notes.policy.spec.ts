import { describe, expect, it } from '@jest/globals';

import { assertMayWriteClinicalNotes } from './clinical-notes.policy';
import { UserRole } from '../../domain';

describe('assertMayWriteClinicalNotes', () => {
  it('refuses a receptionist changing a note', () => {
    expect(() =>
      assertMayWriteClinicalNotes(UserRole.Receptionist, [['دیابت', null]]),
    ).toThrow();
  });

  it('refuses a receptionist clearing a note', () => {
    expect(() =>
      assertMayWriteClinicalNotes(UserRole.Receptionist, [[null, 'دیابت']]),
    ).toThrow();
  });

  it('lets a receptionist save a record whose notes are untouched', () => {
    expect(() =>
      assertMayWriteClinicalNotes(UserRole.Receptionist, [
        ['دیابت', 'دیابت'],
        [null, ''],
        [undefined, 'حساسیت'],
      ]),
    ).not.toThrow();
  });

  it('lets clinical staff and the system write notes', () => {
    for (const role of [UserRole.Admin, UserRole.Dentist, undefined]) {
      expect(() =>
        assertMayWriteClinicalNotes(role, [['دیابت', null]]),
      ).not.toThrow();
    }
  });
});
