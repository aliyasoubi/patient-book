import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { RecentPatientsService } from '../patients/data/recent-patients.service';
import { PersianNumberPipe } from '../../shared/pipes/persian-number.pipe';
import { PbIcon } from '../../shared/ui';

/**
 * The files opened most recently this session, one tap back into each — the
 * patient the desk was just on the phone about. Kept for the session only
 * (RecentPatientsService), and gone at sign-out.
 */
@Component({
  selector: 'pb-dashboard-recent',
  standalone: true,
  imports: [PersianNumberPipe, RouterLink, TranslatePipe, PbIcon],
  template: `
    <header class="head">
      <h2>{{ 'dashboard.recentTitle' | translate }}</h2>
      <a class="head__link" routerLink="/patients">
        {{ 'dashboard.recentAll' | translate }}
        <pb-icon name="arrow-left" [size]="16" />
      </a>
    </header>
    @if (recent.items().length) {
      <ul class="list">
        @for (p of recent.items(); track p.id) {
          <li>
            <a class="file" [routerLink]="['/patients', p.id]">
              <span class="file__avatar" aria-hidden="true">{{ p.fullName.trim().charAt(0) }}</span>
              <span class="file__text">
                <strong>{{ p.fullName || ('patient.unnamed' | translate) }}</strong>
                <small>{{ 'labs.patientFile' | translate: { fileNo: (p.fileNo | faNum) } }}</small>
              </span>
              <pb-icon class="file__go" name="chevron-left" [size]="16" />
            </a>
          </li>
        }
      </ul>
    } @else {
      <p class="empty">
        <pb-icon name="history" [size]="18" />
        {{ 'dashboard.recentEmpty' | translate }}
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--pb-space-3);
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--pb-space-2);

      h2 {
        margin: 0;
        color: var(--pb-graphite);
        font-size: 0.9375rem;
        font-weight: 800;
      }
    }

    .head__link {
      display: inline-flex;
      align-items: center;
      gap: var(--pb-space-1);
      color: var(--pb-brand-strong);
      font-size: 0.75rem;
      font-weight: 700;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .file {
      display: flex;
      align-items: center;
      gap: var(--pb-space-3);
      padding: var(--pb-space-2);
      border-radius: 12px;
      color: inherit;
      text-decoration: none;
      transition: background-color 160ms var(--pb-ease-standard);

      &:hover {
        background: var(--pb-neutral-50);
      }

      &:hover .file__go {
        color: var(--pb-graphite);
        translate: -3px 0;
      }
    }

    .file__avatar {
      display: inline-grid;
      flex: 0 0 auto;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: 10px;
      background: var(--pb-neutral-100);
      color: var(--pb-neutral-600);
      font-weight: 800;
    }

    .file__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-inline-size: 0;

      strong {
        overflow: hidden;
        color: var(--pb-graphite);
        font-size: 0.8125rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        color: var(--pb-neutral-500);
        font-size: 0.75rem;
      }
    }

    .file__go {
      color: var(--pb-neutral-300);
      transition:
        color 160ms var(--pb-ease-standard),
        translate 220ms var(--pb-ease-spring);
    }

    .empty {
      display: flex;
      align-items: flex-start;
      gap: var(--pb-space-2);
      margin: 0;
      color: var(--pb-neutral-500);
      font-size: 0.8125rem;
      line-height: 1.8;

      pb-icon {
        flex: 0 0 auto;
        margin-block-start: 3px;
        color: var(--pb-neutral-400);
      }
    }
  `,
})
export class DashboardRecent {
  protected readonly recent = inject(RecentPatientsService);
}
