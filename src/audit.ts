import { saveCache } from './cache-files.js';
import { isCacheEntryValid } from './integrity.js';
import type { CacheData, GuardLogger, OsvVulnerability } from './types.js';

async function fetchOsvBatch(packageNames: string[]): Promise<Record<string, OsvVulnerability[]>> {
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
  const results = json.results ?? [];
  for (let index = 0; index < packageNames.length; index += 1) {
    const packageName = packageNames[index];
    if (!packageName) {
      continue;
    }
    resultMap[packageName] = results[index]?.vulns ?? [];
  }

  return resultMap;
}

export async function runLiveAudit(params: {
  packageNames: string[];
  cache: CacheData;
  cachePath: string;
  cacheTtlMs: number;
  logger: GuardLogger;
}): Promise<void> {
  const { packageNames, cache, cachePath, cacheTtlMs, logger } = params;
  const now = Date.now();

  const uncached: string[] = [];
  for (const packageName of packageNames) {
    const cacheEntry = cache.osv[packageName];
    const isValid = cacheEntry != null && isCacheEntryValid(cacheEntry.cachedAt, now, cacheTtlMs);
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
