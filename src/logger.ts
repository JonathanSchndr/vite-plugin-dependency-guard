import type { GuardLogger, ResolvedDependencyGuardOptions } from './types.js';

const ansi = {
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`
};

const PREFIX = ansi.bold(ansi.cyan('[vite-plugin-dependency-guard]'));

export function createLogger(options: ResolvedDependencyGuardOptions): GuardLogger {
  const custom = options.customLogger;

  const doInfo = custom?.info
    ? (msg: string) => custom.info!(msg)
    : (msg: string) => console.info(`${PREFIX} ${msg}`);

  const doWarn = custom?.warn
    ? (msg: string) => custom.warn!(msg)
    : (msg: string) => console.warn(`${PREFIX} ${ansi.yellow(msg)}`);

  const doError = custom?.error
    ? (msg: string) => custom.error!(msg)
    : (msg: string) => console.error(`${PREFIX} ${ansi.red(msg)}`);

  return {
    info: doInfo,
    warn: doWarn,
    error: doError,
    reportIssues(messages: string[]) {
      const block = messages.map((line) => `  • ${line}`).join('\n');
      const text = `Dependency risks detected:\n${block}`;
      if (options.behavior === 'error') {
        doError(text);
        throw new Error(text);
      }
      doWarn(text);
    }
  };
}
