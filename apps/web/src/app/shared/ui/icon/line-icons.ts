/**
 * Line icons, drawn from Tabler Icons v3.31.0 (outline set, MIT licence,
 * © Paweł Kuna — https://tabler.io/icons). Each entry is the `d` of the
 * icon's paths, copied as published, minus the invisible 24×24 bounding
 * path every Tabler file starts with.
 *
 * Kept as data rather than a dependency: the app ships only the icons it
 * draws. To add one, copy its `<path d>` values from
 * `@tabler/icons/icons/outline/<name>.svg` and key it by Tabler's own name.
 * Hyphenated names cannot collide with Material Symbols ligatures, which use
 * underscores — `pb-banner` relies on that to tell the two apart.
 */
export const LINE_ICONS = {
  'alert-circle': ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 8v4', 'M12 16h.01'],
  'alert-triangle': [
    'M12 9v4',
    'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z',
    'M12 16h.01',
  ],
  'arrow-left': ['M5 12l14 0', 'M5 12l6 6', 'M5 12l6 -6'],
  'arrow-back-up': ['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1'],
  box: [
    'M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5',
    'M12 12l8 -4.5',
    'M12 12l0 9',
    'M12 12l-8 -4.5',
  ],
  'circle-check': ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
  dental: [
    'M12 5.5c-1.074 -.586 -2.583 -1.5 -4 -1.5c-2.1 0 -4 1.247 -4 5c0 4.899 1.056 8.41 2.671 10.537c.573 .756 1.97 .521 2.567 -.236c.398 -.505 .819 -1.439 1.262 -2.801c.292 -.771 .892 -1.504 1.5 -1.5c.602 0 1.21 .737 1.5 1.5c.443 1.362 .864 2.295 1.262 2.8c.597 .759 2 .993 2.567 .237c1.615 -2.127 2.671 -5.637 2.671 -10.537c0 -3.74 -1.908 -5 -4 -5c-1.423 0 -2.92 .911 -4 1.5z',
    'M12 5.5l3 1.5',
  ],
  eye: [
    'M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
    'M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6',
  ],
  'eye-off': [
    'M10.585 10.587a2 2 0 0 0 2.829 2.828',
    'M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87',
    'M3 3l18 18',
  ],
  flask: ['M9 3l6 0', 'M10 9l4 0', 'M10 3v6l-4 11a.7 .7 0 0 0 .5 1h11a.7 .7 0 0 0 .5 -1l-4 -11v-6'],
  'info-circle': ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 9h.01', 'M11 12h1v4h1'],
  lock: [
    'M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z',
    'M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0',
    'M8 11v-4a4 4 0 1 1 8 0v4',
  ],
  'login-2': [
    'M9 8v-2a2 2 0 0 1 2 -2h7a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2v-2',
    'M3 12h13l-3 -3',
    'M13 15l3 -3',
  ],
  pencil: ['M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4', 'M13.5 6.5l4 4'],
  'shield-lock': [
    'M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3',
    'M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M12 12l0 2.5',
  ],
  user: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'],
  users: [
    'M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    'M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2',
    'M16 3.13a4 4 0 0 1 0 7.75',
    'M21 21v-2a4 4 0 0 0 -3 -3.85',
  ],
  x: ['M18 6l-12 12', 'M6 6l12 12'],
  'layout-dashboard': [
    'M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1',
    'M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1',
    'M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1',
    'M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1',
  ],
  'calendar-check': [
    'M11.5 21h-5.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6',
    'M16 3v4',
    'M8 3v4',
    'M4 11h16',
    'M15 19l2 2l4 -4',
  ],
  'ruler-2': [
    'M17 3l4 4l-14 14l-4 -4z',
    'M16 7l-1.5 -1.5',
    'M13 10l-1.5 -1.5',
    'M10 13l-1.5 -1.5',
    'M7 16l-1.5 -1.5',
  ],
  packages: [
    'M7 16.5l-5 -3l5 -3l5 3v5.5l-5 3z',
    'M2 13.5v5.5l5 3',
    'M7 16.545l5 -3.03',
    'M17 16.5l-5 -3l5 -3l5 3v5.5l-5 3z',
    'M12 19l5 3',
    'M17 16.5l5 -3',
    'M12 13.5v-5.5l-5 -3l5 -3l5 3v5.5',
    'M7 5.03v5.455',
    'M12 8l5 -3',
  ],
  'chart-bar': [
    'M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
    'M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
    'M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
    'M4 20h14',
  ],
  settings: [
    'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z',
    'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
  ],
  search: ['M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  'layout-sidebar-right-collapse': [
    'M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z',
    'M15 4v16',
    'M9 10l2 2l-2 2',
  ],
  'layout-sidebar-right-expand': [
    'M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z',
    'M15 4v16',
    'M10 10l-2 2l2 2',
  ],
  logout: [
    'M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2',
    'M9 12h12l-3 -3',
    'M18 15l3 -3',
  ],
  'user-circle': [
    'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
    'M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855',
  ],
  'chevron-down': ['M6 9l6 6l6 -6'],
  'corner-down-left': ['M18 6v6a3 3 0 0 1 -3 3h-10l4 -4m0 8l-4 -4'],
  'arrow-up': ['M12 5l0 14', 'M18 11l-6 -6', 'M6 11l6 -6'],
  'arrow-down': ['M12 5l0 14', 'M18 13l-6 6', 'M6 13l6 6'],
  plus: ['M12 5l0 14', 'M5 12l14 0'],
  'user-plus': [
    'M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0',
    'M16 19h6',
    'M19 16v6',
    'M6 21v-2a4 4 0 0 1 4 -4h4',
  ],
  refresh: ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  'wifi-off': [
    'M12 18l.01 0',
    'M9.172 15.172a4 4 0 0 1 5.656 0',
    'M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2',
    'M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.101 -.92a12 12 0 0 1 10.325 3.374',
    'M3 3l18 18',
  ],
  inbox: [
    'M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z',
    'M4 13h3l3 3h4l3 -3h3',
  ],
  'file-search': [
    'M14 3v4a1 1 0 0 0 1 1h4',
    'M12 21h-5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v4.5',
    'M16.5 17.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
    'M18.5 19.5l2.5 2.5',
  ],
  calendar: [
    'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z',
    'M16 3v4',
    'M8 3v4',
    'M4 11h16',
    'M11 15h1',
    'M12 15v3',
  ],
  'chevron-left': ['M15 6l-6 6l6 6'],
  'chevron-right': ['M9 6l6 6l-6 6'],
  check: ['M5 12l5 5l10 -10'],
  clock: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 7v5l3 3'],
  phone: [
    'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2',
  ],
  history: ['M12 8l0 4l2 2', 'M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5'],
  'calendar-x': [
    'M13 21h-7a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6.5',
    'M16 3v4',
    'M8 3v4',
    'M4 11h16',
    'M22 22l-5 -5',
    'M17 22l5 -5',
  ],
  folder: ['M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2'],
  'user-search': [
    'M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0',
    'M6 21v-2a4 4 0 0 1 4 -4h1.5',
    'M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M20.2 20.2l1.8 1.8',
  ],
  'clipboard-heart': [
    'M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2',
    'M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z',
    'M11.993 16.75l2.747 -2.815a1.9 1.9 0 0 0 0 -2.632a1.775 1.775 0 0 0 -2.56 0l-.183 .188l-.183 -.189a1.775 1.775 0 0 0 -2.56 0a1.899 1.899 0 0 0 0 2.632l2.738 2.825z',
  ],
  selector: ['M8 9l4 -4l4 4', 'M16 15l-4 4l-4 -4'],
  'user-check': [
    'M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0',
    'M6 21v-2a4 4 0 0 1 4 -4h4',
    'M15 19l2 2l4 -4',
  ],
  'trending-up': ['M3 17l6 -6l4 4l8 -8', 'M14 7l7 0l0 7'],
  'gender-female': ['M12 9m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0', 'M12 14v7', 'M9 18h6'],
  'gender-male': [
    'M10 14m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0',
    'M19 5l-5.4 5.4',
    'M19 5h-5',
    'M19 5v5',
  ],
  sun: [
    'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    'M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7',
  ],
  moon: ['M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z'],
  'device-desktop': [
    'M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10z',
    'M7 20h10',
    'M9 16v4',
    'M15 16v4',
  ],
  key: [
    'M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z',
    'M15 9h.01',
  ],
  palette: [
    'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25',
    'M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  ],
  at: [
    'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    'M16 12v1.5a2.5 2.5 0 0 0 5 0v-1.5a9 9 0 1 0 -5.5 8.28',
  ],
} as const satisfies Record<string, readonly string[]>;

export type LineIconName = keyof typeof LINE_ICONS;

export function isLineIcon(name: string): name is LineIconName {
  return Object.hasOwn(LINE_ICONS, name);
}

/**
 * The Material Symbols names the forms already pass as `prefixIcon`, drawn
 * as line icons. Unmapped names still render, as the light Material glyph.
 */
const LINE_FOR_MATERIAL: Readonly<Record<string, LineIconName>> = {
  call: 'phone',
  smartphone: 'phone',
  person: 'user',
  folder: 'folder',
  lock: 'lock',
  person_search: 'user-search',
  medical_information: 'clipboard-heart',
  calendar_month: 'calendar',
  event: 'calendar',
};

/** A line icon for `name`: itself if it is one, its twin if it is a Material name. */
export function lineIconFor(name: string | null | undefined): LineIconName | null {
  if (!name) return null;
  return isLineIcon(name) ? name : (LINE_FOR_MATERIAL[name] ?? null);
}
