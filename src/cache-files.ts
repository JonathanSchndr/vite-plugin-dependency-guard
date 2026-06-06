import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CacheData, IntegrityBaseline } from './types.js';

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export async function loadCache(cacheFile: string): Promise<CacheData> {
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

export async function saveCache(cacheFile: string, cache: CacheData): Promise<void> {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
}

export async function loadBaseline(filePath: string): Promise<IntegrityBaseline> {
  try {
    const baseline = await readJson<Partial<IntegrityBaseline>>(filePath);
    return {
      files: baseline.files ?? {}
    };
  } catch {
    return { files: {} };
  }
}

export async function saveBaseline(filePath: string, baseline: IntegrityBaseline): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(baseline, null, 2), 'utf8');
}

export async function readPackageJson<T>(filePath: string): Promise<T> {
  return readJson<T>(filePath);
}
