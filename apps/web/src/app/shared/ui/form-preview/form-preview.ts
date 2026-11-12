import { Component, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

import { PbAutoHeight } from '../auto-height/auto-height';

@Component({
  selector: 'pb-form-preview',
  standalone: true,
  imports: [PbAutoHeight],
  host: { class: 'pb-aside-card' },
  template: `<pb-auto-height><ng-content /></pb-auto-height>`,
  styles: `
    :host {
      --auto-gap: var(--pb-space-4);
      --auto-height-timing: 280ms cubic-bezier(0.35, 0, 0.25, 1);
    }
  `,
})
export class PbFormPreview {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const running = new WeakMap<HTMLElement, Animation>();
      const observer = new MutationObserver((changes) => {
        if (motion?.matches) return;
        const changed = new Set<HTMLElement>();
        for (const change of changes) {
          const nodes = change.type === 'characterData' ? [change.target] : change.addedNodes;
          for (const node of nodes) {
            if (!node.textContent?.trim()) continue;
            const element = node instanceof HTMLElement ? node : node.parentElement;
            if (element && host.contains(element) && !element.closest('.pb-aside-card__actions')) {
              changed.add(element);
            }
          }
        }
        for (const element of changed) {
          // One fade per branch, even when several bindings update together.
          if ([...changed].some((other) => other !== element && other.contains(element))) continue;
          if (!element.animate || running.get(element)?.playState === 'running') continue;
          running.set(
            element,
            element.animate([{ opacity: 0.65 }, { opacity: 1 }], {
              duration: 180,
              easing: 'ease-out',
            }),
          );
        }
      });
      observer.observe(host, { subtree: true, childList: true, characterData: true });
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
