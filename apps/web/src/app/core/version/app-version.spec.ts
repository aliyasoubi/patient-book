import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AppVersion, stampedVersion } from './app-version';

function pageStamped(version: string | null): Document {
  const doc = document.implementation.createHTMLDocument('');
  if (version !== null) {
    const meta = doc.createElement('meta');
    meta.name = 'app-version';
    meta.content = version;
    doc.head.append(meta);
  }
  return doc;
}

describe('stampedVersion', () => {
  it('reads the release index.html was stamped with', () => {
    expect(stampedVersion(pageStamped('v1.4.0'))).toBe('v1.4.0');
  });

  it('is dev on a page nobody stamped', () => {
    expect(stampedVersion(pageStamped(null))).toBe('dev');
    expect(stampedVersion(pageStamped(''))).toBe('dev');
  });
});

describe('AppVersion', () => {
  // The test page carries no stamp, so this tab runs `dev`.
  const service = () => TestBed.inject(AppVersion);

  it('stays quiet while the same release answers', () => {
    const version = service();
    version.noticeServer('dev');
    expect(version.updateReady()).toBe(false);
  });

  it('says nothing of a reply that names no release', () => {
    const version = service();
    version.noticeServer(null);
    version.noticeServer('');
    expect(version.updateReady()).toBe(false);
  });

  it('offers the update once another release answers, and keeps offering it', () => {
    const version = service();
    version.noticeServer('v1.5.0');
    version.noticeServer(null);
    expect(version.updateReady()).toBe(true);
  });
});
