# vite-plugin-dependency-guard

`vite-plugin-dependency-guard` scans your project dependencies when Vite starts and helps surface common risk patterns in your dependency tree.

## Why this plugin?

Modern frontend projects rely heavily on third-party packages. This plugin helps you spot:

- **Supply-chain risk windows** from extremely fresh releases (possible zero-day compromise windows)
- **Zombie/unmaintained packages** that have not seen a release in years
- **Potential typosquatting indicators** by making dependency checks visible during startup

It does not replace tools like `npm audit`, but adds an additional early warning layer directly inside your Vite workflow.

## Installation

```bash
npm install --save-dev vite-plugin-dependency-guard
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

## Cache behavior

Registry responses are cached in:

```txt
node_modules/.cache/vite-plugin-dependency-guard/cache.json
```

Each package entry is considered valid for 24 hours by default.

## Compatibility

- Node.js `>=18`
- Vite `^4 || ^5 || ^6 || ^7`

## License

MIT
