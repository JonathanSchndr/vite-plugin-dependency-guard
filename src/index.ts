import path from 'node:path';

import { runLiveAudit } from './audit.js';
import {
  loadBaseline,
  loadCache,
  readPackageJson,
  saveBaseline,
  saveCache
} from './cache-files.js';
import { BASELINE_RELATIVE_PATH, CACHE_RELATIVE_PATH, NODE_BUILTINS } from './constants.js';
import {
  fetchRegistryPackage,
  parseDirectDependencyNames,
  parsePackageNames,
  resolveIssues
} from './dependency-checks.js';
import {
  computeFileHash,
  extractPackageName,
  isCacheEntryValid,
  isNodeModuleFile,
  normalizeFileKey
} from './integrity.js';
import { createLogger } from './logger.js';
import { DEFAULT_OPTIONS, normalizeOptions } from './options.js';
import type {
  CacheData,
  DependencyGuardOptions,
  DependencyGuardPlugin,
  GuardLogger,
  HashCacheEntry,
  IntegrityBaseline,
  PackageJson
} from './types.js';

export { DEFAULT_OPTIONS };
export type { DependencyGuardOptions };

const SUPPORTED_COMMANDS = new Set(['serve', 'build']);

function hasSupportedCliContext(argv: readonly string[]): boolean {
  const args = argv.map((entry) => entry.toLowerCase());
  const hasVite = args.some((entry) => entry === 'vite' || entry.endsWith('/vite'));
  const hasNuxt = args.some(
    (entry) =>
      entry === 'nuxt' ||
      entry.endsWith('/nuxt') ||
      entry === 'nuxi' ||
      entry.endsWith('/nuxi') ||
      entry === '.bin/nuxi' ||
      entry.endsWith('/.bin/nuxi')
  );
  const hasDevOrBuild = args.some((entry) => entry === 'dev' || entry === 'build');

  return (hasVite || hasNuxt) && hasDevOrBuild;
}

async function resolveInstalledVersions(
  rootDir: string,
  packageNames: string[]
): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  await Promise.all(
    packageNames.map(async (packageName) => {
      try {
        const pkgPath = path.join(rootDir, 'node_modules', packageName, 'package.json');
        const pkg = await readPackageJson<{ version?: string }>(pkgPath);
        if (pkg.version) {
          versions.set(packageName, pkg.version);
        }
      } catch {
        // version stays unknown; OSV query falls back to package-only lookup
      }
    })
  );
  return versions;
}

