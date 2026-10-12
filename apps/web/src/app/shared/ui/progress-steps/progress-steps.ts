import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * How far a step is along: `done` is behind us, `current` is where we are,
 * `upcoming` is still ahead, and `success` and `error` are an ending reached —
 * the good one and the bad one.
 */
export type ProgressStepState = 'done' | 'current' | 'upcoming' | 'success' | 'error';

export interface ProgressStep {
  value: string;
  label: string;
  icon: string;
  state: ProgressStepState;
  /** A line of detail under the label — a date. Already formatted. */
  note?: string | null;
  /** Resolve `label` as an i18n key. */
  translate?: boolean;
  /** Offered as a button that emits `stepSelected`; a step that only reports stays plain. */
  interactive?: boolean;
}

/**
 * A row of steps joined by a track, the way M3 draws progress through a short
 * process: a node for each stage, the track between two filled once the later
 * one has been reached. It reports where something stands and, for the steps
 * marked `interactive`, lets the user move it there.
 *
 * Direction follows the page, so a Persian page reads its steps right to left.
 */
@Component({
  selector: 'pb-progress-steps',
  standalone: true,
  imports: [MatIconModule, TranslatePipe],
  template: `
    <ol class="pb-steps" [attr.aria-label]="ariaLabel()">
      @for (step of steps(); track step.value) {
        <li class="pb-steps__step" [attr.data-state]="step.state">
          @if (step.interactive && !disabled()) {
            <button
              type="button"
              class="pb-steps__node"
              [attr.aria-current]="step.state === 'current' ? 'step' : null"
              (click)="stepSelected.emit(step.value)"
            >
              <mat-icon aria-hidden="true">{{ step.icon }}</mat-icon>
              <span class="pb-steps__label">{{
                step.translate ? (step.label | translate) : step.label
              }}</span>
            </button>
          } @else {
            <span
              class="pb-steps__node pb-steps__node--static"
              [attr.aria-current]="step.state === 'current' ? 'step' : null"
            >
              <mat-icon aria-hidden="true">{{ step.icon }}</mat-icon>
              <span class="pb-steps__label">{{
                step.translate ? (step.label | translate) : step.label
              }}</span>
            </span>
          }
          @if (step.note) {
            <span class="pb-steps__note">{{ step.note }}</span>
          }
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }

    .pb-steps {
      display: flex;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .pb-steps__step {
      --_bg: transparent;
      --_fg: var(--mat-sys-on-surface-variant);
      --_border: var(--mat-sys-outline-variant);
      --_track: var(--mat-sys-outline-variant);

      position: relative;
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--pb-space-1);
    }

    /* The track runs from this step's node back to the one before it. */
    .pb-steps__step + .pb-steps__step::before {
      content: '';
      position: absolute;
      top: 15px;
      inset-inline-end: 50%;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: var(--_track);
      transition: background-color 250ms var(--pb-ease-emphasized);
    }

    .pb-steps__step[data-state='done'],
    .pb-steps__step[data-state='current'] {
      --_track: var(--mat-sys-primary);
    }

    .pb-steps__step[data-state='done'] {
      --_bg: var(--mat-sys-primary);
      --_fg: var(--mat-sys-on-primary);
      --_border: transparent;
    }

    .pb-steps__step[data-state='current'] {
      --_bg: var(--mat-sys-primary-container);
      --_fg: var(--mat-sys-on-primary-container);
      --_border: var(--mat-sys-primary);
    }

    .pb-steps__step[data-state='success'] {
      --_bg: var(--pb-success-container);
      --_fg: var(--pb-on-success-container);
      --_border: var(--pb-on-success-container);
      --_track: var(--pb-on-success-container);
    }

    .pb-steps__step[data-state='error'] {
      --_bg: var(--mat-sys-error-container);
      --_fg: var(--mat-sys-on-error-container);
      --_border: var(--mat-sys-error);
      --_track: var(--mat-sys-error);
    }

    .pb-steps__node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--pb-space-1);
      min-width: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      position: relative;
      z-index: 1;

      &--static {
        cursor: default;
      }

      mat-icon {
        box-sizing: content-box;
        width: var(--pb-icon-sm);
        height: var(--pb-icon-sm);
        padding: 5px;
        border: 2px solid var(--_border);
        border-radius: 50%;
        background: var(--_bg);
        color: var(--_fg);
        font-size: var(--pb-icon-sm);
        transition:
          background-color 250ms var(--pb-ease-emphasized),
          box-shadow 250ms var(--pb-ease-emphasized);
      }
    }

    button.pb-steps__node:hover mat-icon {
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--_border) 14%, transparent);
    }

    button.pb-steps__node:focus-visible {
      outline: none;
    }

    button.pb-steps__node:focus-visible mat-icon {
      box-shadow:
        0 0 0 4px var(--mat-sys-surface),
        0 0 0 6px var(--mat-sys-primary);
    }

    /* Where things stand is told by its fill, border and label, standing
       still: a list of cards each pulsing at once reads as noise, not news. */

    .pb-steps__label {
      max-width: 100%;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
      line-height: 1.3;
    }

    .pb-steps__step:is([data-state='current'], [data-state='success'], [data-state='error'])
      .pb-steps__label {
      color: var(--mat-sys-on-surface);
      font-weight: 600;
    }

    .pb-steps__note {
      font: var(--mat-sys-label-small);
      font-feature-settings: var(--pb-font-numeric);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PbProgressSteps {
  readonly steps = input.required<readonly ProgressStep[]>();
  readonly ariaLabel = input.required<string>();
  /** Every step reports only; nothing can be selected (an archived row). */
  readonly disabled = input(false);
  readonly stepSelected = output<string>();
}
