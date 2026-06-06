import { builtinModules } from 'node:module';
import path from 'node:path';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_INTEGRITY_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const CACHE_RELATIVE_PATH = path.join(
  'node_modules',
  '.cache',
  'vite-plugin-dependency-guard',
  'cache.json'
);

export const BASELINE_RELATIVE_PATH = path.join(
  'node_modules',
  '.cache',
  'vite-plugin-dependency-guard',
  'integrity-baseline.json'
);

export const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
]);
