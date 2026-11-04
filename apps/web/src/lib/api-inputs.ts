import { site } from '../data/site';
import { services } from '../data/services';
import { regions } from '../data/regions';
import { guides } from '../data/guides';
import { posts } from '../data/posts';
import { vacancies } from '../data/vacancies';
import { SITE_ENV } from './env';
import type { ApiInputs } from './api';

export const apiInputs = (origin: string): ApiInputs => ({ site, services, regions, guides, posts, vacancies, env: SITE_ENV, origin, now: new Date() });
