import { defineCliConfig } from 'sanity/cli';
import { readStudioEnv } from './src/env';

const { projectId, dataset } = readStudioEnv({
  SANITY_STUDIO_PROJECT_ID: process.env.SANITY_STUDIO_PROJECT_ID,
  SANITY_STUDIO_DATASET: process.env.SANITY_STUDIO_DATASET,
});

export default defineCliConfig({ api: { projectId, dataset } });
