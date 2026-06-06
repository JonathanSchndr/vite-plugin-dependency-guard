import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';

import dependencyGuard from './index.js';

function createLoggerCollector() {
  const logs = { info: [], warn: [], error: [] };
  return {
    logs,
    logger: {
      info: (msg) => logs.info.push(msg),
      warn: (msg) => logs.warn.push(msg),
      error: (msg) => logs.error.push(msg)
    }
  };
}

test('warns for very new dependency releases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { example: '^1.0.0' } }, null, 2),
    'utf8'
  );

  const nowIso = new Date().toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      'dist-tags': { latest: '1.0.0' },
      time: {
        created: nowIso,
        modified: nowIso,
        '1.0.0': nowIso
      }
    })
  });

  try {
    const { logs, logger } = createLoggerCollector();
    const plugin = dependencyGuard({ minAgeDays: 3, behavior: 'warn' });
    await plugin.configResolved({ root, logger });

    assert.equal(logs.warn.length, 1);
    assert.match(logs.warn[0], /Dependency-Risiken gefunden/);

    const cachePath = path.join(
      root,
      'node_modules',
      '.cache',
      'vite-plugin-dependency-guard',
      'cache.json'
    );

    await mkdir(path.dirname(cachePath), { recursive: true });
    const cacheRaw = await readFile(cachePath, 'utf8');
    const cache = JSON.parse(cacheRaw);
    assert.ok(cache.packages.example);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('throws in error mode when risks are found', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { example: '^1.0.0' } }, null, 2),
    'utf8'
  );

  const nowIso = new Date().toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      'dist-tags': { latest: '1.0.0' },
      time: {
        created: nowIso,
        modified: nowIso,
        '1.0.0': nowIso
      }
    })
  });

  try {
    const { logger } = createLoggerCollector();
    const plugin = dependencyGuard({ behavior: 'error', minAgeDays: 10 });

    await assert.rejects(() => plugin.configResolved({ root, logger }), /Dependency-Risiken gefunden/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
