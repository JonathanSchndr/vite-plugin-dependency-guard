# vite-plugin-dependency-guard

`vite-plugin-dependency-guard` scans your project dependencies when Vite starts and helps surface common risk patterns in your dependency tree.

## Why this plugin?

Modern frontend projects rely heavily on third-party packages. This plugin helps you spot:

- **Supply-chain risk windows** from extremely fresh releases (possible zero-day compromise windows)
- **Zombie/unmaintained packages** that have not seen a release in years
- **Potential typosquatting indicators** by making dependency checks visible during startup

It does not replace tools like `npm audit`, but adds an additional early warning layer directly inside your Vite workflow.

It now also adds:

- **Phantom dependency detection** for undeclared transitive imports from `node_modules`
- **Integrity baseline checks** for imported `node_modules` files (SHA-256)
- **Background OSV live audits** with cached, non-blocking vulnerability lookups

## Installation

```bash
pnpm add -D vite-plugin-dependency-guard
```

## Usage

### Minimal setup

```js
// vite.config.js
import { defineConfig } from 'vite';
import dependencyGuard from 'vite-plugin-dependency-guard';

export default defineConfig({
  plugins: [dependencyGuard()]
});
```

### Advanced setup

```js
// vite.config.js
import { defineConfig } from 'vite';
import dependencyGuard from 'vite-plugin-dependency-guard';

export default defineConfig({
  plugins: [
    dependencyGuard({
      behavior: 'error',
      minAgeDays: 7,
      maxUnmaintainedYears: 1,
      exclude: ['vite', '@types/node'],
      checkDevDeps: true,
      cacheTtlMs: 24 * 60 * 60 * 1000
    })
  ]
});
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `behavior` | `'warn' \| 'error'` | `'warn'` | `warn`: log findings, `error`: fail hard (throws) |
| `minAgeDays` | `number` | `3` | Cooldown period for very new releases |
| `maxUnmaintainedYears` | `number` | `2` | Marks packages as unmaintained after this threshold |
| `exclude` | `string[]` | `[]` | Package names to ignore |
| `checkDevDeps` | `boolean` | `true` | Include `devDependencies` in checks |
| `cacheTtlMs` | `number` | `24 * 60 * 60 * 1000` | Cache validity duration |
| `detectPhantomDependencies` | `boolean` | `true` | Warn when imported packages are not in root `dependencies`/`peerDependencies` |
| `enableIntegrityCheck` | `boolean` | `true` | Enable hash baseline checks for imported files from `node_modules` |
| `integrityMaxFileSizeBytes` | `number` | `2 * 1024 * 1024` | Skip hashing files larger than this limit |
| `enableLiveAudit` | `boolean` | `true` | Run asynchronous OSV.dev vulnerability checks |
| `waitForAuditOnBuild` | `boolean` | `false` | Wait for OSV audit completion during `vite build` |

## Cache behavior

Registry and OSV responses are cached in:

```txt
node_modules/.cache/vite-plugin-dependency-guard/cache.json
```

Each package entry is considered valid for 24 hours by default.

Integrity baselines for imported `node_modules` files are stored in:

```txt
node_modules/.cache/vite-plugin-dependency-guard/integrity-baseline.json
```

The plugin keeps computed hashes in memory during the Vite process to avoid repeated hashing during HMR.

## Compatibility

- Node.js `>=18`
- Vite `^4 || ^5 || ^6 || ^7`

## License

MIT
