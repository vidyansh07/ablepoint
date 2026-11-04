import { normalisePath } from '@ablepoint/schemas';

export const REDIRECT_STATUSES = [301, 302, 308, 410] as const;

export function validateRedirectFrom(value: string | undefined): true | string {
  if (!value) return 'Enter the old path';
  if (!value.startsWith('/')) return 'Start with "/"';
  if (/[?*:()]/.test(value)) return 'No query strings or wildcards. Use an exact path.';
  return value === normalisePath(value) ? true : `Use lowercase with a trailing slash (${normalisePath(value)})`;
}

export function validateRedirectTo(
  to: string | undefined,
  from: string | undefined,
  status: number | undefined,
): true | string {
  if (status === 410) return true;
  if (!to) return 'Enter the new path';
  if (!to.startsWith('/')) return 'Redirects must stay on this site: start with "/"';
  const [path = ''] = to.split('#');
  if (to !== normalisePath(to)) return `Use lowercase with a trailing slash (${normalisePath(to)})`;
  if (from && path === from) return 'A path cannot redirect to itself';
  return true;
}

/** Internal path for a CTA / nav item. Same rules without trailing-slash normalisation of anchors. */
export function validateInternalPath(value: string | undefined): true | string {
  if (!value) return true;
  if (!value.startsWith('/') || value.startsWith('//')) return 'Start with a single "/"';
  if (/\s/.test(value)) return 'No spaces';
  return true;
}
