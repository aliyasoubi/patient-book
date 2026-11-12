import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The loader for when we cannot know what is coming: three dots rising one
 * after another, graphite with the last in the brand's orange. For anything
 * whose shape is known, draw its skeleton instead (styles/_skeleton.scss).
 * `block` centres it with room around, in place of the content it stands for.
 */
@Component({
  selector: 'pb-loading-dots',
  standalone: true,
  imports: [TranslatePipe],
  host: { '[class.is-block]': 'block()' },
  template: `
    <span class="dots" role="status" [attr.aria-label]="label() || ('common.loading' | translate)">
      <i></i><i></i><i></i>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      animation: dots-in 240ms 150ms var(--pb-ease-standard) backwards;
    }

    :host(.is-block) {
      display: flex;
      justify-content: center;
      padding: var(--pb-space-6, 32px) var(--pb-space-4);
    }

    .dots {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      block-size: 16px;
    }

    i {
      inline-size: 8px;
      block-size: 8px;
      border-radius: 50%;
      background: var(--pb-graphite);
      animation: dot 1.1s var(--pb-ease-standard) infinite;

      &:nth-child(2) {
        animation-delay: 140ms;
      }

      &:nth-child(3) {
        background: var(--pb-brand);
        animation-delay: 280ms;
      }
    }

    @keyframes dot {
      0%,
      70%,
      100% {
        translate: 0 0;
        opacity: 0.3;
      }

      35% {
        translate: 0 -6px;
        opacity: 1;
      }
    }

    @keyframes dots-in {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      i {
        animation: none;
        opacity: 0.6;
      }
    }
  `,
})
export class PbLoadingDots {
  readonly label = input('');
  readonly block = input(false);
}
