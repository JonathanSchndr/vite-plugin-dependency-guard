import type { Plugin } from 'vite';

export interface DependencyGuardOptions {
  /**
   * Wie mit gefundenen Risiken umgegangen wird.
   * - warn: nur Log-Ausgabe
   * - error: wirft einen Fehler und stoppt Start/Build
   */
  behavior?: 'warn' | 'error';
  /** Cooldown für brandneue Releases (in Tagen). */
  minAgeDays?: number;
  /** Ab wann ein Paket als unmaintained gilt (in Jahren). */
  maxUnmaintainedYears?: number;
  /** Paketnamen, die von der Prüfung ausgenommen werden. */
  exclude?: string[];
  /** Auch devDependencies prüfen. */
  checkDevDeps?: boolean;
  /** Cache-Gültigkeit in Millisekunden. */
  cacheTtlMs?: number;
}

export declare const DEFAULT_OPTIONS: Required<DependencyGuardOptions>;

export default function dependencyGuard(options?: DependencyGuardOptions): Plugin;
