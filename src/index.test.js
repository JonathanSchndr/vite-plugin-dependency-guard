import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';

import dependencyGuard from '../dist/index.js';

const MAX_ASYNC_AUDIT_BLOCK_TIME_MS = 180;
const SIMULATED_AUDIT_DELAY_MS = 200;
const AUDIT_COMPLETION_WAIT_MS = 250;

function createLogCapture() {
  const logs = { info: [], warn: [], error: [] };
  return {
    logs,
    customLogger: {
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
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://registry.npmjs.org/')) {
      return {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.0.0' },
          time: {
            created: nowIso,
            modified: nowIso,
            '1.0.0': nowIso
          }
        })
      };
    }

    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  try {
    const { logs, customLogger } = createLogCapture();
    const plugin = dependencyGuard({ minAgeDays: 3, behavior: 'warn', enableLiveAudit: false, customLogger });
    await plugin.configResolved({ root, command: 'serve' });

    assert.equal(logs.warn.length, 1);
    assert.match(logs.warn[0], /Dependency risks detected/);

    const cachePath = path.join(
      root,
      'node_modules',
      '.cache',
      'vite-plugin-dependency-guard',
      'cache.json'
    );

    const cacheRaw = await readFile(cachePath, 'utf8');
    const cache = JSON.parse(cacheRaw);
    assert.ok(cache.packages.example);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('does not read or write cache when disableCache is enabled', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { example: '^1.0.0' } }, null, 2),
    'utf8'
  );

  const oldIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);

    if (target.startsWith('https://registry.npmjs.org/')) {
      return {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.0.0' },
          time: {
            created: oldIso,
            modified: oldIso,
            '1.0.0': oldIso
          }
        })
      };
    }

    if (target === 'https://api.osv.dev/v1/querybatch') {
      return {
        ok: true,
        json: async () => ({ results: [{ vulns: [] }] })
      };
    }

    throw new Error(`Unexpected URL: ${target}`);
  };

  try {
    const { logs, customLogger } = createLogCapture();
    const plugin = dependencyGuard({
      disableCache: true,
      minAgeDays: 0,
      maxUnmaintainedYears: 5,
      enableLiveAudit: true,
      customLogger
    });
    await plugin.configResolved({ root, command: 'serve' });

    await new Promise((resolve) => setTimeout(resolve, AUDIT_COMPLETION_WAIT_MS));
    assert.ok(logs.info.some((entry) => entry.includes('Live audit found no known vulnerabilities')));

    const cachePath = path.join(
      root,
      'node_modules',
      '.cache',
      'vite-plugin-dependency-guard',
      'cache.json'
    );
    await assert.rejects(() => readFile(cachePath, 'utf8'));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
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
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://registry.npmjs.org/')) {
      return {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.0.0' },
          time: {
            created: nowIso,
            modified: nowIso,
            '1.0.0': nowIso
          }
        })
      };
    }

    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  try {
    const { customLogger } = createLogCapture();
    const plugin = dependencyGuard({
      behavior: 'error',
      minAgeDays: 10,
      enableLiveAudit: false,
      customLogger
    });

    await assert.rejects(
      () => plugin.configResolved({ root, command: 'serve' }),
      /Dependency risks detected/
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('warns about phantom dependencies for undeclared bare imports', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({}, null, 2), 'utf8');

  try {
    const { logs, customLogger } = createLogCapture();
    const plugin = dependencyGuard({ enableLiveAudit: false, customLogger });
    await plugin.configResolved({ root, command: 'serve' });

    plugin.resolveId?.('left-pad');

    assert.equal(logs.warn.length, 1);
    assert.match(logs.warn[0], /Phantom dependency detected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('creates integrity baseline and warns when file hash changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  const moduleFile = path.join(root, 'node_modules', 'example', 'index.js');
  await mkdir(path.dirname(moduleFile), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({}, null, 2), 'utf8');
  await writeFile(moduleFile, 'export default 1;', 'utf8');

  try {
    const { logs, customLogger } = createLogCapture();
    const plugin = dependencyGuard({ enableLiveAudit: false, customLogger });
    await plugin.configResolved({ root, command: 'serve' });

    await plugin.load?.(moduleFile);

    const baselinePath = path.join(
      root,
      'node_modules',
      '.cache',
      'vite-plugin-dependency-guard',
      'integrity-baseline.json'
    );
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    assert.ok(baseline.files['node_modules/example/index.js']);

    await writeFile(moduleFile, 'export default 2;', 'utf8');
    await plugin.load?.(moduleFile);

    assert.equal(logs.warn.length, 1);
    assert.match(logs.warn[0], /Integrity mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('handles node_modules load ids with Vite query strings', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  const moduleFile = path.join(root, 'node_modules', 'example', 'index.vue');
  await mkdir(path.dirname(moduleFile), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({}, null, 2), 'utf8');
  await writeFile(moduleFile, '<template><div /></template>', 'utf8');

  try {
    const { customLogger } = createLogCapture();
    const plugin = dependencyGuard({ enableLiveAudit: false, customLogger });
    await plugin.configResolved({ root, command: 'build' });

    await plugin.load?.(`${moduleFile}?macro=true`);

    const baselinePath = path.join(
      root,
      'node_modules',
      '.cache',
      'vite-plugin-dependency-guard',
      'integrity-baseline.json'
    );
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    assert.ok(baseline.files['node_modules/example/index.vue']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runs OSV live audit asynchronously without blocking configResolved', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { example: '^1.0.0' } }, null, 2),
    'utf8'
  );

  const oldIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);

    if (target.startsWith('https://registry.npmjs.org/')) {
      return {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.0.0' },
          time: {
            created: oldIso,
            modified: oldIso,
            '1.0.0': oldIso
          }
        })
      };
    }

    if (target === 'https://api.osv.dev/v1/querybatch') {
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_AUDIT_DELAY_MS));
      return {
        ok: true,
        json: async () => ({ results: [{ vulns: [] }] })
      };
    }

    throw new Error(`Unexpected URL: ${target}`);
  };

  try {
    const { logs, customLogger } = createLogCapture();
    const plugin = dependencyGuard({ minAgeDays: 0, maxUnmaintainedYears: 5, customLogger });

    const start = Date.now();
    await plugin.configResolved({ root, command: 'serve' });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < MAX_ASYNC_AUDIT_BLOCK_TIME_MS);

    await new Promise((resolve) => setTimeout(resolve, AUDIT_COMPLETION_WAIT_MS));
    assert.ok(logs.info.some((entry) => entry.includes('Live audit found no known vulnerabilities')));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('resolves the project root from a nested Nuxt app directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dep-guard-test-'));
  const appRoot = path.join(root, 'app');
  await mkdir(appRoot, { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ dependencies: { example: '^1.0.0' } }, null, 2),
    'utf8'
  );

  const oldIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://registry.npmjs.org/')) {
      return {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.0.0' },
          time: {
            created: oldIso,
            modified: oldIso,
            '1.0.0': oldIso
          }
        })
      };
    }

    throw new Error(`Unexpected URL: ${String(url)}`);
  };

  try {
    const { logs, customLogger } = createLogCapture();
    const plugin = dependencyGuard({
      minAgeDays: 0,
      maxUnmaintainedYears: 5,
      enableLiveAudit: false,
      enableIntegrityCheck: false,
      customLogger
    });

    await plugin.configResolved({ root: appRoot, command: 'serve' });

    const cachePath = path.join(
      root,
      'node_modules',
      '.cache',
      'vite-plugin-dependency-guard',
      'cache.json'
    );

    const cacheRaw = await readFile(cachePath, 'utf8');
    const cache = JSON.parse(cacheRaw);
    assert.ok(cache.packages.example);
    assert.ok(logs.info.some((entry) => entry.includes('All 1 dependencies passed')));
    assert.equal(logs.warn.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});
