import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';

const ansi = {
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INTEGRITY_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export interface DependencyGuardOptions {
  behavior?: 'warn' | 'error';
  minAgeDays?: number;
  maxUnmaintainedYears?: number;
  exclude?: string[];
  checkDevDeps?: boolean;
  cacheTtlMs?: number;
  detectPhantomDependencies?: boolean;
  enableIntegrityCheck?: boolean;
  integrityMaxFileSizeBytes?: number;
  enableLiveAudit?: boolean;
  waitForAuditOnBuild?: boolean;
}

export const DEFAULT_OPTIONS: Required<DependencyGuardOptions> = {
  behavior: 'warn',
  minAgeDays: 3,
  maxUnmaintainedYears: 2,
  exclude: [],
  checkDevDeps: true,
  cacheTtlMs: DAY_MS,
  detectPhantomDependencies: true,
  enableIntegrityCheck: true,
  integrityMaxFileSizeBytes: DEFAULT_INTEGRITY_MAX_FILE_SIZE_BYTES,
  enableLiveAudit: true,
  waitForAuditOnBuild: false
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface RegistryData {
  time?: Record<string, string>;
  'dist-tags'?: {
    latest?: string;
  };
}

interface CacheEntry {
  cachedAt: number;
  data: RegistryData;
}

interface OsvVulnerability {
  id?: string;
  summary?: string;
}

interface OsvCacheEntry {
  cachedAt: number;
  vulnerabilities: OsvVulnerability[];
}

interface CacheData {
  packages: Record<string, CacheEntry>;
  osv: Record<string, OsvCacheEntry>;
}

interface BaselineFileEntry {
  hash: string;
  size: number;
}

interface IntegrityBaseline {
  files: Record<string, BaselineFileEntry>;
}

interface ViteLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

interface ViteResolvedConfig {
  root?: string;
  command?: 'serve' | 'build';
  logger?: ViteLogger;
}

interface HashCacheEntry {
  mtimeMs: number;
  size: number;
  hash: string;
}

interface VitePluginResolveResult {
  id: string;
}

interface DependencyGuardPlugin {
  name: string;
  configResolved(config: ViteResolvedConfig): Promise<void>;
  resolveId?(source: string): null;
  load?(id: string): Promise<null>;
  buildStart?(): Promise<void>;
}

const CACHE_RELATIVE_PATH = path.join(
  'node_modules',
  '.cache',
  'vite-plugin-dependency-guard',
  'cache.json'
);

const BASELINE_RELATIVE_PATH = path.join(
  'node_modules',
  '.cache',
  'vite-plugin-dependency-guard',
  'integrity-baseline.json'
);

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function normalizeOptions(options: DependencyGuardOptions = {}): Required<DependencyGuardOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    exclude: Array.isArray(options.exclude)
      ? options.exclude.map((entry) => String(entry))
      : DEFAULT_OPTIONS.exclude
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

async function loadCache(cacheFile: string): Promise<CacheData> {
  try {
    const cache = await readJson<Partial<CacheData>>(cacheFile);
    return {
      packages: cache.packages ?? {},
      osv: cache.osv ?? {}
    };
  } catch {
    return { packages: {}, osv: {} };
  }
}

async function saveCache(cacheFile: string, cache: CacheData): Promise<void> {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
}

async function loadBaseline(filePath: string): Promise<IntegrityBaseline> {
  try {
    const baseline = await readJson<Partial<IntegrityBaseline>>(filePath);
    return {
      files: baseline.files ?? {}
    };
  } catch {
    return { files: {} };
  }
}

async function saveBaseline(filePath: string, baseline: IntegrityBaseline): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(baseline, null, 2), 'utf8');
}

function parsePackageNames(packageJson: PackageJson, checkDevDeps: boolean): string[] {
  const names = new Set(Object.keys(packageJson.dependencies ?? {}));

  if (checkDevDeps) {
    for (const dependency of Object.keys(packageJson.devDependencies ?? {})) {
      names.add(dependency);
    }
  }

  return [...names];
}

