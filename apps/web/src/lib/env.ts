import type { SiteEnv } from '@ablepoint/schemas';

const raw = import.meta.env.PUBLIC_SITE_ENV;
export const SITE_ENV: SiteEnv = raw === 'production' || raw === 'staging' ? raw : 'development';
export const IS_PRODUCTION = SITE_ENV === 'production';
export const INTAKE_ENDPOINT: string = import.meta.env.PUBLIC_INTAKE_ENDPOINT ?? '';
export const GTM_ID: string = import.meta.env.PUBLIC_GTM_ID ?? '';
export const TURNSTILE_SITEKEY: string = import.meta.env.PUBLIC_TURNSTILE_SITEKEY ?? '';
