import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  /** A bold first line above the message. */
  title?: string;
  /** Label of the one action a toast may carry — usually "Undo". */
  action?: string;
  /** How long it stays, in ms; 0 keeps it until dismissed. */
  duration?: number;
}

export interface ToastItem {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
  readonly title: string | null;
  readonly action: string | null;
  readonly duration: number;
  /** Raised when the same message is shown again: the toast pulses and its clock restarts. */
  readonly bump: number;
}

/** Long enough to read a sentence; errors and anything with an action stay longer. */
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 7000,
};
const ACTION_MIN_DURATION = 8000;
/** Kept on screen at once; the oldest makes room for a new one. */
const MAX_TOASTS = 4;

/** A shown toast: dismiss it, or hear about its action. */
export class ToastRef {
  constructor(
    readonly id: number,
    private readonly service: ToastService,
    private readonly actions: Subject<void>,
    private readonly closed: Subject<void>,
  ) {}

  dismiss(): void {
    this.service.dismiss(this.id);
  }

  /** Emits once if the action is pressed. */
  onAction(): Observable<void> {
    return this.actions.asObservable();
  }

  /** Emits once when the toast leaves, for whatever reason. */
  afterDismissed(): Observable<void> {
    return this.closed.asObservable();
  }
}

/**
 * The app's notifications: short confirmations ("saved"), failures, and
 * the undo offered after a move. Several can be up at once — they stack at
 * the bottom corner, newest in front, and fan out when hovered. Rendered by
 * `pb-toast-host`, which the root component mounts once.
 *
 * A message already on screen is not stacked twice: the toast it matches
 * pulses and starts its clock again, and the caller gets that toast's ref.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _toasts = signal<readonly ToastItem[]>([]);
  private readonly channels = new Map<number, { actions: Subject<void>; closed: Subject<void> }>();
  private readonly refs = new Map<number, ToastRef>();

  /** Newest first. */
  readonly toasts = this._toasts.asReadonly();

  success(message: string, options?: ToastOptions): ToastRef {
    return this.show('success', message, options);
  }

  error(message: string, options?: ToastOptions): ToastRef {
    return this.show('error', message, options);
  }

  warning(message: string, options?: ToastOptions): ToastRef {
    return this.show('warning', message, options);
  }

  info(message: string, options?: ToastOptions): ToastRef {
    return this.show('info', message, options);
  }

  show(tone: ToastTone, message: string, options: ToastOptions = {}): ToastRef {
    const action = options.action ?? null;
    const title = options.title ?? null;

    const same = this._toasts().find(
      (t) => t.tone === tone && t.message === message && t.title === title && t.action === action,
    );
    if (same) {
      const bumped = { ...same, bump: same.bump + 1 };
      this._toasts.update((list) => [bumped, ...list.filter((t) => t.id !== same.id)]);
      return this.refs.get(same.id)!;
    }

    const base = options.duration ?? DEFAULT_DURATION[tone];
    const duration = base > 0 && action ? Math.max(base, ACTION_MIN_DURATION) : base;
    const item: ToastItem = { id: this.nextId++, tone, message, title, action, duration, bump: 0 };

    const channel = { actions: new Subject<void>(), closed: new Subject<void>() };
    this.channels.set(item.id, channel);
    const ref = new ToastRef(item.id, this, channel.actions, channel.closed);
    this.refs.set(item.id, ref);

    const overflow = this._toasts().slice(MAX_TOASTS - 1);
    this._toasts.update((list) => [item, ...list.slice(0, MAX_TOASTS - 1)]);
    for (const old of overflow) this.release(old.id);
    return ref;
  }

  /** Press the toast's action: tell its caller, then take it away. */
  act(id: number): void {
    const channel = this.channels.get(id);
    if (!channel) return;
    channel.actions.next();
    this.dismiss(id);
  }

  dismiss(id: number): void {
    if (!this.channels.has(id)) return;
    this._toasts.update((list) => list.filter((t) => t.id !== id));
    this.release(id);
  }

  clear(): void {
    for (const t of this._toasts()) this.dismiss(t.id);
  }

  private release(id: number): void {
    const channel = this.channels.get(id);
    if (!channel) return;
    this.channels.delete(id);
    this.refs.delete(id);
    channel.actions.complete();
    channel.closed.next();
    channel.closed.complete();
  }
}
