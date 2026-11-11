import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { PbIcon } from '../icon/icon';
import type { LineIconName } from '../icon/line-icons';
import { ToastService, type ToastItem, type ToastTone } from './toast.service';

const GAP = 10;
/** How far each toast behind the front one peeks out, collapsed. */
const PEEK = 12;
/** Toasts drawn while collapsed; any further wait their turn, invisible. */
const VISIBLE = 3;
/** A swipe this far, or this fast, sends the toast away. */
const SWIPE_DISTANCE = 90;
const SWIPE_VELOCITY = 0.45;

const TONE_ICON: Record<ToastTone, LineIconName> = {
  success: 'circle-check',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info-circle',
};

/**
 * Draws `ToastService`'s toasts: a stack at the bottom corner (the inline
 * end — bottom-left in RTL — so it stays clear of the navigation), newest in
 * front, the two before it peeking out behind, scaled back. Hover or focus
 * fans them out into a list; a tap does the same on a phone.
 *
 * Motion carries every change, nothing snaps:
 * - a toast rises in on a spring and the stack makes room on the same curve;
 * - a dismissed one sinks and fades while the rest close the gap;
 * - a swipe sideways drags it with the finger, follows through past the
 *   threshold and springs back short of it;
 * - a repeated message pulses the toast already showing it.
 *
 * Its clock is the progress line along its foot: a CSS animation whose end
 * dismisses it. Hovering, focusing or holding the stack pauses every line,
 * so nothing leaves while being read, and a hidden tab pauses them too.
 */
@Component({
  selector: 'pb-toast-host',
  standalone: true,
  // Escape, with focus on a toast's button, dismisses the front toast.
  host: { '(keydown.escape)': 'dismissFront()' },
  imports: [PbIcon, TranslatePipe],
  templateUrl: './toast-host.html',
  styleUrl: './toast-host.scss',
})
export class PbToastHost {
  private readonly service = inject(ToastService);

  protected readonly toasts = this.service.toasts;
  protected readonly visible = VISIBLE;

  protected readonly hovered = signal(false);
  protected readonly focused = signal(false);
  private readonly tapped = signal(false);
  private readonly holding = signal(false);
  private readonly pageHidden = signal(typeof document !== 'undefined' && document.hidden);

  protected readonly expanded = computed(
    () => this.toasts().length > 1 && (this.hovered() || this.focused() || this.tapped()),
  );
  protected readonly paused = computed(
    () => this.hovered() || this.focused() || this.holding() || this.pageHidden(),
  );

  /** Natural height of each toast, measured as it renders. */
  private readonly heights = signal<ReadonlyMap<number, number>>(new Map());
  private readonly cards = viewChildren<ElementRef<HTMLElement>>('card');

  private drag: { id: number; x: number; t: number; dx: number; el: HTMLElement } | null = null;

