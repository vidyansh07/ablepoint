import { accommodationSchemas } from './accommodation';
import { contentSchemas } from './content';
import { objectSchemas } from './objects';
import { peopleSchemas } from './people';
import { cta, footer, navigation, redirect, siteSettings } from './site';

export const schemaTypes = [siteSettings, navigation, footer, ...contentSchemas, ...peopleSchemas, ...accommodationSchemas, cta, redirect, ...objectSchemas];
