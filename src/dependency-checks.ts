import { DAY_MS } from './constants.js';
import type { DependencyGuardOptions, PackageJson, RegistryData } from './types.js';

export function parsePackageNames(packageJson: PackageJson, checkDevDeps: boolean): string[] {
  const names = new Set(Object.keys(packageJson.dependencies ?? {}));

  if (checkDevDeps) {
    for (const dependency of Object.keys(packageJson.devDependencies ?? {})) {
      names.add(dependency);
    }
  }

  return [...names];
}

export function parseDirectDependencyNames(packageJson: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {})
  ]);
}

function parseDate(value: string | null | undefined): number | null {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getLatestPublishDate(registryData: RegistryData | undefined): Date | null {
  const allTimestamps = Object.entries(registryData?.time ?? {})
    .filter(([key]) => key !== 'created' && key !== 'modified')
    .map(([, value]) => parseDate(value))
    .filter((value): value is number => value !== null);

  if (!allTimestamps.length) {
    return null;
  }

  return new Date(Math.max(...allTimestamps));
}

export function resolveIssues(
  packageName: string,
  registryData: RegistryData | undefined,
  now: number,
  options: Required<DependencyGuardOptions>
): string[] {
  const issues: string[] = [];
  const latestTag = registryData?.['dist-tags']?.latest;
  const latestReleaseDateRaw = latestTag ? registryData?.time?.[latestTag] : null;
  const latestReleaseDate = parseDate(latestReleaseDateRaw);

  if (latestReleaseDate !== null) {
    const ageMs = now - latestReleaseDate;

    if (ageMs < options.minAgeDays * DAY_MS) {
      const ageDays = Math.max(0, Math.floor(ageMs / DAY_MS));
      issues.push(`${packageName}@${latestTag} is only ${ageDays} days old (minAgeDays=${options.minAgeDays}).`);
    }
  }

  const latestPublishedAt = getLatestPublishDate(registryData);
  if (latestPublishedAt) {
    const unmaintainedMs = now - latestPublishedAt.getTime();
    const thresholdMs = options.maxUnmaintainedYears * 365 * DAY_MS;
    if (unmaintainedMs > thresholdMs) {
      const years = (unmaintainedMs / (365 * DAY_MS)).toFixed(1);
      issues.push(
        `${packageName} appears unmaintained: last release was ${years} years ago (maxUnmaintainedYears=${options.maxUnmaintainedYears}).`
      );
    }
  }

  return issues;
}

export async function fetchRegistryPackage(
  packageName: string
): Promise<{ data: RegistryData } | { error: string }> {
  const encodedName = packageName
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  const response = await fetch(`https://registry.npmjs.org/${encodedName}`);

  if (!response.ok) {
    if (response.status === 404) {
      return { error: `Package ${packageName} was not found in the npm registry.` };
    }

    return {
      error: `Registry request for ${packageName} failed (HTTP ${response.status}).`
    };
  }

  return { data: (await response.json()) as RegistryData };
}
