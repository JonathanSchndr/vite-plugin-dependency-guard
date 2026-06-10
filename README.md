# vite-plugin-dependency-guard

[![npm version](https://img.shields.io/npm/v/vite-plugin-dependency-guard?logo=npm)](https://www.npmjs.com/package/vite-plugin-dependency-guard)
[![npm downloads](https://img.shields.io/npm/dm/vite-plugin-dependency-guard?logo=npm)](https://www.npmjs.com/package/vite-plugin-dependency-guard)
[![Build](https://img.shields.io/github/actions/workflow/status/JonathanSchndr/vite-plugin-dependency-guard/publish.yml?branch=main&label=build)](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/actions/workflows/publish.yml)
[![License](https://img.shields.io/npm/l/vite-plugin-dependency-guard)](https://www.npmjs.com/package/vite-plugin-dependency-guard)

> **Proactive supply-chain security for your Vite projects**

`vite-plugin-dependency-guard` monitors your project dependencies at build time with multiple security layers. It automatically detects supply-chain risks, maintenance issues, tampering attempts, and known vulnerabilities — all integrated directly into your Vite development workflow.

## Why this plugin?

Modern frontend projects rely heavily on third-party packages. Managing dependency security across an entire project tree is complex. This plugin acts as an automated quality gate that runs during `vite dev/build` and (through Nuxt's Vite integration) `nuxt dev/build`, helping you catch issues early without replacing traditional tools like `npm audit`.

Think of it as **continuous dependency monitoring** — like having a security checkpoint integrated into your development loop.


## Features

The plugin performs **6 independent security checks** on your dependency tree:

### 1. **Fresh Release Detection** 🆕
Detects newly published package versions to identify potential zero-day compromise windows. Brand-new releases are more likely to contain unvetted code.

- **What it checks:** Release age (how many days old is the latest version?)
- **Default threshold:** 3 days
- **When useful:** Catching compromised packages moments after being published to npm

### 2. **Unmaintained Package Detection** 🏚️
Flags packages that haven't received updates in a long time, indicating potential abandonment or stale dependencies.

- **What it checks:** Days since the last release
- **Default threshold:** 2 years without an update
- **When useful:** Finding deprecated packages before they become a compliance or security risk

### 3. **NPM Registry Availability** 🌐
Reports connection failures or missing packages when querying the npm registry, alerting you to network issues or typos in dependency names.

- **What it checks:** HTTP response status from npm registry
- **Reports:** 404 errors (package not found), network timeouts, etc.
- **When useful:** Catching misconfigured or misnamed dependencies during development

### 4. **Phantom Dependency Detection** 👻
Warns when code imports packages that are NOT explicitly declared in your `package.json` dependencies or peerDependencies. These transitive imports can break unexpectedly during upgrades.

- **What it checks:** Imports (`import "packageName"`) against declared dependencies
- **Scope:** Tracks direct imports, not nested transitive imports
- **When useful:** Catching implicit dependencies that cause "works on my machine" issues

### 5. **File Integrity Baselines** 🔐
Detects tampering or unexpected modifications in imported `node_modules` files by comparing SHA-256 hashes against a stored baseline. Useful for detecting supply-chain attacks or local corruption.

- **What it checks:** SHA-256 hash of every imported file from `node_modules`
- **Storage:** `.cache/vite-plugin-dependency-guard/integrity-baseline.json`
- **When useful:** Detecting if a malicious package, npm hijack, or local issue modified your dependencies
- **First run:** Baseline is automatically created on first load
- **Subsequent runs:** Hashes are verified; mismatches trigger warnings

### 6. **OSV Live Vulnerability Audit** ⚠️
Queries the Open Source Vulnerability (OSV) database for known CVEs and security advisories affecting your dependencies. Runs asynchronously in the background by default.

- **What it checks:** Known vulnerabilities from [osv.dev](https://osv.dev)
- **Ecosystem:** npm packages
- **Caching:** Results cached for 24 hours to avoid API rate limits
- **Block behavior:** Does NOT block `vite serve` by default (use `waitForAuditOnBuild: true` to block `vite build`)
- **When useful:** Real-time security scanning without depending on external tools

---

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
      // Error handling
      behavior: 'error',
      
      // Fresh release detection
      minAgeDays: 7,
      
      // Maintenance checks
      maxUnmaintainedYears: 1,
      
      // Exclusions
      exclude: ['vite', '@types/node'],
      
      // Dependency scope
      checkDevDeps: true,
      
      // Caching
      cacheTtlMs: 24 * 60 * 60 * 1000,
      disableCache: false,
      
      // Phantom dependency detection
      detectPhantomDependencies: true,
      
      // File integrity checks
      enableIntegrityCheck: true,
      integrityMaxFileSizeBytes: 2 * 1024 * 1024,
      
      // OSV vulnerability audit
      enableLiveAudit: true,
      waitForAuditOnBuild: false
    })
  ]
});
```

### Nuxt setup (`nuxt.config.ts`)

```ts
// nuxt.config.ts
import dependencyGuard from 'vite-plugin-dependency-guard';

export default defineNuxtConfig({
  vite: {
    plugins: [
      dependencyGuard({
        behavior: 'warn',
        minAgeDays: 3
      })
    ]
  }
});
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| **Error Handling** | | | |
| `behavior` | `'warn' \| 'error'` | `'warn'` | `warn`: log findings to console<br/>`error`: fail the build with exit code 1 |
| **Fresh Release Detection** | | | |
| `minAgeDays` | `number` | `3` | Minimum age (in days) for new package releases. Releases younger than this trigger a warning. |
| **Maintenance Checks** | | | |
| `maxUnmaintainedYears` | `number` | `2` | Maximum time (in years) without a release before a package is flagged as unmaintained. |
| **Exclusions** | | | |
| `exclude` | `string[]` | `[]` | Package names to exclude from all checks (supports both `name` and `@scope/name` format). |
| **Dependency Scope** | | | |
| `checkDevDeps` | `boolean` | `true` | Include `devDependencies` in checks. If `false`, only checks `dependencies`. |
| **Caching** | | | |
| `cacheTtlMs` | `number` | `86400000` (24h) | Cache validity duration in milliseconds. Registry and OSV responses are cached locally for this period. |
| `disableCache` | `boolean` | `false` | Completely disable Registry and OSV cache reads/writes. When `true`, `cacheTtlMs` is ignored and fresh data is fetched on every run. |
| **Phantom Dependency Detection** | | | |
| `detectPhantomDependencies` | `boolean` | `true` | Enable detection of undeclared transitive imports. |
| **File Integrity Checks** | | | |
| `enableIntegrityCheck` | `boolean` | `true` | Enable SHA-256 hash baseline checking for imported `node_modules` files. |
| `integrityMaxFileSizeBytes` | `number` | `2097152` (2MB) | Skip hashing for files larger than this size. |
| **OSV Audit** | | | |
| `enableLiveAudit` | `boolean` | `true` | Enable asynchronous OSV.dev vulnerability checks. |
| `waitForAuditOnBuild` | `boolean` | `false` | Block `vite build` until OSV audit completes. If `false`, audit runs in background and `build` proceeds. |

## Cache Management

The plugin uses local caching to avoid repeated registry/API requests:

Set `disableCache: true` to bypass this cache completely.

### Registry & OSV Cache
```
node_modules/.cache/vite-plugin-dependency-guard/cache.json
```
- Stores npm registry metadata and OSV vulnerability data
- Each entry cached for `cacheTtlMs` (default: 24 hours)
- Automatically invalidated and refreshed when TTL expires
- Cleared on `npm install` / `pnpm install`

### Integrity Baseline
```
node_modules/.cache/vite-plugin-dependency-guard/integrity-baseline.json
```
- Stores SHA-256 hashes of imported `node_modules` files
- Created automatically on first plugin load
- Persists across cache clears (intentionally)
- To regenerate baseline, manually delete this file:
  ```bash
  rm node_modules/.cache/vite-plugin-dependency-guard/integrity-baseline.json
  ```

## Behavior & Output

### During `vite dev` / `nuxt dev` (development)
- All 6 checks run synchronously during Vite startup
- Fresh release, maintenance, registry, and phantom dependency issues are reported immediately
- OSV audit runs asynchronously in the background by default
- Does not block the dev server from starting

### During `vite build` / `nuxt build` (production)
- All 6 checks run as configured
- By default (`waitForAuditOnBuild: false`), OSV audit runs in background; build proceeds
- With `waitForAuditOnBuild: true`, build waits for audit to complete before exiting
- If `behavior: 'error'`, any issue will fail the build with exit code 1

### Example Console Output
```
✓ All 42 dependencies passed the configured checks.
(Live audit found no known vulnerabilities from OSV.)
```

Or with issues:
```
⚠ react@18.0.0 is only 2 days old (minAgeDays=3).
⚠ some-old-package appears unmaintained: last release was 3.2 years ago (maxUnmaintainedYears=2).
⚠ Phantom dependency detected: lodash is imported but is not declared in dependencies/peerDependencies.
⚠ Integrity mismatch for node_modules/package/index.js: hash changed since baseline. Possible local node_modules tampering.
⚠ OSV: react affected by CVE-2024-1234 (XSS vulnerability in event handling)
```

## Use Cases

### 🏢 Enterprise Supply-Chain Security
Integrate into your CI/CD pipeline with `behavior: 'error'` to enforce:
- Minimum release age before internal use
- No unmaintained dependencies
- All packages must have integrity baselines
- Zero known vulnerabilities (OSV audit)

### 👨‍💻 Development Team Alerts
Use with `behavior: 'warn'` as a non-blocking safety net:
- Alert developers to risky package versions during local development
- Warn about transitive imports to catch breaking changes early
- Detect local tampering (integrity checks)

### 📊 Dependency Compliance
Track dependency health metrics:
- How many unmaintained packages in your tree?
- When was each package last updated?
- Which packages have known vulnerabilities?

## Compatibility

- **Node.js**: `>=18.0.0`
- **Vite**: `^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`

## Limitations & Notes

- **OSV audit**: Runs asynchronously in the background by default and does not block `vite serve`. Set `waitForAuditOnBuild: true` if you want `vite build` to wait for completion.
- **Phantom dependencies**: Only detects direct imports, not nested transitive re-exports.
- **Integrity checks**: First run creates the baseline; subsequent runs compare against it. Regenerate the baseline if dependencies are legitimately updated offline.
- **npm registry**: Fresh release detection depends on accurate publish timestamps in the npm registry.

## What This Plugin Does NOT Do

- ❌ Replace `npm audit` (use both together)
- ❌ Check for license compliance
- ❌ Analyze code for security vulnerabilities (only checks known CVEs via OSV)
- ❌ Enforce version constraints beyond age/maintenance
- ❌ Automatically update or pin dependencies


## License

MIT