export default function dependencyGuard(userOptions: DependencyGuardOptions = {}): DependencyGuardPlugin {
  const options = normalizeOptions(userOptions);
  const excludeSet = new Set(options.exclude);
  const hashCache = new Map<string, HashCacheEntry>();
  const reportedPhantomDeps = new Set<string>();
  const reportedIntegrityMismatches = new Set<string>();

  let rootDir = process.cwd();
  let viteCommand = 'serve';
  let shouldRunForCurrentContext = true;
  let declaredDirectDeps = new Set<string>();
  let packageNamesForChecks: string[] = [];
  let baselinePath = '';
  let baseline: IntegrityBaseline = { files: {} };
  let logger: GuardLogger = createLogger({}, options);
  let liveAuditPromise: Promise<void> | null = null;

  return {
    name: 'vite-plugin-dependency-guard',

    async configResolved(config) {
      // Skip SSR builds in frameworks like Nuxt to avoid running checks twice.
      if (config.build?.ssr) {
        shouldRunForCurrentContext = false;
        return;
      }

      rootDir = config.root ?? process.cwd();
      // When frameworks like Nuxt call Vite programmatically the command may be
      // absent from the config object; default to 'serve' so the checks still run.
      viteCommand = config.command ?? 'serve';
      shouldRunForCurrentContext = SUPPORTED_COMMANDS.has(viteCommand) || hasSupportedCliContext(process.argv);
      logger = createLogger(config, options);

      if (!shouldRunForCurrentContext) {
        return;
      }

      const packageJsonPath = path.join(rootDir, 'package.json');
      const cachePath = path.join(rootDir, CACHE_RELATIVE_PATH);
      baselinePath = path.join(rootDir, BASELINE_RELATIVE_PATH);

      let packageJson: PackageJson;
      try {
        packageJson = await readPackageJson<PackageJson>(packageJsonPath);
      } catch {
        logger.warn(`No package.json found at ${packageJsonPath}. Skipping dependency checks.`);
        return;
      }

      baseline = options.enableIntegrityCheck ? await loadBaseline(baselinePath) : { files: {} };

      declaredDirectDeps = parseDirectDependencyNames(packageJson);
      packageNamesForChecks = parsePackageNames(packageJson, options.checkDevDeps).filter(
        (packageName) => !excludeSet.has(packageName)
      );

      if (packageNamesForChecks.length) {
        const cache: CacheData = options.disableCache
          ? { packages: {}, osv: {} }
          : await loadCache(cachePath);
        const now = Date.now();
        const allIssues: string[] = [];

        for (const packageName of packageNamesForChecks) {
          const cacheEntry = cache.packages[packageName];
          const isCacheValid =
            !options.disableCache &&
            cacheEntry != null &&
            isCacheEntryValid(cacheEntry.cachedAt, now, options.cacheTtlMs);

          let registryData;
          if (isCacheValid) {
            registryData = cacheEntry.data;
          } else {
            const result = await fetchRegistryPackage(packageName);
            if ('error' in result) {
              allIssues.push(result.error);
              continue;
            }

            registryData = result.data;
            if (!options.disableCache) {
              cache.packages[packageName] = {
                cachedAt: now,
                data: registryData
              };
            }
          }

          allIssues.push(...resolveIssues(packageName, registryData, now, options));
        }

        if (!options.disableCache) {
          await saveCache(cachePath, cache);
        }

        if (allIssues.length) {
          logger.reportIssues(allIssues);
        } else {
          logger.info(`All ${packageNamesForChecks.length} dependencies passed the configured checks.`);
        }

        if (options.enableLiveAudit) {
          const installedVersions = await resolveInstalledVersions(rootDir, packageNamesForChecks);
          liveAuditPromise = runLiveAudit({
            packageNames: packageNamesForChecks,
            installedVersions,
            cache,
            cachePath,
            cacheTtlMs: options.cacheTtlMs,
            disableCache: options.disableCache,
            logger
          }).catch((error) => {
            logger.warn(`Live audit failed: ${(error as Error).message}`);
          });
        }
      } else {
        logger.info('No dependencies to check.');
      }
    },

    resolveId(source) {
      if (!shouldRunForCurrentContext || !options.detectPhantomDependencies) {
        return null;
      }

      const packageName = extractPackageName(source);
      if (!packageName || NODE_BUILTINS.has(packageName) || excludeSet.has(packageName)) {
        return null;
      }

      if (!declaredDirectDeps.has(packageName) && !reportedPhantomDeps.has(packageName)) {
        reportedPhantomDeps.add(packageName);
        logger.warn(
          `Phantom dependency detected: ${packageName} is imported but is not declared in dependencies/peerDependencies.`
        );
      }

      return null;
    },

    async load(id) {
      if (!shouldRunForCurrentContext || !options.enableIntegrityCheck || !isNodeModuleFile(id)) {
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
          `Integrity mismatch for ${baselineKey}: hash changed since baseline. Possible local node_modules tampering. If this is expected, regenerate the integrity baseline.`
        ]);
      }

      return null;
    },

    async buildStart() {
      if (!shouldRunForCurrentContext) {
        return;
      }

      if (options.waitForAuditOnBuild && viteCommand === 'build' && liveAuditPromise) {
        await liveAuditPromise;
      }
    }
  };
}
