#!/usr/bin/env node
// Runs the TypeScript sources directly through tsx, so there is no build step. Nothing is written to stdout here.
import { register } from 'tsx/esm/api';

register();
await import('../src/main.ts');
