import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { ApproveForPublicationAction } from './src/approve-action';
import { DOCUMENT_TYPES, SINGLETON_TYPES } from './src/constants';
import { readStudioEnv } from './src/env';
import { schemaTypes } from './src/schemas';
import { structure } from './src/structure';

// Explicit references: Sanity replaces only literal `process.env.SANITY_STUDIO_*` at build time.
const { projectId, dataset } = readStudioEnv({
  SANITY_STUDIO_PROJECT_ID: process.env.SANITY_STUDIO_PROJECT_ID,
  SANITY_STUDIO_DATASET: process.env.SANITY_STUDIO_DATASET,
  SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS: process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS,
});

const singletons: readonly string[] = SINGLETON_TYPES;
const reviewable: readonly string[] = DOCUMENT_TYPES;

export default defineConfig({
  name: 'ablepoint',
  title: 'AblePoint Australia',
  projectId,
  dataset,
  plugins: [structureTool({ structure })],
  schema: {
    types: schemaTypes,
    // Singletons cannot be created from the "new document" menu.
    templates: (templates) => templates.filter(({ schemaType }) => !singletons.includes(schemaType)),
  },
  document: {
    actions: (input, { schemaType }) => {
      // Singletons cannot be deleted, duplicated or unpublished.
      const base = singletons.includes(schemaType) ? input.filter(({ action }) => action && !['unpublish', 'delete', 'duplicate'].includes(action)) : input;
      // Every reviewable type gets the Approve action (soft control: availability depends on the reviewer allow-list).
      return reviewable.includes(schemaType) ? [...base, ApproveForPublicationAction] : base;
    },
  },
});
