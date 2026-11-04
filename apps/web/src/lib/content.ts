import { isDraftMarked, type Reviewable } from '@ablepoint/schemas';
import { SITE_ENV } from './env';
import { isShown } from './gate';

export function visible<T extends Reviewable>(items: T[]): T[] {
  return items.filter((i) => isShown(i, SITE_ENV));
}

export function draftMarked(doc: Reviewable): boolean {
  return isDraftMarked(doc, SITE_ENV);
}