  constructor() {
    const resize = new ResizeObserver((entries) => {
      const next = new Map(this.heights());
      for (const entry of entries) {
        const card = (entry.target as HTMLElement).closest<HTMLElement>('.toast');
        const id = Number(card?.dataset['id']);
        if (id) next.set(id, Math.ceil((entry.target as HTMLElement).offsetHeight));
      }
      this.heights.set(next);
    });
    const observed = new Set<Element>();
    effect(() => {
      for (const card of this.cards()) {
        const inner = card.nativeElement.querySelector('.toast__inner');
        if (inner && !observed.has(inner)) {
          observed.add(inner);
          resize.observe(inner);
        }
      }
    });
    // Forget what is gone, and fold the stack back once it is down to one.
    effect(() => {
      const ids = new Set(this.toasts().map((t) => t.id));
      if (ids.size <= 1) this.tapped.set(false);
      if (!ids.size) this.hovered.set(false);
      for (const el of observed) {
        if (!el.isConnected) {
          resize.unobserve(el);
          observed.delete(el);
        }
      }
    });

    const onVisibility = (): void => this.pageHidden.set(document.hidden);
    // A tap anywhere else folds a stack a tap fanned out.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const onPointerDown = (event: PointerEvent): void => {
      if (!host.contains(event.target as Node)) this.tapped.set(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onPointerDown);
    inject(DestroyRef).onDestroy(() => {
      resize.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onPointerDown);
    });
  }

  protected iconFor(tone: ToastTone): LineIconName {
    return TONE_ICON[tone];
  }

  private heightOf(index: number): number {
    const t = this.toasts()[index];
    return (t && this.heights().get(t.id)) || 64;
  }

  protected slotHeight(index: number): number {
    return this.expanded() || index === 0 ? this.heightOf(index) : this.heightOf(0);
  }

  protected slotTransform(index: number): string {
    if (this.expanded()) {
      let offset = 0;
      for (let i = 0; i < index; i++) offset += this.heightOf(i) + GAP;
      return `translateY(${-offset}px)`;
    }
    const depth = Math.min(index, VISIBLE - 1);
    return `translateY(${-depth * PEEK}px) scale(${1 - depth * 0.05})`;
  }

  protected regionHeight(): number {
    const count = this.toasts().length;
    if (!count) return 0;
    if (this.expanded()) {
      let total = 0;
      for (let i = 0; i < count; i++) total += this.heightOf(i);
      return total + GAP * (count - 1);
    }
    return this.heightOf(0) + PEEK * (Math.min(count, VISIBLE) - 1);
  }

  protected act(t: ToastItem, event: Event): void {
    event.stopPropagation();
    this.service.act(t.id);
  }

  protected close(t: ToastItem, event: Event): void {
    event.stopPropagation();
    this.service.dismiss(t.id);
  }

  protected expire(t: ToastItem, event: AnimationEvent): void {
    // Angular prefixes component keyframe names, so match on the part we wrote.
    if (event.animationName.includes('pb-toast-clock')) this.service.dismiss(t.id);
  }

  protected dismissFront(): void {
    const front = this.toasts()[0];
    if (front) this.service.dismiss(front.id);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !(event.currentTarget as HTMLElement).contains(next)) this.focused.set(false);
  }

  /** On a phone there is no hover: a tap on the folded stack fans it out. */
  protected expandOnTap(): void {
    if (this.toasts().length > 1 && !this.expanded()) this.tapped.set(true);
  }

  // ── Swipe to dismiss ──────────────────────────────────────────────

  protected dragStart(event: PointerEvent, t: ToastItem): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    el.classList.remove('is-settling', 'is-flung');
    el.classList.add('is-dragging');
    this.drag = { id: t.id, x: event.clientX, t: performance.now(), dx: 0, el };
    this.holding.set(true);
  }

  protected dragMove(event: PointerEvent): void {
    if (!this.drag) return;
    const dx = event.clientX - this.drag.x;
    this.drag.dx = dx;
    this.drag.el.style.transform = `translateX(${dx}px)`;
    this.drag.el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 260));
  }

  protected dragEnd(event: PointerEvent, t: ToastItem): void {
    const drag = this.drag;
    if (!drag || drag.id !== t.id) return;
    this.drag = null;
    this.holding.set(false);
    const { el, dx } = drag;
    el.classList.remove('is-dragging');
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - drag.t);
    if (Math.abs(dx) > SWIPE_DISTANCE || (Math.abs(dx) > 24 && velocity > SWIPE_VELOCITY)) {
      el.classList.add('is-flung');
      el.style.transform = `translateX(${Math.sign(dx) * 120}%)`;
      el.style.opacity = '0';
      this.service.dismiss(t.id);
      return;
    }
    if (Math.abs(dx) < 4 && event.pointerType !== 'mouse') this.expandOnTap();
    this.settle(el);
  }

  protected dragCancel(): void {
    if (!this.drag) return;
    const { el } = this.drag;
    this.drag = null;
    this.holding.set(false);
    el.classList.remove('is-dragging');
    this.settle(el);
  }

  /** Spring back to rest when the swipe fell short. */
  private settle(el: HTMLElement): void {
    el.classList.add('is-settling');
    el.style.transform = '';
    el.style.opacity = '';
  }
}
