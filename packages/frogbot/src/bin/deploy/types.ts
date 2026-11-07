import type { SanitizedConfig } from 'payload';

/** The questions a deploy can ask; only called when `flags.interactive` is true. */
export type DeployPrompts = {
  confirm: (message: string) => Promise<boolean>;
  select: (message: string, options: { value: string; label: string }[]) => Promise<string>;
  /** Every option starts ticked. */
  multiselect: (message: string, options: { value: string; label: string }[]) => Promise<string[]>;
};

/** The environment a deploy reads: `process.env`, or a test's own values. */
export type DeployEnv = Record<string, string | undefined>;

/** The parts of Payload's sanitized config a deploy reads, built without connecting to the database. */
export type DeployConfig = Pick<SanitizedConfig, 'collections' | 'db'> &
  Partial<Pick<SanitizedConfig, 'jobs'>>;

export type DeployExecOptions = {
  /** Written to the command's stdin, so secret values never appear in its arguments. */
  input?: string;
  cwd?: string;
  /** Receives the command's output as it arrives. */
  onOutput?: (text: string) => void;
};

export type DeployRunOptions = DeployExecOptions & {
  /** Values shown as `••••` when the command is printed. */
  mask?: string[];
  /** Keeps the command's output off the terminal, for output that holds a secret. */
  quiet?: boolean;
};

export type DeployExecResult = { code: number; stdout: string; stderr: string };

/** Everything a deploy touches outside the app folder, so tests can drive it with fakes. */
export type DeployIO = {
  /** How the command was run, for usage lines, such as `frogbot`. */
  program: string;
  cwd: string;
  env: DeployEnv;
  stdout: { write: (text: string) => unknown };
  stderr: { write: (text: string) => unknown };
  /** Both stdin and stdout are terminals, so a person can answer. */
  isTTY: boolean;
  prompts: DeployPrompts;
  openBrowser: (url: string) => void;
  /** Waits between polls. */
  wait: (ms: number) => Promise<unknown>;
  loadConfig: (root: string) => Promise<DeployConfig>;
  /** Runs a program and resolves with its exit code and output; never throws for a non-zero exit. */
  exec: (command: string, args: string[], options?: DeployExecOptions) => Promise<DeployExecResult>;
  /** Whether `command` is on `PATH`. */
  which: (command: string) => Promise<boolean>;
};

/** One reason a deploy can't start, printed with every other one before anything runs. */
export type PreflightIssue = {
  /** Stable, for scripts reading `--json`: `MIGRATIONS_NOT_WIRED`, `NOT_LOGGED_IN`. */
  code: string;
  message: string;
  /** What to run or change. */
  fix: string;
};

/** The flags every target takes. */
export type DeployFlags = {
  /** `--dry-run`: print the files and commands in order, change nothing. */
  dryRun: boolean;
  /** `--json`: one result object on stdout, everything else on stderr. */
  json: boolean;
  /** False with `--no-interactive` or without a terminal; prompts are never called then. */
  interactive: boolean;
};

/** What a target's `preflight` and `run` receive. */
export type DeployContext = {
  /** The app's folder: where `frogbot.config.*` lives, or its parent when that is `src/`. */
  root: string;
  config: DeployConfig;
  flags: DeployFlags;
  /** The arguments left after the shared flags, for the target to parse. */
  args: string[];
  /** The app's production variables: `--env-file`, or the `.env` files `frogbot start` loads. */
  env: Record<string, string>;
  io: DeployIO;
  /** Prints one line: stdout, or stderr with `--json`. */
  log: (line: string) => void;
  /** Runs a command that changes something; with `--dry-run` it prints the command instead. Throws on a non-zero exit. */
  run: (command: string, args: string[], options?: DeployRunOptions) => Promise<DeployExecResult>;
  /** Writes a file in the app; with `--dry-run` it prints the path instead. */
  writeFile: (path: string, contents: string) => Promise<void>;
};

/** Where `frogbot deploy <name>` sends an app. Core ships `docker`, `fly`, `gcp`, `aws` and `azure`; plugins add more through `cli.deployTargets`. */
export type DeployTarget = {
  /** One line for the target list. */
  describe: string;
  /** Returns every reason the deploy can't start; must not change anything. */
  preflight: (context: DeployContext) => PreflightIssue[] | Promise<PreflightIssue[]>;
  /** Deploys. Its result goes in `--json` output's `result`. */
  run: (context: DeployContext) => unknown;
};
