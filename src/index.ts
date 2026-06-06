import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ansi = {
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DependencyGuardOptions {
  behavior?: 'warn' | 'error';
  minAgeDays?: number;
  maxUnmaintainedYears?: number;
  exclude?: string[];
  checkDevDeps?: boolean;
  cacheTtlMs?: number;
}

export const DEFAULT_OPTIONS: Required<DependencyGuardOptions> = {
  behavior: 'warn',
  minAgeDays: 3,
  maxUnmaintainedYears: 2,
  exclude: [],
  checkDevDeps: true,
  cacheTtlMs: DAY_MS
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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

interface CacheData {
  packages: Record<string, CacheEntry>;
}

interface ViteLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

interface ViteResolvedConfig {
  root?: string;
  logger?: ViteLogger;
}

interface DependencyGuardPlugin {
  name: string;
  configResolved(config: ViteResolvedConfig): Promise<void>;
}

const CACHE_RELATIVE_PATH = path.join(
  'node_modules',
  '.cache',
  'vite-plugin-dependency-guard',
  'cache.json'
);

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
      packages: cache.packages ?? {}
    };
  } catch {
    return { packages: {} };
  }
}

async function saveCache(cacheFile: string, cache: CacheData): Promise<void> {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
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

export default function dependencyGuard(userOptions: DependencyGuardOptions = {}): DependencyGuardPlugin {
  const options = normalizeOptions(userOptions);

  return {
    name: 'vite-plugin-dependency-guard',
    async configResolved(config: ViteResolvedConfig): Promise<void> {
      const rootDir = config.root ?? process.cwd();
      const logger = createLogger(config, options);
      const packageJsonPath = path.join(rootDir, 'package.json');
      const cachePath = path.join(rootDir, CACHE_RELATIVE_PATH);

      let packageJson: PackageJson;
      try {
        packageJson = await readJson<PackageJson>(packageJsonPath);
      } catch {
        logger.warn(`No package.json found at ${packageJsonPath}. Skipping dependency checks.`);
        return;
      }

      const excludeSet = new Set(options.exclude);
      const packageNames = parsePackageNames(packageJson, options.checkDevDeps).filter(
        (packageName) => !excludeSet.has(packageName)
      );

      if (!packageNames.length) {
        logger.info('No dependencies to check.');
        return;
      }

      const cache = await loadCache(cachePath);
      const now = Date.now();
      const allIssues: string[] = [];

      for (const packageName of packageNames) {
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
        logger.info(`All ${packageNames.length} dependencies passed the configured checks.`);
      }
    }
  };
}
