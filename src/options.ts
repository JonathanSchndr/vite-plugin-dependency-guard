import { DAY_MS, DEFAULT_INTEGRITY_MAX_FILE_SIZE_BYTES } from './constants.js';
import type { DependencyGuardOptions } from './types.js';

export const DEFAULT_OPTIONS: Required<DependencyGuardOptions> = {
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
  waitForAuditOnBuild: false
};

export function normalizeOptions(options: DependencyGuardOptions = {}): Required<DependencyGuardOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    exclude: Array.isArray(options.exclude)
      ? options.exclude.map((entry) => String(entry))
      : DEFAULT_OPTIONS.exclude
  };
}
