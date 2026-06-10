import { DAY_MS, DEFAULT_INTEGRITY_MAX_FILE_SIZE_BYTES } from './constants.js';
import type { DependencyGuardOptions, ResolvedDependencyGuardOptions } from './types.js';

export const DEFAULT_OPTIONS: ResolvedDependencyGuardOptions = {
  behavior: 'warn',
  minAgeDays: 3,
  maxUnmaintainedYears: 2,
  exclude: [],
  checkDevDeps: true,
  cacheTtlMs: DAY_MS,
  disableCache: false,
  detectPhantomDependencies: true,
  enableIntegrityCheck: true,
  integrityMaxFileSizeBytes: DEFAULT_INTEGRITY_MAX_FILE_SIZE_BYTES,
  enableLiveAudit: true,
  waitForAuditOnBuild: false,
  customLogger: undefined
};

export function normalizeOptions(options: DependencyGuardOptions = {}): ResolvedDependencyGuardOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    exclude: Array.isArray(options.exclude)
      ? options.exclude.map((entry) => String(entry))
      : DEFAULT_OPTIONS.exclude
  };
}
