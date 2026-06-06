import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { HashCacheEntry } from './types.js';

export function extractPackageName(source: string): string | null {
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

export function normalizeFileKey(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

export function isCacheEntryValid(cachedAt: number | undefined, now: number, ttlMs: number): boolean {
  return typeof cachedAt === 'number' && cachedAt <= now && now - cachedAt <= ttlMs;
}

export function isNodeModuleFile(filePath: string): boolean {
  return filePath.includes(`${path.sep}node_modules${path.sep}`);
}

export async function computeFileHash(
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
