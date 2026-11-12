import type { TranslateService } from '@ngx-translate/core';

import { chartQuadrants, positionOf, toothName } from './teeth';

export type ToothShapeKind = 'incisor' | 'lateral' | 'canine' | 'premolar' | 'molar';

/**
 * Each kind of tooth as it looks from the front, drawn upright for the upper
 * jaw on a 40 × 64 box: the roots at the top, tapering to their tips; the
 * crown below, toward the bite, with its real outline — a straight incisal
 * edge, a canine's point, a premolar's two cusps, a molar's three — and a
 * line of detail (the enamel's highlight, the grooves between cusps). The
 * lower jaw uses the same drawings flipped, so its crowns also face the bite.
 * `width` is the drawn width in px, so a molar reads wider than an incisor.
 */
const SHAPES: Record<
  ToothShapeKind,
  { crown: string; root: string; detail: string; width: number }
> = {
  incisor: {
    root: 'M15 32 C14 21 16 9 20 1.5 C24 9 26 21 25 32 Z',
    crown:
      'M13 30 C11.8 30.6 11.3 32.5 11.3 34.5 C11 44 11.2 52 12.6 58 C13.6 61.6 16.2 62.8 20 62.8 C23.8 62.8 26.4 61.6 27.4 58 C28.8 52 29 44 28.7 34.5 C28.7 32.5 28.2 30.6 27 30 C22.5 31.6 17.5 31.6 13 30 Z',
    detail: 'M16.2 36 C15.6 44 15.7 51.5 16.6 57',
    width: 36,
  },
  lateral: {
    root: 'M15.5 32 C14.5 22 16.5 10 20 3 C23.5 10 25.5 22 24.5 32 Z',
    crown:
      'M13.5 30 C12.3 30.6 11.8 32.4 11.8 34.4 C11.6 43 11.9 50.5 13.2 56 C14.2 59.8 16.6 61.3 20 61.3 C23.4 61.3 25.8 59.8 26.8 56 C28.1 50.5 28.4 43 28.2 34.4 C28.2 32.4 27.7 30.6 26.5 30 C22.3 31.5 17.7 31.5 13.5 30 Z',
    detail: 'M16.6 36 C16 43 16.1 50 17 55',
    width: 32,
  },
  canine: {
    root: 'M14.5 32 C13.5 19 16 6.5 20 0.5 C24 6.5 26.5 19 25.5 32 Z',
    crown:
      'M12.5 30 C11 31 10.4 33.8 10.4 37 C10.4 46 12 53 15 57.8 C16.9 60.8 18.5 63.2 20 63.8 C21.5 63.2 23.1 60.8 25 57.8 C28 53 29.6 46 29.6 37 C29.6 33.8 29 31 27.5 30 C22.9 31.6 17.1 31.6 12.5 30 Z',
    detail: 'M20 36 C19.6 44 19.7 52 20 60',
    width: 38,
  },
  premolar: {
    root: 'M12 32 C11.8 21 13.8 10 17 3.5 C18.6 8.5 19.6 14.5 20 18.5 C20.4 14.5 21.4 8.5 23 3.5 C26.2 10 28.2 21 28 32 Z',
    crown:
      'M10 30 C8.2 31 7.2 34 7.2 38 C7.2 46 8.2 52.6 11.2 56.8 C13 59.4 15.2 60.2 17.1 58.8 C18.5 57.7 19.3 58.1 20 59.1 C20.7 58.1 21.5 57.7 22.9 58.8 C24.8 60.2 27 59.4 28.8 56.8 C31.8 52.6 32.8 46 32.8 38 C32.8 34 31.8 31 30 30 C23.8 31.7 16.2 31.7 10 30 Z',
    detail: 'M13.8 54.4 C16.6 52.2 23.4 52.2 26.2 54.4',
    width: 40,
  },
  molar: {
    root: 'M6.5 32 C6 21.5 7.6 10.5 10.6 3.5 C13.2 9.5 15.2 19.5 16.6 32 Z M23.4 32 C24.8 19.5 26.8 9.5 29.4 3.5 C32.4 10.5 34 21.5 33.5 32 Z M16.6 32 C17.4 23 18.6 16 20 11.5 C21.4 16 22.6 23 23.4 32 Z',
    crown:
      'M5 30 C3.2 31 2.6 35 2.6 39 C2.6 47 3.6 53 6.6 57 C8.6 59.6 11.2 60.2 13.2 58.2 C14.6 56.9 15.6 57.6 16.6 59 C18 60.6 20 60.6 21.4 59 C22.6 57.6 23.8 56.9 25.4 58.2 C27.8 60.2 31 59.6 33.4 57 C36.4 53 37.4 47 37.4 39 C37.4 35 36.8 31 35 30 C27 31.9 13 31.9 5 30 Z',
    detail: 'M8.8 54.2 C12.6 51.4 16.6 52.2 20 54.2 C23.4 52.2 27.4 51.4 31.2 54.2',
    width: 50,
  },
};

function shapeOf(position: number): ToothShapeKind {
  if (position === 1) return 'incisor';
  if (position === 2) return 'lateral';
  if (position === 3) return 'canine';
  if (position <= 5) return 'premolar';
  return 'molar';
}

export interface ToothView {
  fdi: number;
  position: number;
  kind: ToothShapeKind;
  crown: string;
  root: string;
  detail: string;
  width: number;
  /** How far the tooth sits from the bite line, so each row bends like an arch. */
  lift: number;
  /** "6 upper right", for a screen reader and the hover title. */
  name: string;
}

export interface JawView {
  id: 'upper' | 'lower';
  /** i18n key. */
  label: string;
  teeth: ToothView[];
}

/**
 * The two rows of the chart as the dentist faces the patient: upper over
 * lower, each the patient's right (the viewer's left) then their left, every
 * tooth with its drawing and its place on the arch.
 */
export function mouthView(i18n: TranslateService): JawView[] {
  const [upperRight, upperLeft, lowerRight, lowerLeft] = chartQuadrants(i18n);
  const view = (fdi: number): ToothView => {
    const position = positionOf(fdi);
    const kind = shapeOf(position);
    const shape = SHAPES[kind];
    return {
      fdi,
      position,
      kind,
      crown: shape.crown,
      root: shape.root,
      detail: shape.detail,
      width: shape.width,
      lift: Math.round((position - 1) * (position - 1) * 0.7),
      name: toothName(fdi, i18n),
    };
  };
  return [
    {
      id: 'upper',
      label: 'tooth.upperJaw',
      teeth: [...upperRight.teeth, ...upperLeft.teeth].map(view),
    },
    {
      id: 'lower',
      label: 'tooth.lowerJaw',
      teeth: [...lowerRight.teeth, ...lowerLeft.teeth].map(view),
    },
  ];
}
