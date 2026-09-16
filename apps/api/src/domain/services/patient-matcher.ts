import { loosePersianKey, searchKey } from './persian-text';

/** How a register entry came to be linked to a patient. */
export type MatchMethod = 'exact' | 'fuzzy' | 'manual' | 'unmatched';

export interface NameMatch {
  readonly patientId: string | null;
  readonly method: MatchMethod;
}

const NO_MATCH: NameMatch = { patientId: null, method: 'unmatched' };

/**
 * Resolves a name written in one of the practice's registers to a patient in
 * the main book.
 *
 * This exists because the implant and orthodontic registers run their own
 * numbering, which overlaps numerically with the main file numbers while
 * referring to different people — of the 99 numbers present in both the implant
 * sheet and the main sheet, only 2 are the same human. Linking on the number
 * would mislink 97 patients, so the name is the only usable key.
 *
 * Deliberately conservative: an ambiguous name yields no match at all. Attaching
 * a surgical record to the wrong patient is far worse than leaving a row for a
 * human to resolve.
 */
export class PatientNameMatcher {
  /** Fully folded "first last" to the ids that share it. */
  private readonly exact = new Map<string, string[]>();
  /** Space-insensitive form, so "علی رضا" and "علیرضا" collapse together. */
  private readonly loose = new Map<string, string[]>();

  /** Add a patient to the index. Safe to call with partial names. */
  index(firstName: string, lastName: string, patientId: string): void {
    const full = `${firstName ?? ''} ${lastName ?? ''}`;
    PatientNameMatcher.push(this.exact, searchKey(full), patientId);
    PatientNameMatcher.push(this.loose, loosePersianKey(full), patientId);
  }

  /**
   * Resolve a recorded name. Only unambiguous matches are accepted: where two
   * patients share a name the row stays unlinked.
   */
  match(recordedName: string): NameMatch {
    if (!recordedName) return NO_MATCH;

    const exactHits = this.exact.get(searchKey(recordedName));
    if (exactHits?.length === 1) {
      return { patientId: exactHits[0], method: 'exact' };
    }
    // More than one patient answers to this name — refuse rather than pick.
    if (exactHits && exactHits.length > 1) return NO_MATCH;

    const looseHits = this.loose.get(loosePersianKey(recordedName));
    if (looseHits?.length === 1) {
      return { patientId: looseHits[0], method: 'fuzzy' };
    }
    return NO_MATCH;
  }

  /**
   * Whether two recorded names describe different people, ignoring spelling
   * variation. Used to flag a register number that has been reassigned.
   */
  static namesDiffer(a: string, b: string): boolean {
    const left = loosePersianKey(a);
    const right = loosePersianKey(b);
    return Boolean(left && right && left !== right);
  }

  get size(): number {
    return this.exact.size;
  }

  private static push(
    index: Map<string, string[]>,
    key: string,
    id: string,
  ): void {
    if (!key) return;
    const existing = index.get(key);
    if (existing) existing.push(id);
    else index.set(key, [id]);
  }
}
