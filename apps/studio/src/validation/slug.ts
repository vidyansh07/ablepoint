import { RESERVED_SLUGS } from '../constants';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 96;

/** Lowercase, ASCII, hyphen-separated. Strips accents and punctuation. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

export interface SlugOptions {
  /** Top-level routes share one namespace in apps/web, so reserved route names are blocked. */
  topLevel?: boolean;
}

export function validateSlug(value: string | undefined, opts: SlugOptions = {}): true | string {
  if (!value) return 'A slug is required';
  if (value.length > SLUG_MAX) return `Slug must be ${SLUG_MAX} characters or fewer`;
  if (value !== value.toLowerCase()) return 'Slug must be lowercase';
  if (!SLUG_PATTERN.test(value)) return 'Use lowercase letters, numbers and single hyphens only (no spaces, accents or slashes)';
  if (opts.topLevel && (RESERVED_SLUGS as readonly string[]).includes(value)) return `"${value}" is reserved for a fixed page`;
  return true;
}
