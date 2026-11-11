import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ToastService } from './toast.service';

function service(): ToastService {
  TestBed.configureTestingModule({});
  return TestBed.inject(ToastService);
}

describe('ToastService', () => {
  it('stacks several toasts, newest first', () => {
    const toast = service();
    toast.success('one');
    toast.error('two');
    expect(toast.toasts().map((t) => t.message)).toEqual(['two', 'one']);
  });

  it('keeps at most four, letting the oldest go and telling its caller', () => {
    const toast = service();
    let closed = false;
    toast
      .info('first')
      .afterDismissed()
      .subscribe(() => (closed = true));
    for (const m of ['b', 'c', 'd', 'e']) toast.info(m);
    expect(toast.toasts().map((t) => t.message)).toEqual(['e', 'd', 'c', 'b']);
    expect(closed).toBe(true);
  });

  it('pulses a message already showing instead of stacking it twice', () => {
    const toast = service();
    const first = toast.success('saved');
    toast.error('other');
    const again = toast.success('saved');
    expect(again).toBe(first);
    expect(toast.toasts().map((t) => [t.message, t.bump])).toEqual([
      ['saved', 1],
      ['other', 0],
    ]);
  });

  it('runs the action once and then removes the toast', () => {
    const toast = service();
    let acted = 0;
    const ref = toast.success('moved', { action: 'Undo' });
    ref.onAction().subscribe(() => acted++);
    toast.act(ref.id);
    toast.act(ref.id);
    expect(acted).toBe(1);
    expect(toast.toasts()).toEqual([]);
  });

  it('gives a toast with an action time to reach it', () => {
    const toast = service();
    toast.success('moved', { action: 'Undo' });
    toast.success('sticky', { duration: 0 });
    const [sticky, moved] = toast.toasts();
    expect(moved.duration).toBeGreaterThanOrEqual(8000);
    expect(sticky.duration).toBe(0);
  });
});
