export type ConfigIssueCode = 'INVALID_CRON' | 'UNKNOWN_TASK';

/** A config error with a stable `code` and the config `path` it points at, for `frogbot check`. */
export class ConfigIssueError extends Error {
  code: ConfigIssueCode;
  path: string;

  constructor(
    { code, message, path }: { code: ConfigIssueCode; message: string; path: string },
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = 'ConfigIssueError';
    this.code = code;
    this.path = path;
  }
}
