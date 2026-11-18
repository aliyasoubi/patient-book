import { NavigationError } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isStaleChunkError, reloadOnStaleChunk } from './stale-chunk';

const chrome = new TypeError(
  'Failed to fetch dynamically imported module: https://x.test/chunk-ABCDEFGH.js',
);
const firefox = new TypeError('error loading dynamically imported module: /chunk-ABCDEFGH.js');
const safari = new TypeError('Importing a module script failed.');

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const failed = (error: unknown, url = '/inventory') => new NavigationError(1, url, error);

describe('isStaleChunkError', () => {
  it('knows a missing page file in each browser’s wording', () => {
    expect([chrome, firefox, safari].every(isStaleChunkError)).toBe(true);
  });

  it('leaves every other navigation failure alone', () => {
    expect(isStaleChunkError(new Error('Cannot match any routes'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('reloadOnStaleChunk', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('loads the page asked for from scratch', () => {
    const go = vi.fn();
    reloadOnStaleChunk(failed(chrome, '/labs?q=1'), memoryStorage(), go);
    expect(go).toHaveBeenCalledWith('/labs?q=1');
  });

  it('does not reload for a navigation that failed some other way', () => {
    const go = vi.fn();
    reloadOnStaleChunk(failed(new Error('guard threw')), memoryStorage(), go);
    expect(go).not.toHaveBeenCalled();
  });

  it('reloads once, not in a loop, when the page still cannot load', () => {
    const go = vi.fn();
    const storage = memoryStorage();
    reloadOnStaleChunk(failed(chrome), storage, go);
    vi.advanceTimersByTime(3_000);
    reloadOnStaleChunk(failed(chrome), storage, go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('reloads again for the next deploy', () => {
    const go = vi.fn();
    const storage = memoryStorage();
    reloadOnStaleChunk(failed(chrome), storage, go);
    vi.advanceTimersByTime(60_000);
    reloadOnStaleChunk(failed(chrome), storage, go);
    expect(go).toHaveBeenCalledTimes(2);
  });

  it('does not reload when it cannot remember having done so', () => {
    const go = vi.fn();
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    reloadOnStaleChunk(failed(chrome), blocked, go);
    expect(go).not.toHaveBeenCalled();
  });
});
