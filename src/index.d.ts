import type { Plugin } from 'vite';

export interface DependencyGuardOptions {
  /**
   * How findings should be handled.
   * - warn: log only
   * - error: throw and stop Vite startup/build
   */
  behavior?: 'warn' | 'error';
  /** Cooldown for very new releases (in days). */
  minAgeDays?: number;
  /** When a package should be treated as unmaintained (in years). */
  maxUnmaintainedYears?: number;
  /** Package names that should be excluded from checks. */
  exclude?: string[];
  /** Whether to include devDependencies. */
  checkDevDeps?: boolean;
  /** Cache validity in milliseconds. */
  cacheTtlMs?: number;
}

export declare const DEFAULT_OPTIONS: Required<DependencyGuardOptions>;

export default function dependencyGuard(options?: DependencyGuardOptions): Plugin;
