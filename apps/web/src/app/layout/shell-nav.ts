import type { UserRole } from '../core/models/common.model';
import type { LineIconName } from '../shared/ui';

/** Where a section sits in the sidebar: the day's work, the books, the practice. */
export type NavGroup = 'work' | 'files' | 'practice';

export interface NavItem {
  path: string;
  label: string;
  icon: LineIconName;
  group: NavGroup;
  /** Shown in the phone's bottom bar; the rest live behind «more». */
  primary: boolean;
  roles?: UserRole[];
}

/** Literal keys, so the i18n check sees every one. */
export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: 'nav.group.work',
  files: 'nav.group.files',
  practice: 'nav.group.practice',
};

/**
 * The app's sections, in sidebar order. The sidebar, the phone's bottom bar
 * and the spotlight's "go to" rows all read this one list.
 */
export const SHELL_NAV: readonly NavItem[] = [
  {
    path: '/dashboard',
    label: 'nav.dashboard',
    icon: 'layout-dashboard',
    group: 'work',
    primary: true,
  },
  { path: '/patients', label: 'nav.patients', icon: 'users', group: 'work', primary: true },
  { path: '/surgery', label: 'nav.surgery', icon: 'calendar-check', group: 'work', primary: true },
  { path: '/labs', label: 'nav.labs', icon: 'flask', group: 'work', primary: false },
  { path: '/implants', label: 'nav.implants', icon: 'dental', group: 'files', primary: true },
  { path: '/ortho', label: 'nav.ortho', icon: 'ruler-2', group: 'files', primary: false },
  {
    path: '/inventory',
    label: 'nav.inventory',
    icon: 'packages',
    group: 'practice',
    primary: false,
  },
  // The practice's numbers: looked at now and then, not worked from.
  { path: '/stats', label: 'nav.stats', icon: 'chart-bar', group: 'practice', primary: false },
  { path: '/settings', label: 'nav.settings', icon: 'settings', group: 'practice', primary: false },
];