function parseDirectDependencyNames(packageJson: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {})
  ]);
}

function parseDate(value: string | null | undefined): number | null {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getLatestPublishDate(registryData: RegistryData | undefined): Date | null {
  const allTimestamps = Object.entries(registryData?.time ?? {})
    .filter(([key]) => key !== 'created' && key !== 'modified')
    .map(([, value]) => parseDate(value))
    .filter((value): value is number => value !== null);

  if (!allTimestamps.length) {
    return null;
  }

  return new Date(Math.max(...allTimestamps));
}

function resolveIssues(
  packageName: string,
  registryData: RegistryData | undefined,
  now: number,
  options: Required<DependencyGuardOptions>
): string[] {
  const issues: string[] = [];
  const latestTag = registryData?.['dist-tags']?.latest;
  const latestReleaseDateRaw = latestTag ? registryData?.time?.[latestTag] : null;
  const latestReleaseDate = parseDate(latestReleaseDateRaw);

  if (latestReleaseDate !== null) {
    const ageMs = now - latestReleaseDate;

    if (ageMs < options.minAgeDays * DAY_MS) {
      const ageDays = Math.max(0, Math.floor(ageMs / DAY_MS));
      issues.push(
        `${packageName}@${latestTag} is only ${ageDays} days old (minAgeDays=${options.minAgeDays}).`
      );
    }
  }

  const latestPublishedAt = getLatestPublishDate(registryData);
  if (latestPublishedAt) {
    const unmaintainedMs = now - latestPublishedAt.getTime();
    const thresholdMs = options.maxUnmaintainedYears * 365 * DAY_MS;
    if (unmaintainedMs > thresholdMs) {
      const years = (unmaintainedMs / (365 * DAY_MS)).toFixed(1);
      issues.push(
        `${packageName} appears unmaintained: last release was ${years} years ago (maxUnmaintainedYears=${options.maxUnmaintainedYears}).`
      );
    }
  }

  return issues;
}

async function fetchRegistryPackage(
  packageName: string
): Promise<{ data: RegistryData } | { error: string }> {
  const encodedName = packageName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  const response = await fetch(`https://registry.npmjs.org/${encodedName}`);

  if (!response.ok) {
    if (response.status === 404) {
      return { error: `Package ${packageName} was not found in the npm registry.` };
    }

    return {
      error: `Registry request for ${packageName} failed (HTTP ${response.status}).`
    };
  }

  return { data: (await response.json()) as RegistryData };
}

function createLogger(config: ViteResolvedConfig, options: Required<DependencyGuardOptions>) {
  const log = config.logger;
  const prefix = ansi.bold(ansi.cyan('[vite-plugin-dependency-guard]'));

  return {
    info(message: string) {
      log?.info?.(`${prefix} ${message}`);
    },
    warn(message: string) {
      log?.warn?.(`${prefix} ${ansi.yellow(message)}`);
    },
    error(message: string) {
      log?.error?.(`${prefix} ${ansi.red(message)}`);
    },
    reportIssues(messages: string[]) {
      const block = messages.map((line) => `  • ${line}`).join('\n');
      const text = `Dependency risks detected:\n${block}`;
      if (options.behavior === 'error') {
        this.error(text);
        throw new Error(text);
      }
      this.warn(text);
    }
  };
}

function extractPackageName(source: string): string | null {
  if (!source || source.startsWith('.') || source.startsWith('/') || source.startsWith('\0')) {
    return null;
  }

  if (source.includes(':')) {
    return null;
  }

  const [first, second] = source.split('/');
  if (!first) {
    return null;
  }

  if (first.startsWith('@')) {
    return second ? `${first}/${second}` : null;
  }

  return first;
}

function normalizeFileKey(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function isNodeModuleFile(filePath: string): boolean {
  return filePath.includes(`${path.sep}node_modules${path.sep}`);
}

async function computeFileHash(
  filePath: string,
  maxFileSizeBytes: number,
  hashCache: Map<string, HashCacheEntry>
): Promise<{ hash: string; size: number } | null> {
  const fileStat = await stat(filePath);

  if (!fileStat.isFile() || fileStat.size > maxFileSizeBytes) {
    return null;
  }

  const cached = hashCache.get(filePath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return { hash: cached.hash, size: cached.size };
  }

  const content = await readFile(filePath);
  const hash = createHash('sha256').update(content).digest('hex');

  hashCache.set(filePath, {
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    hash
  });

  return { hash, size: fileStat.size };
}

async function fetchOsvBatch(
  packageNames: string[]
): Promise<Record<string, OsvVulnerability[]>> {
  if (!packageNames.length) {
    return {};
  }

  const response = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      queries: packageNames.map((packageName) => ({
        package: {
          name: packageName,
          ecosystem: 'npm'
        }
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`OSV request failed (HTTP ${response.status}).`);
  }

  const json = (await response.json()) as {
    results?: Array<{ vulns?: OsvVulnerability[] }>;
  };

  const resultMap: Record<string, OsvVulnerability[]> = {};
  for (let index = 0; index < packageNames.length; index += 1) {
    resultMap[packageNames[index]] = json.results?.[index]?.vulns ?? [];
  }

  return resultMap;
}

async function runLiveAudit(params: {
  packageNames: string[];
  cache: CacheData;
  cachePath: string;
  cacheTtlMs: number;
  logger: ReturnType<typeof createLogger>;
}): Promise<void> {
  const { packageNames, cache, cachePath, cacheTtlMs, logger } = params;
  const now = Date.now();

  const uncached: string[] = [];
  for (const packageName of packageNames) {
    const cacheEntry = cache.osv[packageName];
    const isValid = cacheEntry != null && now - Number(cacheEntry.cachedAt || 0) <= cacheTtlMs;
    if (!isValid) {
      uncached.push(packageName);
    }
  }

  if (uncached.length) {
    const fetched = await fetchOsvBatch(uncached);
    for (const packageName of uncached) {
      cache.osv[packageName] = {
        cachedAt: now,
        vulnerabilities: fetched[packageName] ?? []
      };
    }
    await saveCache(cachePath, cache);
  }

  const findings: string[] = [];
  for (const packageName of packageNames) {
    const vulnerabilities = cache.osv[packageName]?.vulnerabilities ?? [];
    for (const vulnerability of vulnerabilities) {
      findings.push(
        `OSV: ${packageName} affected by ${vulnerability.id ?? 'unknown-id'}${
          vulnerability.summary ? ` (${vulnerability.summary})` : ''
        }`
      );
    }
  }

  if (findings.length) {
    logger.warn(`Live audit findings:\n${findings.map((entry) => `  • ${entry}`).join('\n')}`);
  } else {
    logger.info('Live audit found no known vulnerabilities from OSV.');
  }
}

export default function dependencyGuard(userOptions: DependencyGuardOptions = {}): DependencyGuardPlugin {
  const options = normalizeOptions(userOptions);
  const hashCache = new Map<string, HashCacheEntry>();
  const reportedPhantomDeps = new Set<string>();
  const reportedIntegrityMismatches = new Set<string>();

  let rootDir = process.cwd();
  let viteCommand: 'serve' | 'build' = 'serve';
  let declaredDirectDeps = new Set<string>();
  let packageNamesForChecks: string[] = [];
  let baselinePath = '';
  let baseline: IntegrityBaseline = { files: {} };
  let logger = createLogger({}, options);
  let liveAuditPromise: Promise<void> | null = null;

  return {
    name: 'vite-plugin-dependency-guard',

    async configResolved(config: ViteResolvedConfig): Promise<void> {
      rootDir = config.root ?? process.cwd();
      viteCommand = config.command ?? 'serve';
      logger = createLogger(config, options);

      const packageJsonPath = path.join(rootDir, 'package.json');
      const cachePath = path.join(rootDir, CACHE_RELATIVE_PATH);
      baselinePath = path.join(rootDir, BASELINE_RELATIVE_PATH);

      let packageJson: PackageJson;
      try {
        packageJson = await readJson<PackageJson>(packageJsonPath);
      } catch {
        logger.warn(`No package.json found at ${packageJsonPath}. Skipping dependency checks.`);
        return;
      }

      baseline = options.enableIntegrityCheck ? await loadBaseline(baselinePath) : { files: {} };

      declaredDirectDeps = parseDirectDependencyNames(packageJson);
      const excludeSet = new Set(options.exclude);
      packageNamesForChecks = parsePackageNames(packageJson, options.checkDevDeps).filter(
        (packageName) => !excludeSet.has(packageName)
      );

      if (packageNamesForChecks.length) {
        const cache = await loadCache(cachePath);
        const now = Date.now();
        const allIssues: string[] = [];

        for (const packageName of packageNamesForChecks) {
          const cacheEntry = cache.packages[packageName];
          const isCacheValid =
            cacheEntry != null && now - Number(cacheEntry.cachedAt || 0) <= options.cacheTtlMs;

          let registryData: RegistryData | undefined;
          if (isCacheValid) {
            registryData = cacheEntry.data;
          } else {
            const result = await fetchRegistryPackage(packageName);
            if ('error' in result) {
              allIssues.push(result.error);
              continue;
            }

            registryData = result.data;
            cache.packages[packageName] = {
              cachedAt: now,
              data: registryData
            };
          }

          allIssues.push(...resolveIssues(packageName, registryData, now, options));
        }

        await saveCache(cachePath, cache);

        if (allIssues.length) {
          logger.reportIssues(allIssues);
        } else {
          logger.info(
            `All ${packageNamesForChecks.length} dependencies passed the configured checks.`
          );
        }

        if (options.enableLiveAudit) {
          liveAuditPromise = runLiveAudit({
            packageNames: packageNamesForChecks,
            cache,
            cachePath,
            cacheTtlMs: options.cacheTtlMs,
            logger
          }).catch((error) => {
            logger.warn(`Live audit failed: ${(error as Error).message}`);
          });
        }
      } else {
        logger.info('No dependencies to check.');
      }
    },

    resolveId(source: string): null {
      if (!options.detectPhantomDependencies) {
        return null;
      }

      const packageName = extractPackageName(source);
      if (!packageName || NODE_BUILTINS.has(packageName) || options.exclude.includes(packageName)) {
        return null;
      }

      if (!declaredDirectDeps.has(packageName) && !reportedPhantomDeps.has(packageName)) {
        reportedPhantomDeps.add(packageName);
        logger.warn(
          `Phantom dependency detected: ${packageName} is imported from node_modules but is not declared in dependencies/peerDependencies.`
        );
      }

      return null;
    },

    async load(id: string): Promise<null> {
      if (!options.enableIntegrityCheck || !isNodeModuleFile(id)) {
        return null;
      }

      const hashData = await computeFileHash(id, options.integrityMaxFileSizeBytes, hashCache);
      if (!hashData) {
        return null;
      }

      const baselineKey = normalizeFileKey(rootDir, id);
      const currentEntry = baseline.files[baselineKey];
      if (!currentEntry) {
        baseline.files[baselineKey] = {
          hash: hashData.hash,
          size: hashData.size
        };
        await saveBaseline(baselinePath, baseline);
        return null;
      }

      if (currentEntry.hash !== hashData.hash && !reportedIntegrityMismatches.has(baselineKey)) {
        reportedIntegrityMismatches.add(baselineKey);
        logger.reportIssues([
          `Integrity mismatch for ${baselineKey}: hash changed since baseline. Possible local node_modules tampering.`
        ]);
      }

      return null;
    },

    async buildStart(): Promise<void> {
      if (options.waitForAuditOnBuild && viteCommand === 'build' && liveAuditPromise) {
        await liveAuditPromise;
      }
    }
  };
}
