import { saveCache } from './cache-files.js';
import { isCacheEntryValid } from './integrity.js';
import type { CacheData, GuardLogger, OsvVulnerability } from './types.js';

function osvHyperlink(id: string): string {
  const url = `https://osv.dev/vulnerability/${id}`;
  // OSC 8 terminal hyperlink – works in iTerm2, GNOME Terminal, Windows Terminal, etc.
  return `\x1b]8;;${url}\x1b\\${id}\x1b]8;;\x1b\\`;
}

async function fetchOsvBatch(
  packages: Array<{ name: string; version?: string }>
): Promise<Record<string, OsvVulnerability[]>> {
  if (!packages.length) {
    return {};
  }

  const response = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      queries: packages.map(({ name, version }) => {
        const query: Record<string, unknown> = {
          package: {
            name,
            ecosystem: 'npm'
          }
        };
        if (version) {
          query.version = version;
        }
        return query;
      })
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
  for (let index = 0; index < packages.length; index += 1) {
    const key = packages[index].version
      ? `${packages[index].name}@${packages[index].version}`
      : packages[index].name;
    resultMap[key] = results[index]?.vulns ?? [];
  }

  return resultMap;
}

export async function runLiveAudit(params: {
  packageNames: string[];
  installedVersions: Map<string, string>;
  cache: CacheData;
  cachePath: string;
  cacheTtlMs: number;
  disableCache: boolean;
  logger: GuardLogger;
}): Promise<void> {
  const { packageNames, installedVersions, cache, cachePath, cacheTtlMs, disableCache, logger } = params;
  const now = Date.now();

  const uncached: Array<{ name: string; version?: string }> = [];
  if (disableCache) {
    for (const name of packageNames) {
      uncached.push({ name, version: installedVersions.get(name) });
    }
  } else {
    for (const name of packageNames) {
      const version = installedVersions.get(name);
      const cacheKey = version ? `${name}@${version}` : name;
      const cacheEntry = cache.osv[cacheKey];
      const isValid = cacheEntry != null && isCacheEntryValid(cacheEntry.cachedAt, now, cacheTtlMs);
      if (!isValid) {
        uncached.push({ name, version });
      }
    }
  }

  const fetchedWithoutCache: Record<string, OsvVulnerability[]> = {};
  if (uncached.length) {
    const fetched = await fetchOsvBatch(uncached);

    if (disableCache) {
      for (const { name, version } of uncached) {
        const key = version ? `${name}@${version}` : name;
        fetchedWithoutCache[key] = fetched[key] ?? [];
      }
    } else {
      for (const { name, version } of uncached) {
        const key = version ? `${name}@${version}` : name;
        cache.osv[key] = {
          cachedAt: now,
          vulnerabilities: fetched[key] ?? []
        };
      }
      await saveCache(cachePath, cache);
    }
  }

  const findings: string[] = [];
  for (const name of packageNames) {
    const version = installedVersions.get(name);
    const cacheKey = version ? `${name}@${version}` : name;
    const vulnerabilities = disableCache
      ? fetchedWithoutCache[cacheKey] ?? []
      : cache.osv[cacheKey]?.vulnerabilities ?? [];
    const label = version ? `${name}@${version}` : name;
    for (const vulnerability of vulnerabilities) {
      const vulnId = vulnerability.id ?? 'unknown-id';
      const idPart = vulnerability.id ? osvHyperlink(vulnId) : vulnId;
      findings.push(
        `OSV: ${label} affected by ${idPart}${vulnerability.summary ? ` – ${vulnerability.summary}` : ''}`
      );
    }
  }

  if (findings.length) {
    logger.warn(`Live audit findings:\n${findings.map((entry) => `  • ${entry}`).join('\n')}`);
  } else {
    logger.info('Live audit found no known vulnerabilities from OSV.');
  }
}
