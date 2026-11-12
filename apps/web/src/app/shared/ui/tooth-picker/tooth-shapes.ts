import type { TranslateService } from '@ngx-translate/core';

import { chartQuadrants, positionOf, toothName } from './teeth';

export type ToothShapeKind = 'incisor' | 'canine' | 'premolar' | 'molar';

/**
 * The outline of each kind of tooth, drawn upright for the upper jaw — root
 * at the top, crown at the bottom, toward the bite — on a 40 × 60 box. The
 * lower jaw uses the same drawings flipped, so its crowns also face the bite.
 * `width` is the drawn width in px, so a molar reads wider than an incisor.
 */
const SHAPES: Record<ToothShapeKind, { crown: string; root: string; width: number }> = {
  incisor: {
    crown: 'M11 28 Q11 25 14 25 H26 Q29 25 29 28 L28.5 49 Q28 57 20 57.5 Q12 57 11.5 49 Z',
    root: 'M14.5 26 Q15 8 20 2 Q25 8 25.5 26 Z',
    width: 35,
  },
  canine: {
    crown: 'M10 28 Q10 25 13 25 H27 Q30 25 30 28 L29 47 Q26 56 20 59 Q14 56 11 47 Z',
    root: 'M14 26 Q14.5 4 20 0 Q25.5 4 26 26 Z',
    width: 38,
  },
  premolar: {
    crown:
      'M7 28 Q7 25 10 25 H30 Q33 25 33 28 L32.5 47 Q32 56 26.5 56 Q23.5 52.5 20 55.5 Q16.5 52.5 13.5 56 Q8 56 7.5 47 Z',
    root: 'M12 26 Q12.5 7 16.5 3 L20 13 L23.5 3 Q27.5 7 28 26 Z',
    width: 40,
  },
  molar: {
    crown:
      'M3.5 28 Q3.5 24.5 7.5 24.5 H32.5 Q36.5 24.5 36.5 28 L36 46 Q35.5 56 30 56 Q26.5 51.5 23 55.5 Q20 51.5 17 55.5 Q13.5 51.5 10 56 Q4.5 56 4 46 Z',
    root: 'M7.5 25.5 Q7 9 11 3 Q14.5 11 17 25.5 Z M23 25.5 Q25.5 11 29 3 Q33 9 32.5 25.5 Z',
    width: 50,
  },
};

function shapeOf(position: number): ToothShapeKind {
  if (position <= 2) return 'incisor';
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
