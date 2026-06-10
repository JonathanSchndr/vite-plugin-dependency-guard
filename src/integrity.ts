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

export function sanitizeModuleFilePath(filePath: string): string {
  const queryIndex = filePath.indexOf('?');
  const hashIndex = filePath.indexOf('#');
  const suffixIndex =
    queryIndex === -1
      ? hashIndex
      : hashIndex === -1
        ? queryIndex
        : Math.min(queryIndex, hashIndex);

  return suffixIndex === -1 ? filePath : filePath.slice(0, suffixIndex);
}

export function isCacheEntryValid(cachedAt: number | undefined, now: number, ttlMs: number): boolean {
  return typeof cachedAt === 'number' && cachedAt <= now && now - cachedAt <= ttlMs;
}

export function isVirtualModule(filePath: string): boolean {
  return filePath.startsWith('\0');
}

export function isNodeModuleFile(filePath: string): boolean {
  const sanitized = sanitizeModuleFilePath(filePath);
  return !isVirtualModule(sanitized) && sanitized.includes(`${path.sep}node_modules${path.sep}`);
}

export async function computeFileHash(
  filePath: string,
  maxFileSizeBytes: number,
  hashCache: Map<string, HashCacheEntry>
): Promise<{ hash: string; size: number } | null> {
  const resolvedFilePath = sanitizeModuleFilePath(filePath);
  const fileStat = await stat(resolvedFilePath);

  if (!fileStat.isFile() || fileStat.size > maxFileSizeBytes) {
    return null;
  }

  const cached = hashCache.get(resolvedFilePath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return { hash: cached.hash, size: cached.size };
  }

  const content = await readFile(resolvedFilePath);
  const hash = createHash('sha256').update(content).digest('hex');

  hashCache.set(resolvedFilePath, {
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    hash
  });

  return { hash, size: fileStat.size };
}
