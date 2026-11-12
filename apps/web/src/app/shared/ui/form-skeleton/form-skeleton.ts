import { Component, computed, input } from '@angular/core';

/**
 * A stepped form (styles/_form-steps.scss) before its record has loaded: the
 * same steps, step heads, field grids and summary card, built from the same
 * classes, so the filled form lands exactly where its outline stood.
 * `steps` gives the number of fields in each step, in order.
 */
@Component({
  selector: 'pb-form-skeleton',
  standalone: true,
  host: { class: 'pb-form pb-skeleton', 'aria-hidden': 'true' },
  template: `
    <div class="pb-form__main">
      @for (step of layout(); track $index; let s = $index) {
        <section class="pb-step" [style.--skel-i]="s">
          <header class="pb-step__head">
            <span class="pb-skel" style="--w: 32px; --h: 32px; --r: 10px"></span>
            <div class="pb-step__titles" style="flex: 1">
              <span class="pb-skel" style="--w: 34%; --h: 17px; margin-block-end: 8px"></span>
              <span class="pb-skel" style="--w: 58%; --h: 12px"></span>
            </div>
          </header>
          <div
            class="pb-grid"
            [class.pb-grid--2]="step.columns === 2"
            [class.pb-grid--3]="step.columns === 3"
          >
            @for (f of step.fields; track f) {
              <div>
                <span class="pb-skel" style="--w: 30%; --h: 12px; margin: 4px 12px 10px"></span>
                <span class="pb-skel" style="--h: 48px; --r: 12px"></span>
              </div>
            }
          </div>
        </section>
      }
    </div>
    <aside class="pb-form__aside">
      <div class="pb-aside-card">
        <span class="pb-skel" style="--w: 44px; --h: 44px; --r: 14px"></span>
        @for (i of [0, 1, 2]; track i) {
          <span class="pb-skel" [style.--w]="['70%', '55%', '62%'][i]" style="--h: 13px"></span>
        }
        <span class="pb-skel pb-skel--pill" style="--h: 44px"></span>
      </div>
    </aside>
  `,
})
export class PbFormSkeleton {
  readonly steps = input<number[]>([3, 2, 2]);

  protected readonly layout = computed(() =>
    this.steps().map((n) => ({
      columns: Math.min(3, n),
      fields: Array.from({ length: n }, (_, i) => i),
    })),
  );
}
