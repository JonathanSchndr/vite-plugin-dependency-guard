# Changelog

## [1.2.5](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.2.4...v1.2.5) (2026-06-10)


### Bug Fixes

* skip Vite virtual modules in integrity checks ([48e1f09](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/48e1f095eebacc118851a7bd3c2d7b82f8a35fbc))
* skip Vite virtual modules with null-byte prefix in integrity checks ([926f13c](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/926f13c9767926b1df9dd769f539134b5a36a849))

## [1.2.4](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.2.3...v1.2.4) (2026-06-10)


### Bug Fixes

* ignore Vite query suffixes in integrity checks ([89bfe59](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/89bfe599a7f13510f4cdc0d61234f64d656dc142))
* ignore Vite query suffixes in integrity checks ([829c953](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/829c9536746e1b0853a8d4fd466ae73b522ac43d))

## [1.2.3](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.2.2...v1.2.3) (2026-06-10)


### Bug Fixes

* resolve Nuxt app-dir project root ([f9c64e0](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/f9c64e0ceae72c2b7011c124d7ada2c87a80c4b4))
* resolve Nuxt app-dir project root ([d72bd9c](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/d72bd9c0e688413a2dedd67e07652c078d5bf8c7))

## [1.2.2](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.2.1...v1.2.2) (2026-06-10)


### Bug Fixes

* Nuxt compatibility -- bypass Vite logger and fix SSR shared state ([fd71aea](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/fd71aea8a3999da92084bce17a818b7cf8e47aa3))
* Nuxt compatibility — bypass Vite logger, fix SSR shared state ([e896c50](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/e896c501330cc9eaed89533c55cd807e4fd1876d))

## [1.2.1](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.2.0...v1.2.1) (2026-06-10)


### Bug Fixes

* Nuxt/nuxi compat, Vite 8 support, OSV version-filtered findings with terminal links ([233ea7e](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/233ea7e901f46037ed8bfeb1e6e1843aef4399ea))
* Nuxt/nuxi compat, Vite 8 support, OSV version-filtered findings with terminal links ([d4fe689](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/d4fe689ebe8038073799b1e69cae663f4d4e2ad5))

## [1.2.0](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.1.1...v1.2.0) (2026-06-10)


### Features

* Run dependency guard only for Vite/Nuxt dev and build ([f3ee365](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/f3ee36509a557c32982ab4a26f01a0495a2ba292))

## [1.1.1](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.1.0...v1.1.1) (2026-06-10)


### Bug Fixes

* include all build artifacts required by Nuxt runtime import ([981f923](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/981f9239598d4d445223f45576f80f3faa9135e0))
* include all dist modules in published package ([16e725f](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/16e725fe460def174a7f765a10560f06065eec40))

## [1.1.0](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.0.2...v1.1.0) (2026-06-06)


### Features

* add phantom dependency, integrity, and OSV audit checks ([fdbcc8c](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/fdbcc8c2f08b5bcaafee54c990e95778c3665565))

## [1.0.2](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.0.1...v1.0.2) (2026-06-06)


### Bug Fixes

* remove --provenance from pnpm publish commands ([f20da9b](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/f20da9ba20c2b38e67ca6ccd31cbf95fce11a780))
* remove --provenance from pnpm publish to unblock CI publishing ([dfef606](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/dfef60670221100492b6bda237b5b4b48800689f))

## [1.0.1](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/compare/v1.0.0...v1.0.1) (2026-06-06)


### Bug Fixes

* bump Node.js to v22 in publish workflows for pnpm v11 compatibility ([42167d9](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/42167d90ecc646adb547c2e20ecc0fec08c3546e))
* bump Node.js to v22 in publish workflows for pnpm v11 compatibility ([153b794](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/153b794c28f0a572aa5074063199223bd5b835c0))

## 1.0.0 (2026-06-06)


### Features

* implement dependency guard vite plugin package ([53a6768](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/53a67688cfe677b9ee72f56737a091784b2289fa))
* Migrate plugin source to TypeScript and enforce pnpm-only lockfile workflow ([21ccf95](https://github.com/JonathanSchndr/vite-plugin-dependency-guard/commit/21ccf95521960e17e01b128a4b74f9872bc476e4))
