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
}

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
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

export interface ViteLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

export interface ViteResolvedConfig {
  root?: string;
  command?: 'serve' | 'build';
  logger?: ViteLogger;
}

export interface HashCacheEntry {
  mtimeMs: number;
  size: number;
  hash: string;
}

export interface DependencyGuardPlugin {
  name: string;
  configResolved(config: ViteResolvedConfig): Promise<void>;
  resolveId?(source: string): null;
  load?(id: string): Promise<null>;
  buildStart?(): Promise<void>;
}

export interface GuardLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  reportIssues(messages: string[]): void;
}
