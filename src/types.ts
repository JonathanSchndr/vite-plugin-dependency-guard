export interface DependencyGuardOptions {
  behavior?: 'warn' | 'error';
  minAgeDays?: number;
  maxUnmaintainedYears?: number;
  exclude?: string[];
  checkDevDeps?: boolean;
  cacheTtlMs?: number;
  disableCache?: boolean;
  detectPhantomDependencies?: boolean;
  enableIntegrityCheck?: boolean;
  integrityMaxFileSizeBytes?: number;
  enableLiveAudit?: boolean;
  waitForAuditOnBuild?: boolean;
  /**
   * Override the output mechanism used by the plugin. When omitted the plugin
   * writes directly to `console` so output is visible regardless of the host
   * framework's Vite `logLevel` configuration (e.g. Nuxt silences Vite's
   * `logger.info` by default).
   */
  customLogger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export interface RegistryData {
  time?: Record<string, string>;
  'dist-tags'?: {
    latest?: string;
  };
}

export interface CacheEntry {
  cachedAt: number;
  data: RegistryData;
}

export interface OsvVulnerability {
  id?: string;
  summary?: string;
  aliases?: string[];
}

export interface OsvCacheEntry {
  cachedAt: number;
  vulnerabilities: OsvVulnerability[];
}

export interface CacheData {
  packages: Record<string, CacheEntry>;
  osv: Record<string, OsvCacheEntry>;
}

export interface BaselineFileEntry {
  hash: string;
  size: number;
}

export interface IntegrityBaseline {
  files: Record<string, BaselineFileEntry>;
}

export interface ViteResolvedConfig {
  root?: string;
  command?: string;
  build?: {
    ssr?: boolean | string;
  };
}

export interface HashCacheEntry {
  mtimeMs: number;
  size: number;
  hash: string;
}

export interface DependencyGuardPlugin {
  name: string;
  configResolved(config: ViteResolvedConfig): Promise<void>;
  resolveId?(source: string, importer: string | undefined, options?: { ssr?: boolean }): null;
  load?(id: string, options?: { ssr?: boolean }): Promise<null>;
  buildStart?(): Promise<void>;
}

export interface GuardLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  reportIssues(messages: string[]): void;
}

/**
 * The fully resolved options after merging user input with defaults.
 * `customLogger` remains optional since it genuinely defaults to `undefined`.
 */
export type ResolvedDependencyGuardOptions = Required<Omit<DependencyGuardOptions, 'customLogger'>> & {
  customLogger?: DependencyGuardOptions['customLogger'];
};
