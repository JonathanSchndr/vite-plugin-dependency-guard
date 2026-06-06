import type { DependencyGuardOptions, GuardLogger, ViteResolvedConfig } from './types.js';

const ansi = {
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`
};

export function createLogger(
  config: ViteResolvedConfig,
  options: Required<DependencyGuardOptions>
): GuardLogger {
  const log = config.logger;
  const prefix = ansi.bold(ansi.cyan('[vite-plugin-dependency-guard]'));

  return {
    info(message: string) {
      log?.info?.(`${prefix} ${message}`);
    },
    warn(message: string) {
      log?.warn?.(`${prefix} ${ansi.yellow(message)}`);
    },
    error(message: string) {
      log?.error?.(`${prefix} ${ansi.red(message)}`);
    },
    reportIssues(messages: string[]) {
      const block = messages.map((line) => `  • ${line}`).join('\n');
      const text = `Dependency risks detected:\n${block}`;
      if (options.behavior === 'error') {
        this.error(text);
        throw new Error(text);
      }
      this.warn(text);
    }
  };
}
